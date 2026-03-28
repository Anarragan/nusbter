import { Injectable, InternalServerErrorException } from '@nestjs/common'
import YTDlpWrap from 'yt-dlp-wrap'
import axios from 'axios'
import http from 'http'
import https from 'https'
import { Readable } from 'stream'
import { URL } from 'url'
import type {
  AudioStreamRepository,
  AudioQuality,
  StreamResult,
  StreamType,
} from '../../domain/repositories/audio-stream.repository'
 
const AUDIO_QUALITY_FORMAT: Record<AudioQuality, string> = {
  // Para navegadores, m4a/mp4 suele ser el path más compatible que webm/opus
  best:  'bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio',
  worst: 'worstaudio',
}

const AV_QUALITY_FORMAT: Record<AudioQuality, string> = {
  // Pedimos un formato "best" que sea un solo archivo MP4 (progressive).
  // Esto evita formatos DASH (bestvideo+bestaudio) que requerirían ffmpeg.
  best:  'best[ext=mp4]/best',
  worst: 'worst[ext=mp4]/worst',
}

type CachedDirectUrl = {
  value: DirectUrlResult
  expiresAt: number
}
 
export interface DirectUrlResult {
  directUrl: string
  mimeType: string
  contentLength?: number
}
 
@Injectable()
export class YtDlpAudioStreamRepository implements AudioStreamRepository {
  private ytDlp = new YTDlpWrap()

  private readonly httpAgent = new http.Agent({ keepAlive: true })
  private readonly httpsAgent = new https.Agent({ keepAlive: true })

  // Cache en memoria para no ejecutar yt-dlp en cada request
  // (las URLs firmadas expiran, por eso el TTL es corto)
  private directUrlCache = new Map<string, CachedDirectUrl>()
  private readonly directUrlCacheTtlMs = 5 * 60 * 1000

  private cacheKey(videoId: string, quality: AudioQuality, type: StreamType): string {
    return `${videoId}:${type}:${quality}`
  }

  private getFormat(quality: AudioQuality, type: StreamType): string {
    return type === 'av' ? AV_QUALITY_FORMAT[quality] : AUDIO_QUALITY_FORMAT[quality]
  }

  private isAllowedDirectUrl(directUrl: string): boolean {
    try {
      const parsed = new URL(directUrl)
      const hostname = parsed.hostname.toLowerCase()

      // La URL directa de audio normalmente viene de *.googlevideo.com
      // Permitimos googlevideo.com y subdominios.
      if (hostname === 'googlevideo.com' || hostname.endsWith('.googlevideo.com')) return true

      return false
    } catch {
      return false
    }
  }

  private detectMimeTypeFromUrl(directUrl: string, type: StreamType): string {
    let mimeType = type === 'av' ? 'video/mp4' : 'audio/webm'
    if (directUrl.includes('mime=video%2Fmp4') || directUrl.includes('mime=video/mp4')) {
      mimeType = 'video/mp4'
    } else if (directUrl.includes('mime=audio%2Fmp4') || directUrl.includes('mime=audio/mp4')) {
      mimeType = 'audio/mp4'
    } else if (directUrl.includes('mime=audio%2Fwebm') || directUrl.includes('mime=audio/webm')) {
      mimeType = 'audio/webm'
    } else if (directUrl.includes('mime=video%2Fwebm') || directUrl.includes('mime=video/webm')) {
      mimeType = 'video/webm'
    }
    return mimeType
  }

  private async fetchDirectUrl(videoId: string, quality: AudioQuality, type: StreamType): Promise<DirectUrlResult> {
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const format = this.getFormat(quality, type)

    const info = await this.ytDlp.execPromise([
      url,
      '-f', format,
      '--get-url',
      '--no-playlist',
    ])

    const directUrl = info.trim()

    if (!directUrl || !directUrl.startsWith('http')) {
      throw new InternalServerErrorException('Could not get direct audio URL')
    }

    if (!this.isAllowedDirectUrl(directUrl)) {
      throw new InternalServerErrorException('Direct URL host not allowed')
    }

    const mimeType = this.detectMimeTypeFromUrl(directUrl, type)

    return { directUrl, mimeType }
  }

  private async getDirectUrlForStreaming(videoId: string, quality: AudioQuality, type: StreamType): Promise<DirectUrlResult> {
    const key = this.cacheKey(videoId, quality, type)
    const cached = this.directUrlCache.get(key)
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value
    }

    const result = await this.fetchDirectUrl(videoId, quality, type)

    this.directUrlCache.set(key, {
      value: result,
      expiresAt: Date.now() + this.directUrlCacheTtlMs,
    })

    return result
  }
 
  // Obtiene la URL directa firmada de los servidores de Google
  async getDirectUrl(videoId: string, quality: AudioQuality, type: StreamType = 'audio'): Promise<DirectUrlResult> {
    const key = this.cacheKey(videoId, quality, type)
    const cached = this.directUrlCache.get(key)
    if (cached && cached.expiresAt > Date.now() && cached.value.contentLength) {
      return cached.value
    }

    // Reusamos cache si existe, si no, consultamos yt-dlp
    const base = cached && cached.expiresAt > Date.now()
      ? cached.value
      : await this.fetchDirectUrl(videoId, quality, type)
    const { directUrl, mimeType } = base
 
    // Hacemos HEAD para obtener el Content-Length real sin descargar
    let contentLength: number | undefined
    try {
      const head = await axios.head(directUrl, {
        timeout: 5000,
        httpAgent: this.httpAgent,
        httpsAgent: this.httpsAgent,
      })
      const cl   = head.headers['content-length']
      if (cl) contentLength = parseInt(cl, 10)
    } catch {
      // No crítico
    }
 
    const result = { directUrl, mimeType, contentLength }

    this.directUrlCache.set(key, {
      value: result,
      expiresAt: Date.now() + this.directUrlCacheTtlMs,
    })

    return result
  }
 
  // Proxy del stream usando axios — soporta Range requests (seek)
  async getStream(videoId: string, quality: AudioQuality, type: StreamType = 'audio'): Promise<StreamResult> {
    const { directUrl, mimeType, contentLength } = await this.getDirectUrlForStreaming(videoId, quality, type)
 
    const response = await axios.get(directUrl, {
      responseType: 'stream',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible)',
      },
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    })
 
    return {
      stream: response.data as Readable,
      mimeType,
      contentLength,
    }
  }
 
  // Proxy con soporte de Range (necesario para seek en el reproductor)
  async getStreamWithRange(
    videoId: string,
    quality: AudioQuality,
    type: StreamType = 'audio',
    range?: string,
  ): Promise<StreamResult & { statusCode: number }> {
    const { directUrl, mimeType, contentLength } = await this.getDirectUrlForStreaming(videoId, quality, type)
 
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (compatible)',
    }
    if (range) headers['Range'] = range
 
    const response = await axios.get(directUrl, {
      responseType: 'stream',
      headers,
      validateStatus: (s) => s < 400,
      httpAgent: this.httpAgent,
      httpsAgent: this.httpsAgent,
    })
 
    const cl = response.headers['content-length']
    const contentRange = response.headers['content-range']
 
    return {
      stream:        response.data as Readable,
      mimeType,
      contentLength: cl ? parseInt(cl, 10) : contentLength,
      contentRange:  typeof contentRange === 'string' ? contentRange : undefined,
      statusCode:    response.status,
    }
  }
}