// Adaptador: implementa AudioStreamRepository usando yt-dlp.
// yt-dlp-wrap lanza el binario yt-dlp como proceso hijo y nos da un stream Node.js.
//
// REQUISITO: tener yt-dlp instalado en el sistema.
//   macOS:   brew install yt-dlp
//   Linux:   sudo apt install yt-dlp  (o pip install yt-dlp)
//   Windows: winget install yt-dlp
 
import YTDlpWrap from 'yt-dlp-wrap'
import { Readable } from 'stream'
import { AudioStreamRepository, StreamResult } from '../../domain/repositories/AudiosStreamRepository'
import { AudioQuality } from '../../domain/entities/song/AudioStream'
 
// Mapeamos nuestra abstracción a los flags reales de yt-dlp
const QUALITY_FORMAT: Record<AudioQuality, string> = {
  best:  'bestaudio/best',
  worst: 'worstaudio/worst',
}
 
export class YtDlpAudioStreamRepository implements AudioStreamRepository {
  private ytDlp: YTDlpWrap
 
  constructor() {
    // Si yt-dlp no está en el PATH, puedes pasar la ruta absoluta aquí
    this.ytDlp = new YTDlpWrap()
  }
 
  async getStream(videoId: string, quality: AudioQuality): Promise<StreamResult> {
    const url    = `https://www.youtube.com/watch?v=${videoId}`
    const format = QUALITY_FORMAT[quality]
 
    // Primero obtenemos la info para saber el mimeType
    // y si está disponible el content-length
    let mimeType      = 'audio/webm'
    let contentLength: number | undefined
 
    try {
      const info = await this.ytDlp.getVideoInfo(url)
 
      // Buscamos el mejor formato de solo-audio
      const audioFormats = (info.formats as any[])
        ?.filter((f) => f.vcodec === 'none' && f.acodec !== 'none')
        ?.sort((a, b) => (b.abr ?? 0) - (a.abr ?? 0))
 
      if (audioFormats?.length > 0) {
        const best = audioFormats[0]
        mimeType      = best.audio_ext ? `audio/${best.audio_ext}` : 'audio/webm'
        contentLength = best.filesize ?? best.filesize_approx ?? undefined
      }
    } catch {
      // Si falla la inspección previa, seguimos igual — el stream puede funcionar igual
      console.warn(`[YtDlp] Could not prefetch info for ${videoId}, streaming anyway`)
    }
 
    // Obtenemos el stream de audio
    const stream = this.ytDlp.execStream([
      url,
      '-f', format,
      '--no-playlist',
      '-o', '-',          // output a stdout (pipe)
    ]) as unknown as Readable
 
    return { stream, mimeType, contentLength }
  }
}