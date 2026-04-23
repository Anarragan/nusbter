import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common'
import { JobsOptions, Queue, Worker } from 'bullmq'
import IORedis, { RedisOptions } from 'ioredis'
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

// Unifica el estado de preload en memoria — reemplaza los 3 Maps anteriores
interface PreloadStateEntry {
  status: PreloadState['status']
  updatedAt: number
  expiresAt: number
}

@Injectable()
export class YtStreamService implements AudioStreamService, OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(YtStreamService.name)

  // TTLs de caché
  private readonly cacheTtlMs = 30 * 60 * 1000  // 30 min — URL directa resuelta
  private readonly failedTtlMs = 2 * 60 * 1000  // 2 min — esperar antes de reintentar
  private readonly warmingTtlMs = 60 * 1000      // 1 min — preload en progreso

  // Estado en memoria
  private readonly pendingResolves = new Map<string, Promise<ResolvedStreamData>>()
  private readonly preloadStates = new Map<string, PreloadStateEntry>()

  // Redis / BullMQ — opcionales, solo activos si REDIS_URL está definida
  private readonly preloadQueueName = 'song-stream-preload'
  private readonly redisStreamCachePrefix = 'stream-cache:'

  // Solo 2 conexiones: queue (también sirve para cache GET/SET) y worker
  // BullMQ exige que Queue y Worker tengan conexiones IORedis distintas
  private queueConnection?: IORedis
  private workerConnection?: IORedis
  private preloadQueue?: Queue<PreloadJobData>
  private preloadWorker?: Worker<PreloadJobData>
  private queueEnabled = false

  // Métricas
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

  // ─── Ciclo de vida ────────────────────────────────────────────────────────

  async onModuleInit(): Promise<void> {
    const redisUrl = process.env.REDIS_URL

    if (!redisUrl) {
      this.logger.log('REDIS_URL no definido. Fase 2 desactivada; usando modo local.')
      return
    }

    // Inicializamos Redis en segundo plano para NO bloquear el arranque de Nest.
    // Si falla, la app sigue funcionando en modo local sin BullMQ.
    this.initRedisAsync(redisUrl).catch((error) => {
      this.logger.warn(`Redis no disponible: ${(error as Error).message}. Usando modo local.`)
    })
  }

  async onModuleDestroy(): Promise<void> {
    await this.teardownAllConnections()
  }

  // ─── API pública ──────────────────────────────────────────────────────────

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
    const normalized = this.normalizePreloadOptions(options)
    const unique = Array.from(new Set(videoIds.filter(Boolean)))

    if (unique.length === 0) return

    // Si BullMQ está activo y no se requiere esperar el resultado, encolar
    if (this.queueEnabled && this.preloadQueue && !options?.waitForWarm) {
      try {
        await this.enqueuePreloadJob(unique, normalized)
        return
      } catch {
        this.preloadFailures += 1
        this.logger.warn('Fallo el preload distribuido; aplicando fallback local.')
      }
    }

    try {
      await this.preloadLocally(unique, normalized)
    } catch (error) {
      this.preloadFailures += 1
      throw error
    }
  }

  async getMetrics() {
    this.cleanupExpiredPreloadStates()

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
      // Considera conectado si la conexión existe y está en estado 'ready'
      redisConnected: this.queueConnection?.status === 'ready',
      pendingResolves: this.pendingResolves.size,
      queuedResolves: this.countPreloadStates('warming'),
      failedResolves: this.countPreloadStates('failed'),
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

    // 1. Caché en memoria local (más rápido)
    if (this.cache.get<ResolvedStreamData>(key)) {
      return { status: 'cached', updatedAt: now }
    }

    // 2. Resolución en curso
    if (this.pendingResolves.has(key)) {
      return { status: 'warming', updatedAt: now }
    }

    // 3. Estado registrado (warming / failed con TTL)
    const entry = this.getPreloadStateEntry(key)
    if (entry) {
      return { status: entry.status, updatedAt: entry.updatedAt }
    }

    // 4. Caché en Redis (por si otro proceso lo resolvió)
    const redisCached = await this.getRedisResolvedData(key)
    if (redisCached) {
      this.cache.set(key, redisCached, this.cacheTtlMs)
      return { status: 'cached', updatedAt: now }
    }

    return { status: 'missed', updatedAt: now }
  }

  // ─── Inicialización Redis (no bloquea arranque) ───────────────────────────

  private async initRedisAsync(redisUrl: string): Promise<void> {
    const options = this.buildRedisOptions(redisUrl)

    // Dos conexiones separadas porque BullMQ lo requiere
    this.queueConnection = new IORedis(options)
    this.workerConnection = new IORedis(options)

    // Escuchar errores para desactivar BullMQ si la conexión cae en runtime
    this.attachConnectionErrorHandler(this.queueConnection, 'queue')
    this.attachConnectionErrorHandler(this.workerConnection, 'worker')

    // Verificar que Redis responde antes de crear Queue y Worker
    // Esto puede lanzar excepción — el catch en onModuleInit la captura
    await this.queueConnection.ping()
    await this.workerConnection.ping()

    this.preloadQueue = new Queue<PreloadJobData>(this.preloadQueueName, {
      connection: this.queueConnection,
    })

    this.preloadWorker = new Worker<PreloadJobData>(
      this.preloadQueueName,
      async (job) => {
        await this.preloadLocally(job.data.videoIds, job.data.options)
      },
      {
        connection: this.workerConnection,
        concurrency: 2,
      },
    )

    this.preloadWorker.on('error', (error) => {
      this.logger.error(`Worker de preload falló: ${error.message}`)
      if (this.isConnectionError(error)) {
        void this.disableDistributedQueue(`error de worker: ${error.message}`)
      }
    })

    this.queueEnabled = true
    this.logger.log('Fase 2 activa: BullMQ + Redis habilitados para preload distribuido.')
  }

  // ─── Redis helpers ────────────────────────────────────────────────────────

  // Parsea la URL para extraer host, puerto, credenciales y TLS
  // sin depender del formato completo de la string — más robusto con Upstash
  private buildRedisOptions(redisUrl: string): RedisOptions {
    const parsed = new URL(redisUrl)
    const useTls = parsed.protocol === 'rediss:'
    const dbFromPath =
      parsed.pathname && parsed.pathname !== '/'
        ? Number(parsed.pathname.replace('/', ''))
        : undefined

    return {
      host: parsed.hostname,
      port: Number(parsed.port || (useTls ? 6380 : 6379)),
      username: parsed.username ? decodeURIComponent(parsed.username) : undefined,
      password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
      db: Number.isInteger(dbFromPath) ? dbFromPath : undefined,
      maxRetriesPerRequest: null, // requerido por BullMQ
      enableReadyCheck: false,    // evita bloqueos en conexiones lentas
      // tls: {} activa TLS sin certificado de cliente — correcto para Upstash
      tls: useTls ? {} : undefined,
      // Reintentar máximo 3 veces con backoff, luego rendirse
      retryStrategy: (times) => (times > 3 ? null : Math.min(times * 500, 2000)),
    }
  }

  private attachConnectionErrorHandler(connection: IORedis, label: 'queue' | 'worker') {
    connection.on('error', (error) => {
      this.logger.warn(`Redis ${label} error: ${error.message}`)
      if (this.isConnectionError(error)) {
        void this.disableDistributedQueue(`conexión ${label} falló: ${error.message}`)
      }
    })

    connection.on('end', () => {
      void this.disableDistributedQueue(`conexión ${label} cerrada inesperadamente`)
    })
  }

  private isConnectionError(error: unknown): boolean {
    const code = (error as NodeJS.ErrnoException).code
    return ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ECONNREFUSED'].includes(code ?? '')
  }

  private async disableDistributedQueue(reason: string): Promise<void> {
    if (!this.queueEnabled) return // ya estaba desactivado

    this.queueEnabled = false
    this.logger.warn(`BullMQ deshabilitado (${reason}). Fallback a preload local activo.`)

    await Promise.allSettled([
      this.preloadWorker?.close(),
      this.preloadQueue?.close(),
      this.queueConnection?.quit(),
      this.workerConnection?.quit(),
    ])

    this.preloadWorker = undefined
    this.preloadQueue = undefined
    this.queueConnection = undefined
    this.workerConnection = undefined
  }

  private async teardownAllConnections(): Promise<void> {
    await Promise.allSettled([
      this.preloadWorker?.close(),
      this.preloadQueue?.close(),
      this.workerConnection?.quit(),
      this.queueConnection?.quit(),
    ])

    this.preloadWorker = undefined
    this.preloadQueue = undefined
    this.workerConnection = undefined
    this.queueConnection = undefined
  }

  private redisCacheKey(key: string): string {
    return `${this.redisStreamCachePrefix}${key}`
  }

  private async getRedisResolvedData(key: string): Promise<ResolvedStreamData | null> {
    if (!this.queueConnection || this.queueConnection.status !== 'ready') return null

    try {
      const raw = await this.queueConnection.get(this.redisCacheKey(key))
      return raw ? (JSON.parse(raw) as ResolvedStreamData) : null
    } catch {
      return null
    }
  }

  private async setRedisResolvedData(key: string, data: ResolvedStreamData, ttlMs: number): Promise<void> {
    if (!this.queueConnection || this.queueConnection.status !== 'ready') return

    try {
      await this.queueConnection.set(this.redisCacheKey(key), JSON.stringify(data), 'PX', ttlMs)
    } catch {
      // Redis es opcional — si falla, el caché local sigue funcionando
    }
  }

  // ─── Estado de preload en memoria ─────────────────────────────────────────

  private setPreloadState(key: string, status: PreloadState['status'], ttlMs: number): void {
    this.preloadStates.set(key, {
      status,
      updatedAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
    })
  }

  private getPreloadStateEntry(key: string): PreloadStateEntry | null {
    const entry = this.preloadStates.get(key)
    if (!entry) return null
    if (entry.expiresAt <= Date.now()) {
      this.preloadStates.delete(key)
      return null
    }
    return entry
  }

  private cleanupExpiredPreloadStates(): void {
    const now = Date.now()
    for (const [key, entry] of this.preloadStates) {
      if (entry.expiresAt <= now) this.preloadStates.delete(key)
    }
  }

  private countPreloadStates(status: PreloadState['status']): number {
    this.cleanupExpiredPreloadStates()
    let count = 0
    for (const entry of this.preloadStates.values()) {
      if (entry.status === status) count++
    }
    return count
  }

  // ─── Resolución y caché de streams ────────────────────────────────────────

  private async resolveOrGetCached(
    key: string,
    videoId: string,
    quality: StreamOptions['quality'],
    type: StreamOptions['type'],
  ): Promise<ResolvedStreamData> {
    // 1. Memoria local
    const cached = this.cache.get<ResolvedStreamData>(key)
    if (cached) return cached

    // 2. Redis (resuelto por otra instancia o proceso anterior)
    const redisCached = await this.getRedisResolvedData(key)
    if (redisCached) {
      this.cache.set(key, redisCached, this.cacheTtlMs)
      return redisCached
    }

    // 3. Ya hay una resolución en curso — reutilizar la misma promesa
    const pending = this.pendingResolves.get(key)
    if (pending) return pending

    // 4. Resolver desde YouTube
    const promise = this.resolver
      .resolve(videoId, quality, type)
      .then(async (data) => {
        this.cache.set(key, data, this.cacheTtlMs)
        this.setPreloadState(key, 'cached', this.cacheTtlMs)
        await this.setRedisResolvedData(key, data, this.cacheTtlMs)
        return data
      })
      .catch((error) => {
        this.setPreloadState(key, 'failed', this.failedTtlMs)
        throw error
      })
      .finally(() => {
        this.pendingResolves.delete(key)
      })

    this.pendingResolves.set(key, promise)
    return promise
  }

  // ─── Preload local ────────────────────────────────────────────────────────

  private async enqueuePreloadJob(
    videoIds: string[],
    options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>,
  ): Promise<void> {
    if (!this.preloadQueue) {
      await this.preloadLocally(videoIds, options)
      return
    }

    for (const videoId of videoIds) {
      this.setPreloadState(this.getCacheKey(videoId, options.quality, options.type), 'warming', this.warmingTtlMs)
    }

    const jobOptions: JobsOptions = { removeOnComplete: 100, removeOnFail: 300 }

    try {
      await this.preloadQueue.add('preload-streams', { videoIds, options }, jobOptions)
      this.preloadEnqueuedJobs += 1
    } catch (error) {
      if (this.isConnectionError(error)) {
        await this.disableDistributedQueue(`fallo al encolar: ${(error as Error).message}`)
      }
      throw error
    }
  }

  private async preloadLocally(
    videoIds: string[],
    options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>,
  ): Promise<void> {
    const queue = [...videoIds]
    const workerCount = Math.min(options.concurrency, queue.length)
    await Promise.all(
      Array.from({ length: workerCount }, () => this.runPreloadWorker(queue, options))
    )
  }

  private async runPreloadWorker(
    queue: string[],
    options: Required<Pick<PreloadOptions, 'quality' | 'type' | 'concurrency' | 'timeoutMs'>>,
  ): Promise<void> {
    while (queue.length > 0) {
      const videoId = queue.shift()
      if (!videoId) return
      await this.preloadSingle(videoId, options.quality, options.type, options.timeoutMs)
    }
  }

  private async preloadSingle(
    videoId: string,
    quality: StreamOptions['quality'],
    type: StreamOptions['type'],
    timeoutMs: number,
  ): Promise<void> {
    const key = this.getCacheKey(videoId, quality, type)
    this.setPreloadState(key, 'warming', this.warmingTtlMs)

    if (this.cache.get<ResolvedStreamData>(key) || this.pendingResolves.has(key)) return

    try {
      const resolve = this.resolveOrGetCached(key, videoId, quality, type)
      await (timeoutMs > 0 ? this.withTimeout(resolve, timeoutMs) : resolve)
    } catch {
      this.setPreloadState(key, 'failed', this.failedTtlMs)
      this.preloadFailures += 1
    }
  }

  private withTimeout<T>(operation: Promise<T>, timeoutMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    const timeout = new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(new Error('Preload timeout')), timeoutMs)
    })
    return Promise.race([operation, timeout]).finally(() => {
      if (timer) clearTimeout(timer)
    })
  }

  // ─── Utilidades ───────────────────────────────────────────────────────────

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

  private parseContentLength(response: any): number | undefined {
    const cl = response.headers['content-length']
    return cl ? parseInt(cl, 10) : undefined
  }
}