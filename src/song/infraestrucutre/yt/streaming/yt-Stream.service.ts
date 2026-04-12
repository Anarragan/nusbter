import { Injectable } from '@nestjs/common'
import { YtUrlResolver } from '../yt-url-resolver.service'
import { AudioCacheService } from '../../cache/AudioCacheService'
import { HttpStreamClient } from '../HttpStreamClient'
import { AudioStreamService, StreamOptions, StreamResult } from '../../../domain/services/audio-stream.service'

@Injectable()
export class YtStreamService implements AudioStreamService {
  constructor(
    private resolver: YtUrlResolver,
    private cache: AudioCacheService,
    private http: HttpStreamClient,
  ) {}

  async getStream(videoId: string, options: StreamOptions): Promise<StreamResult> {
    const { quality, type, range } = options

    const key = `${videoId}:${quality}:${type}`

    let data = this.cache.get(key)

    if (!data) {
      data = await this.resolver.resolve(videoId, quality, type)
      this.cache.set(key, data, 5 * 60 * 1000)
    }

    const response = await this.http.getStream(data.directUrl, range)

    return {
      stream: response.data,
      mimeType: data.mimeType,
      contentLength: this.parseContentLength(response),
      contentRange: response.headers['content-range'],
      statusCode: response.status,
    }
  }

  private parseContentLength(response: any) {
    const cl = response.headers['content-length']
    return cl ? parseInt(cl, 10) : undefined
  }
}