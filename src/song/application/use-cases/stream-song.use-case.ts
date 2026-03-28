import { Injectable, BadRequestException } from '@nestjs/common'
import type { AudioQuality, StreamType } from '../../domain/repositories/audio-stream.repository'
 
export interface StreamSongInput {
  videoId: string
  quality?: AudioQuality
  type?: StreamType
}

export interface StreamSongValidated {
  videoId: string
  quality: AudioQuality
  type: StreamType
}
 
@Injectable()
export class StreamSongUseCase {
  async execute(input: StreamSongInput): Promise<StreamSongValidated> {
    const { videoId, quality = 'best', type = 'audio' } = input
 
    if (!videoId?.trim()) {
      throw new BadRequestException('videoId cannot be empty')
    }

    if (!['audio', 'av'].includes(type)) {
      throw new BadRequestException('type must be "audio" or "av"')
    }
 
    const trimmedVideoId = videoId.trim()
    if (trimmedVideoId.length !== 11) {
      throw new BadRequestException('Invalid videoId — must be 11 characters')
    }
 
    return {
      videoId: trimmedVideoId,
      quality,
      type,
    }
  }
}