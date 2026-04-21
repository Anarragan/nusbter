import { Injectable, Inject } from '@nestjs/common'
import { AUDIO_STREAM_SERVICE, type AudioStreamService } from '../../domain/services/audio-stream.service'
import { VideoId } from '../../domain/value-object/video-id'
import { FfmpegService } from '../../infraestrucutre/media/ffmeg.service'
import { DownloadPreparationService } from '../../infraestrucutre/media/download-preparation.service'
import { Readable } from 'stream'

export interface DownloadSongInput {
  videoId: string
}

export interface DownloadSongOutput {
  stream: Readable
  contentLength?: number
  source: 'prepared' | 'live'
}

@Injectable()
export class DownloadSong {
  constructor(
    @Inject(AUDIO_STREAM_SERVICE)
    private readonly audioService: AudioStreamService,
    private readonly ffmpeg: FfmpegService,
    private readonly downloadPreparationService: DownloadPreparationService,
  ) {}

  async execute(input: DownloadSongInput): Promise<DownloadSongOutput> {
    const videoId = VideoId.create(input.videoId)

    try {
      const prepared = await this.downloadPreparationService.prepareAndCreateStream(videoId.value, {
        timeoutMs: 20_000,
        waitForWarm: true,
      })

      return {
        stream: prepared.stream,
        contentLength: prepared.sizeBytes,
        source: 'prepared',
      }
    } catch {
      // Si la preparacion falla, hacemos fallback a conversion en vivo.
    }

    await this.audioService.preload([videoId.value], {
      quality: 'best',
      type: 'audio',
      concurrency: 1,
      timeoutMs: 10_000,
      waitForWarm: true,
    })

    const { stream, mimeType } = await this.audioService.getStream(videoId.value, {
      quality: 'best',
      type: 'audio',
    })

    if (!(stream instanceof Readable)) {
      throw new TypeError('Audio stream is not a Readable stream')
    }

    if (mimeType === 'audio/mpeg') {
      return {
        stream,
        source: 'live',
      }
    }

    return {
      stream: this.ffmpeg.convertToMp3(stream),
      source: 'live',
    }
  }
}