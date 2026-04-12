import { Readable } from 'stream'
import { Controller, Get, UseInterceptors, Param, Query, Req, Res } from '@nestjs/common'
import type{ Request, Response } from 'express'
import { StreamSong } from '../application/use-cases/stream-song.use-case'
import { RequestLoggingInterceptor } from '../../common/interceptors/request-logging.interceptor'

@Controller('songs')
export class StreamController {
  constructor(private streamSongUseCase: StreamSong) {}

  @Get(':videoId/stream')
  @UseInterceptors(RequestLoggingInterceptor)
  async stream(
    @Param('videoId') videoId: string,
    @Query('type') type: 'audio' | 'av' = 'audio',
    @Query('quality') quality: 'best' | 'worst' = 'best',
    @Req() req: Request,
    @Res() res: Response,
  ) {
  const range = req.headers['range'] as string | undefined

  const result = await this.streamSongUseCase.execute({
    videoId,
    type,
    quality,
  })

  const stream = result.stream as Readable

  res.setHeader('Content-Type', result.mimeType)
  res.setHeader('Accept-Ranges', 'bytes')
  res.setHeader('Cache-Control', 'no-cache')

  if (result.contentRange) {
    res.setHeader('Content-Range', result.contentRange)
  }

  if (result.contentLength) {
    res.setHeader('Content-Length', result.contentLength)
  }

  res.status(result.statusCode ?? 200)

  if (typeof (res as any).flushHeaders === 'function') {
    ;(res as any).flushHeaders()
  }

  req.on('close', () => stream.destroy())

  stream.on('error', () => res.end())

  stream.pipe(res)
  }
}