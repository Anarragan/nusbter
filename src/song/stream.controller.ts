import {
  Controller, Get, Param, Query,
  Res, Req, BadRequestException,
  Inject,
  UseInterceptors,
} from '@nestjs/common'
import { ApiTags, ApiOperation, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger'
import type { Request, Response } from 'express'
import { StreamSongUseCase } from './application/use-cases/stream-song.use-case'
import type { AudioQuality, AudioStreamRepository, StreamType } from './domain/repositories/audio-stream.repository'
import { AUDIO_STREAM_REPOSITORY } from './domain/repositories/audio-stream.repository'
import { RequestLoggingInterceptor } from '../common/interceptors/request-logging.interceptor'

@ApiTags('stream')
@Controller('songs')
export class StreamController {
  constructor(
    private readonly streamSongUseCase: StreamSongUseCase,
    @Inject(AUDIO_STREAM_REPOSITORY)
    private readonly audioStreamRepository: AudioStreamRepository,
  ) {}
 
  @Get(':videoId/stream')
  @UseInterceptors(RequestLoggingInterceptor)
  @ApiOperation({ summary: 'Stream (audio o video+audio) con soporte de Range (seek)' })
  @ApiParam({ name: 'videoId', description: 'ID de YouTube (11 caracteres)', example: 'dQw4w9WgXcQ' })
  @ApiQuery({ name: 'type', required: false, enum: ['audio', 'av'], description: 'audio = solo audio; av = progressive mp4 (audio+video)' })
  @ApiQuery({ name: 'quality', required: false, enum: ['best', 'worst'] })
  @ApiResponse({ status: 200, description: 'Stream completo' })
  @ApiResponse({ status: 206, description: 'Stream parcial (Range request)' })
  @ApiResponse({ status: 400, description: 'videoId inválido' })
  async stream(
    @Param('videoId') videoId: string,
    @Query('type') type: StreamType = 'audio',
    @Query('quality') quality: AudioQuality = 'best',
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const audioQuality = quality as AudioQuality
    const streamType = type as StreamType
 
    if (!['best', 'worst'].includes(audioQuality)) {
      throw new BadRequestException('quality must be "best" or "worst"')
    }

    if (!['audio', 'av'].includes(streamType)) {
      throw new BadRequestException('type must be "audio" or "av"')
    }
 
    // Validamos/normalizamos el videoId via use case (NO abrimos stream aquí)
    const validated = await this.streamSongUseCase.execute({ videoId, quality: audioQuality, type: streamType })
 
    const range = req.headers['range'] as string | undefined
 
    const { stream, mimeType, contentLength, statusCode, contentRange } =
      await this.audioStreamRepository.getStreamWithRange(validated.videoId, validated.quality, validated.type, range)
 
    // Headers base
    res.setHeader('Content-Type', mimeType)
    res.setHeader('Accept-Ranges', 'bytes')
    res.setHeader('Cache-Control', 'no-cache')
    res.setHeader('X-Video-Id', validated.videoId)
    res.setHeader('X-Stream-Type', validated.type)

    if (contentRange) {
      res.setHeader('Content-Range', contentRange)
    }
 
    if (contentLength) {
      res.setHeader('Content-Length', contentLength)
    }
 
    // 206 si es Range request, 200 si es el archivo completo
    res.status(statusCode ?? 200)

    // Enviamos headers lo antes posible para que el cliente empiece a reproducir
    // (especialmente útil con audio/video en navegadores)
    if (typeof (res as any).flushHeaders === 'function') {
      ;(res as any).flushHeaders()
    }
 
    req.on('close', () => stream.destroy())
 
    stream.on('error', (err: Error) => {
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: err.message })
      } else {
        res.end()
      }
    })
 
    stream.pipe(res)
  }
}