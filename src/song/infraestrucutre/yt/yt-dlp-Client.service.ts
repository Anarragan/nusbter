import { Injectable } from '@nestjs/common'
import YTDlpWrap from 'yt-dlp-wrap'

@Injectable()
export class YtDlpClient {
  private ytDlp = new YTDlpWrap()

  async getDirectUrl(videoId: string, format: string): Promise<string> {
    const url = `https://www.youtube.com/watch?v=${videoId}`

    const result = await this.ytDlp.execPromise([
      url,
      '-f', format,
      '--get-url',
      '--no-playlist',
    ])

    return result.trim()
  }
}