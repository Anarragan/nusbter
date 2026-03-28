import { Request, Response, NextFunction } from 'express'
import { StreamSongUseCase } from '../../../aplication/song/use-cases/StreamSongUseCase'
import { AudioQuality } from '../../../domain/entities/song/AudioStream'
 
export class StreamController {
  constructor(private readonly streamSongUseCase: StreamSongUseCase) {}
 
  /**
   * @swagger
   * /api/songs/{videoId}/stream:
   *   get:
   *     summary: Stream de audio de una canción
   *     description: >
   *       Devuelve el audio de una canción en streaming.
   *       Compatible con el tag <audio> de HTML y Postman.
   *       Usa el videoId obtenido del endpoint /search.
   *     tags: [Stream]
   *     parameters:
   *       - in: path
   *         name: videoId
   *         required: true
   *         schema:
   *           type: string
   *           minLength: 11
   *           maxLength: 11
   *         description: ID del video de YouTube (11 caracteres)
   *         example: dQw4w9WgXcQ
   *       - in: query
   *         name: quality
   *         required: false
   *         schema:
   *           type: string
   *           enum: [best, worst]
   *           default: best
   *         description: Calidad del audio
   *     responses:
   *       200:
   *         description: Stream de audio
   *         content:
   *           audio/webm:
   *             schema:
   *               type: string
   *               format: binary
   *           audio/mp4:
   *             schema:
   *               type: string
   *               format: binary
   *       400:
   *         description: videoId inválido
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   *       500:
   *         description: Error al obtener el stream
   *         content:
   *           application/json:
   *             schema:
   *               $ref: '#/components/schemas/Error'
   */
  async stream(req: Request, res: Response, next: NextFunction): Promise<void> {
    const { videoId } = req.params
    const quality     = (req.query.quality as AudioQuality) ?? 'best'
 
    if (!['best', 'worst'].includes(quality)) {
      res.status(400).json({
        success: false,
        error: { message: 'quality must be "best" or "worst"' },
      })
      return
    }
 
    try {
      const { stream, mimeType, contentLength } = await this.streamSongUseCase.execute({
        videoId,
        quality,
      })
 
      // Headers para que el cliente (browser, Postman, app) sepa qué recibe
      res.setHeader('Content-Type', mimeType)
      res.setHeader('Transfer-Encoding', 'chunked')
      res.setHeader('Accept-Ranges', 'bytes')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('X-Video-Id', videoId)
 
      if (contentLength) {
        res.setHeader('Content-Length', contentLength)
      }
 
      // Si el cliente corta la conexión, destruimos el stream
      req.on('close', () => {
        stream.destroy()
        console.log(`[Stream] Client disconnected — stream for ${videoId} destroyed`)
      })
 
      stream.on('error', (err) => {
        console.error(`[Stream] Error streaming ${videoId}:`, err.message)
        // Si ya se empezó a enviar el response no podemos mandar JSON
        if (!res.headersSent) {
          next(err)
        } else {
          res.end()
        }
      })
 
      // Pipe del stream de yt-dlp directo al response HTTP
      stream.pipe(res)
 
    } catch (error) {
      next(error)
    }
  }
}