import { Inject, Injectable } from '@nestjs/common'
import { createReadStream, ReadStream } from 'fs'
import { Readable } from 'stream'
import { AUDIO_STREAM_SERVICE } from '../../domain/services/audio-stream.service'
import type { AudioStreamService } from '../../domain/services/audio-stream.service'
import { DownloadFileCacheService } from '../cache/DownloadFileCacheService'
import { FfmpegService } from './ffmeg.service'

interface DownloadWarmOptions {
  timeoutMs?: number
  ttlMs?: number
  waitForWarm?: boolean
  concurrency?: number
}

export interface PreparedDownloadResult {
  stream: ReadStream
  sizeBytes: number
  fromCache: boolean
}

@Injectable()
export class DownloadPreparationService {
  private readonly defaultTimeoutMs = 20_000

  constructor(
    @Inject(AUDIO_STREAM_SERVICE)
    private readonly audioService: AudioStreamService,
    private readonly ffmpeg: FfmpegService,
    private readonly fileCache: DownloadFileCacheService,
  ) {}

  async preload(videoIds: string[], options?: DownloadWarmOptions): Promise<void> {
    const uniqueVideoIds = Array.from(new Set(videoIds.filter(Boolean)))
    const concurrency = Math.max(1, options?.concurrency ?? 1)
    const queue = [...uniqueVideoIds]

    const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
      while (queue.length > 0) {
        const videoId = queue.shift()
        if (!videoId) {
          return
        }

        try {
          await this.prepareFile(videoId, options)
        } catch {
          // El preload es best-effort; no bloquea el flujo principal.
        }
      }
    })

    await Promise.all(workers)
  }

  async prepareAndCreateStream(
    videoId: string,
    options?: DownloadWarmOptions,
  ): Promise<PreparedDownloadResult> {
    const prepared = await this.prepareFile(videoId, options)

    return {
      stream: createReadStream(prepared.filePath),
      sizeBytes: prepared.sizeBytes,
      fromCache: prepared.fromCache,
    }
  }

  getMetrics() {
    return this.fileCache.getMetrics()
  }

  private async prepareFile(
    videoId: string,
    options?: DownloadWarmOptions,
  ): Promise<{ filePath: string; sizeBytes: number; fromCache: boolean }> {
    const key = this.getDownloadKey(videoId)

    return this.fileCache.getOrBuild(
      key,
      async (outputPath) => {
        await this.audioService.preload([videoId], {
          quality: 'best',
          type: 'audio',
          concurrency: 1,
          timeoutMs: options?.timeoutMs ?? this.defaultTimeoutMs,
          waitForWarm: options?.waitForWarm ?? true,
        })

        const { stream, mimeType } = await this.audioService.getStream(videoId, {
          quality: 'best',
          type: 'audio',
        })

        if (!(stream instanceof Readable)) {
          throw new TypeError('Audio stream is not a Readable stream')
        }

        if (mimeType === 'audio/mpeg') {
          await this.ffmpeg.saveStreamToFile(stream, outputPath)
          return
        }

        await this.ffmpeg.convertToMp3File(stream, outputPath)
      },
      options?.ttlMs,
    )
  }

  private getDownloadKey(videoId: string): string {
    return `${videoId}:best:audio:mp3`
  }
}
