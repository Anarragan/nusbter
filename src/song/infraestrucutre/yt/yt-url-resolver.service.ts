import { Injectable } from '@nestjs/common'
import { YtDlpClient } from './yt-dlp-Client.service'
import type { AudioQuality, StreamType } from '../../domain/types/audio.types'

const AUDIO_QUALITY_FORMAT: Record<AudioQuality, string> = {
  best:  'bestaudio[ext=m4a]',
  worst: 'worstaudio[ext=m4a]',
}

const AV_QUALITY_FORMAT: Record<AudioQuality, string> = {
  // Pedimos un formato "best" que sea un solo archivo MP4 (progressive).
  // Esto evita formatos DASH (bestvideo+bestaudio) que requerirían ffmpeg.
  best:  'best[ext=mp4]/best',
  worst: 'worst[ext=mp4]/worst',
}

@Injectable()
export class YtUrlResolver {
  constructor(private ytDlp: YtDlpClient) {}

  async resolve(videoId: string, quality: AudioQuality, type: StreamType) {
    const format = this.getFormat(quality, type)

    const directUrl = await this.ytDlp.getDirectUrl(videoId, format)

    if (!directUrl.startsWith('http')) {
      throw new Error('Invalid direct URL')
    }

    return {
      directUrl,
      mimeType: this.detectMimeTypeFromUrl(directUrl, type),
    }
  }

  private getFormat(quality: AudioQuality, type: StreamType): string {
      return type === 'av' ? AV_QUALITY_FORMAT[quality] : AUDIO_QUALITY_FORMAT[quality]
    }

  private detectMimeTypeFromUrl(directUrl: string, type: StreamType): string {
  if (type === 'av') return 'video/mp4'

  if (directUrl.includes('audio%2Fmp4') || directUrl.includes('audio/mp4')) {
    return 'audio/mp4'
  }

  if (directUrl.includes('audio%2Fwebm') || directUrl.includes('audio/webm')) {
    return 'audio/webm'
  }

  return 'audio/mp4' // fallback seguro
  }
}