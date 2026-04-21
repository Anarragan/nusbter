import { Body, Controller, Inject, Post, UseInterceptors } from '@nestjs/common'
import { AUDIO_STREAM_SERVICE } from '../domain/services/audio-stream.service'
import type { AudioStreamService } from '../domain/services/audio-stream.service'
import { DownloadPreparationService } from '../infraestrucutre/media/download-preparation.service'
import { RequestLoggingInterceptor } from '../../common/interceptors/request-logging.interceptor'

interface PreloadRequestBody {
  videoIds: string[]
  mode?: 'stream' | 'download' | 'both'
  concurrency?: number
  timeoutMs?: number
  downloadTop?: number
}

@Controller('songs')
export class PreloadController {
  constructor(
    @Inject(AUDIO_STREAM_SERVICE)
    private readonly audioService: AudioStreamService,
    private readonly downloadPreparationService: DownloadPreparationService,
  ) {}

  @Post('preload')
  @UseInterceptors(RequestLoggingInterceptor)
  async preload(@Body() body: PreloadRequestBody) {
    const videoIds = Array.from(new Set((body.videoIds ?? []).filter(Boolean)))
    const mode = body.mode ?? 'both'

    if (videoIds.length === 0) {
      return {
        success: false,
        error: 'videoIds is required and must contain at least one item',
      }
    }

    const actions: Promise<unknown>[] = []

    if (mode === 'stream' || mode === 'both') {
      actions.push(
        this.audioService.preload(videoIds, {
          quality: 'best',
          type: 'audio',
          concurrency: body.concurrency ?? 2,
          timeoutMs: body.timeoutMs ?? 7_000,
          waitForWarm: false,
        }),
      )
    }

    if (mode === 'download' || mode === 'both') {
      const top = Math.max(1, body.downloadTop ?? 3)
      actions.push(
        this.downloadPreparationService.preload(videoIds.slice(0, top), {
          concurrency: 1,
          timeoutMs: body.timeoutMs ?? 15_000,
          waitForWarm: false,
        }),
      )
    }

    const results = await Promise.allSettled(actions)

    return {
      success: results.every((result) => result.status === 'fulfilled'),
      data: {
        requested: videoIds.length,
        mode,
        streamRequested: mode === 'stream' || mode === 'both',
        downloadRequested: mode === 'download' || mode === 'both',
        results,
      },
    }
  }
}
