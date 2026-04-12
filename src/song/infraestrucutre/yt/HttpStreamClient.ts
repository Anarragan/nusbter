import { Injectable } from '@nestjs/common'
import axios from 'axios'
import http from 'http'
import https from 'https'

@Injectable()
export class HttpStreamClient {
  private httpAgent = new http.Agent({ keepAlive: true })
  private httpsAgent = new https.Agent({ keepAlive: true })

  async getStream(url: string, range?: string) {
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0',
    }

    if (range) headers['Range'] = range

    return axios.get(url, {
      responseType: 'stream',
      headers,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
      validateStatus: (s) => s < 400,
    })
  }
}