import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { JobsOptions, Queue, Worker } from 'bullmq'
import IORedis from 'ioredis'
import { YtUrlResolver } from '../yt-url-resolver.service'
import { AudioCacheService } from '../../cache/AudioCacheService'
import { HttpStreamClient } from '../HttpStreamClient'
import {
  AudioStreamService,
  PreloadOptions,
  PreloadState,
  StreamOptions,
  StreamResult,
} from '../../../domain/services/audio-stream.service'

interface ResolvedStreamData {
  directUrl: string
  mimeType: string
}

interface PreloadJobData {
  videoIds: string[]
  options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>
}

@Injectable()
export class YtStreamService implements AudioStreamService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YtStreamService.name)

  private readonly cacheTtlMs = 30 * 60 * 1000
  private readonly failedTtlMs = 2 * 60 * 1000
  private readonly warmingTtlMs = 60 * 1000
  private readonly pendingResolves = new Map<string, Promise<ResolvedStreamData>>()
  private readonly failedResolves = new Map<string, number>()
  private readonly queuedResolves = new Map<string, number>()

  private readonly preloadQueueName = 'song-stream-preload'
  private readonly redisStreamCachePrefix = 'stream-cache:'
  private readonly redisPreloadStatePrefix = 'stream-preload-state:'

  private redisConnection?: IORedis
  private preloadQueue?: Queue<PreloadJobData>
  private preloadWorker?: Worker<PreloadJobData>
  private queueEnabled = false

  private streamRequests = 0
  private streamFailures = 0
  private streamTotalLatencyMs = 0
  private preloadRequests = 0
  private preloadEnqueuedJobs = 0
  private preloadFailures = 0

  constructor(
    private resolver: YtUrlResolver,
    private cache: AudioCacheService,
    private http: HttpStreamClient,
  ) {}

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL

    if (!redisUrl) {
      this.logger.log('REDIS_URL no definido. Fase 2 desactivada; usando modo local.')
      return
    }

    try {
      this.redisConnection = new IORedis(redisUrl, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
      })

      this.preloadQueue = new Queue<PreloadJobData>(this.preloadQueueName, {
        connection: this.redisConnection,
      })

      this.preloadWorker = new Worker<PreloadJobData>(
        this.preloadQueueName,
        async (job) => {
          await this.preloadLocally(job.data.videoIds, job.data.options)
        },
        {
          connection: this.redisConnection,
          concurrency: 2,
        },
      )

      this.preloadWorker.on('error', (error) => {
        this.logger.error(`Worker de preload falló: ${error.message}`)
      })

      this.queueEnabled = true
      this.logger.log('Fase 2 activa: BullMQ + Redis habilitados para preload distribuido.')
    } catch (error) {
      this.queueEnabled = false
      this.logger.error('No se pudo inicializar Redis/BullMQ. Se mantiene fallback local.')
    }
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.allSettled([
      this.preloadWorker?.close() ?? Promise.resolve(),
      this.preloadQueue?.close() ?? Promise.resolve(),
      this.redisConnection?.quit() ?? Promise.resolve(),
    ])
  }

  async getStream(videoId: string, options: StreamOptions): Promise<StreamResult> {
    this.streamRequests += 1
    const startedAt = Date.now()

    const { quality, type, range } = options
    const key = this.getCacheKey(videoId, quality, type)
    try {
      const data = await this.resolveOrGetCached(key, videoId, quality, type)

      const response = await this.http.getStream(data.directUrl, range)

      this.streamTotalLatencyMs += Date.now() - startedAt

      return {
        stream: response.data,
        mimeType: data.mimeType,
        contentLength: this.parseContentLength(response),
        contentRange: response.headers['content-range'],
        statusCode: response.status,
      }
    } catch (error) {
      this.streamFailures += 1
      throw error
    }
  }

  async preload(videoIds: string[], options?: Partial<PreloadOptions>): Promise<void> {
    this.preloadRequests += 1

    const normalizedOptions = this.normalizePreloadOptions(options)
    const uniqueVideoIds = Array.from(new Set(videoIds.filter(Boolean)))

    if (uniqueVideoIds.length === 0) {
      return
    }

    if (this.queueEnabled && this.preloadQueue && !options?.waitForWarm) {
      await this.enqueuePreloadJob(uniqueVideoIds, normalizedOptions)
      return
    }

    try {
      await this.preloadLocally(uniqueVideoIds, normalizedOptions)
    } catch (error) {
      this.preloadFailures += 1
      throw error
    }
  }

  async getMetrics() {
    let queueCounts: Awaited<ReturnType<Queue<PreloadJobData>['getJobCounts']>> | null = null

    if (this.preloadQueue) {
      try {
        queueCounts = await this.preloadQueue.getJobCounts('active', 'waiting', 'completed', 'failed', 'delayed')
      } catch {
        queueCounts = null
      }
    }

    return {
      queueEnabled: this.queueEnabled,
      redisConnected: !!this.redisConnection,
      pendingResolves: this.pendingResolves.size,
      queuedResolves: this.queuedResolves.size,
      failedResolves: this.failedResolves.size,
      streamRequests: this.streamRequests,
      streamFailures: this.streamFailures,
      averageStreamLatencyMs:
        this.streamRequests === 0
          ? 0
          : Math.round(this.streamTotalLatencyMs / this.streamRequests),
      preloadRequests: this.preloadRequests,
      preloadEnqueuedJobs: this.preloadEnqueuedJobs,
      preloadFailures: this.preloadFailures,
      queueCounts,
    }
  }

  async getPreloadState(
    videoId: string,
    options?: Partial<Pick<PreloadOptions, 'quality' | 'type'>>,
  ): Promise<PreloadState> {
    const quality = options?.quality ?? 'best'
    const type = options?.type ?? 'audio'
    const key = this.getCacheKey(videoId, quality, type)
    const now = Date.now()

    const cached = this.cache.get<ResolvedStreamData>(key)
    if (cached) {
      return { status: 'cached', updatedAt: now }
    }

    const queuedUntil = this.queuedResolves.get(key)
    if (this.pendingResolves.has(key) || (queuedUntil && queuedUntil > now)) {
      return { status: 'warming', updatedAt: now }
    }

    if (queuedUntil && queuedUntil <= now) {
      this.queuedResolves.delete(key)
    }

    const failedUntil = this.failedResolves.get(key)
    if (failedUntil && failedUntil > now) {
      return { status: 'failed', updatedAt: now }
    }

    if (failedUntil) {
      this.failedResolves.delete(key)
    }

    const redisCached = await this.getRedisResolvedData(key)
    if (redisCached) {
      this.cache.set(key, redisCached, this.cacheTtlMs)
      return { status: 'cached', updatedAt: now }
    }

    const redisState = await this.getRedisPreloadState(key)
    if (redisState) {
      return redisState
    }

    return { status: 'missed', updatedAt: now }
  }

  private parseContentLength(response: any) {
    const cl = response.headers['content-length']
    return cl ? parseInt(cl, 10) : undefined
  }

  private getCacheKey(videoId: string, quality: string, type: string): string {
    return `${videoId}:${quality}:${type}`
  }

  private normalizePreloadOptions(
    options?: Partial<PreloadOptions>,
  ): Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>> {
    return {
      quality: options?.quality ?? 'best',
      type: options?.type ?? 'audio',
      concurrency: Math.max(1, options?.concurrency ?? 2),
      timeoutMs: options?.timeoutMs ?? 7_000,
    }
  }

  private async enqueuePreloadJob(
    videoIds: string[],
    options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>,
  ): Promise<void> {
    if (!this.preloadQueue) {
      await this.preloadLocally(videoIds, options)
      return
    }

    const now = Date.now()
    for (const videoId of videoIds) {
      const key = this.getCacheKey(videoId, options.quality, options.type)
      this.queuedResolves.set(key, now + this.warmingTtlMs)
      await this.setRedisPreloadState(key, { status: 'warming', updatedAt: now }, this.warmingTtlMs)
    }

    const jobOptions: JobsOptions = {
      removeOnComplete: 100,
      removeOnFail: 300,
    }

    await this.preloadQueue.add('preload-streams', { videoIds, options }, jobOptions)
    this.preloadEnqueuedJobs += 1
  }

  private async preloadLocally(
    videoIds: string[],
    options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>,
  ): Promise<void> {
    const queue = [...videoIds]
    const workerCount = Math.min(options.concurrency, queue.length)
    const workers = Array.from({ length: workerCount }, () => this.runPreloadWorker(queue, options))
    await Promise.all(workers)
  }

  private async runPreloadWorker(
    queue: string[],
    options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>,
  ): Promise<void> {
    while (queue.length > 0) {
      const videoId = queue.shift()
      if (!videoId) {
        return
      }

      await this.preloadSingle(videoId, options.quality, options.type, options.timeoutMs)
    }
  }

  private async resolveOrGetCached(
    key: string,
    videoId: string,
    quality: StreamOptions['quality'],
    type: StreamOptions['type'],
  ): Promise<ResolvedStreamData> {
    const cached = this.cache.get<ResolvedStreamData>(key)
    if (cached) {
      return cached
    }

    const redisCached = await this.getRedisResolvedData(key)
    if (redisCached) {
      this.cache.set(key, redisCached, this.cacheTtlMs)
      return redisCached
    }

    const pending = this.pendingResolves.get(key)
    if (pending) {
      return pending
    }

    const promise = this.resolver
      .resolve(videoId, quality, type)
      .then(async (data) => {
        this.cache.set(key, data, this.cacheTtlMs)
        this.failedResolves.delete(key)
        this.queuedResolves.delete(key)
        await this.setRedisResolvedData(key, data, this.cacheTtlMs)
        await this.setRedisPreloadState(
          key,
          { status: 'cached', updatedAt: Date.now() },
          this.cacheTtlMs,
        )
        return data
      })
      .catch(async (error) => {
        this.failedResolves.set(key, Date.now() + this.failedTtlMs)
        this.queuedResolves.delete(key)
        await this.setRedisPreloadState(
          key,
          { status: 'failed', updatedAt: Date.now() },
          this.failedTtlMs,
        )
        throw error
      })
      .finally(() => {
        this.pendingResolves.delete(key)
      })

    this.pendingResolves.set(key, promise)
    return promise
  }

  private async preloadSingle(
    videoId: string,
    quality: StreamOptions['quality'],
    type: StreamOptions['type'],
    timeoutMs: number,
  ): Promise<void> {
    const key = this.getCacheKey(videoId, quality, type)
    const now = Date.now()

    this.queuedResolves.set(key, now + this.warmingTtlMs)
    await this.setRedisPreloadState(key, { status: 'warming', updatedAt: now }, this.warmingTtlMs)

    if (this.cache.get<ResolvedStreamData>(key) || this.pendingResolves.has(key)) {
      return
    }

    try {
      if (timeoutMs <= 0) {
        await this.resolveOrGetCached(key, videoId, quality, type)
        return
      }

      await this.withTimeout(this.resolveOrGetCached(key, videoId, quality, type), timeoutMs)
    } catch {
      this.failedResolves.set(key, Date.now() + this.failedTtlMs)
      this.queuedResolves.delete(key)
      await this.setRedisPreloadState(
        key,
        { status: 'failed', updatedAt: Date.now() },
        this.failedTtlMs,
      )
      this.preloadFailures += 1
    }
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined

    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Preload timeout')), timeoutMs)
    })

    return Promise.race([operation, timeoutPromise]).finally(() => {
      if (timer) {
        clearTimeout(timer)
      }
    })
  }

  private redisCacheKey(key: string): string {
    return `${this.redisStreamCachePrefix}${key}`
  }

  private redisStateKey(key: string): string {
    return `${this.redisPreloadStatePrefix}${key}`
  }

  private async getRedisResolvedData(key: string): Promise<ResolvedStreamData | null> {
    if (!this.redisConnection) {
      return null
    }

    try {
      const raw = await this.redisConnection.get(this.redisCacheKey(key))
      if (!raw) {
        return null
      }

      return JSON.parse(raw) as ResolvedStreamData
    } catch {
      return null
    }
  }

  private async setRedisResolvedData(
    key: string,
    data: ResolvedStreamData,
    ttlMs: number,
  ): Promise<void> {
    if (!this.redisConnection) {
      return
    }

    try {
      await this.redisConnection.set(
        this.redisCacheKey(key),
        JSON.stringify(data),
        'PX',
        ttlMs,
      )
    } catch {
      // Redis es una optimización opcional; el flujo local sigue funcionando.
    }
  }

  private async getRedisPreloadState(key: string): Promise<PreloadState | null> {
    if (!this.redisConnection) {
      return null
    }

    try {
      const raw = await this.redisConnection.get(this.redisStateKey(key))
      if (!raw) {
        return null
      }

      return JSON.parse(raw) as PreloadState
    } catch {
      return null
    }
  }

  private async setRedisPreloadState(
    key: string,
    state: PreloadState,
    ttlMs: number,
  ): Promise<void> {
    if (!this.redisConnection) {
      return
    }

    try {
      await this.redisConnection.set(
        this.redisStateKey(key),
        JSON.stringify(state),
        'PX',
        ttlMs,
      )
    } catch {
      // Redis es una optimización opcional; el flujo local sigue funcionando.
    }
  }
}