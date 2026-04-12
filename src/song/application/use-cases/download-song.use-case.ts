import { Injectable, Inject } from '@nestjs/common'
import { AUDIO_STREAM_SERVICE, type AudioStreamService } from '../../domain/services/audio-stream.service'
import { VideoId } from '../../domain/value-object/video-id'
import { FfmpegService } from '../../infraestrucutre/media/ffmeg.service'
import { Readable } from 'stream'

export interface DownloadSongInput {
  videoId: string
}

@Injectable()
export class DownloadSong {
  constructor(
    @Inject(AUDIO_STREAM_SERVICE)
    private readonly audioService: AudioStreamService,
    private readonly ffmpeg: FfmpegService,
  ) {}

  async execute(input: DownloadSongInput): Promise<Readable> {
    const videoId = VideoId.create(input.videoId)

    const { stream } = await this.audioService.getStream(videoId.value, {
      quality: 'best',
      type: 'audio',
    })

    if (!(stream instanceof Readable)) {
      throw new TypeError('Audio stream is not a Readable stream')
    }

    // 🔥 CONVERSIÓN REAL
    return this.ffmpeg.convertToMp3(stream)
  }
}