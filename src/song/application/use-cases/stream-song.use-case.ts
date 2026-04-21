import { Injectable, Inject } from '@nestjs/common'
import { AUDIO_STREAM_SERVICE, type AudioStreamService } from '../../domain/services/audio-stream.service'
import { VideoId } from '../../domain/value-object/video-id'
import { AudioQuality, StreamType } from '../../domain/types/audio.types'
import type { StreamResult } from '../../domain/services/audio-stream.service'

export interface StreamSongInput {
  videoId: string
  quality?: AudioQuality
  type?: StreamType
  range?: string
}

@Injectable()
export class StreamSong {
  constructor(
    @Inject(AUDIO_STREAM_SERVICE)
    private readonly audioService: AudioStreamService,
  ) {}

  async execute(input: StreamSongInput): Promise<StreamResult> {
    const videoId = VideoId.create(input.videoId)

    const quality = input.quality ?? 'best'
    const type = input.type ?? 'audio'

    return this.audioService.getStream(videoId.value, {
      quality,
      type,
      range: input.range,
    })
  }
}