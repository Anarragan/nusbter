import {
  Controller,
  Get,
  Param,
  Req,
  Res,
  UseInterceptors,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { DownloadSong } from '../application/use-cases/download-song.use-case'
import { GetSongById } from '../application/use-cases/get-song-by-Id.use-case'
import { RequestLoggingInterceptor } from '../../common/interceptors/request-logging.interceptor'

@Controller('songs')
export class DownloadController {
  constructor(
    private readonly downloadSong: DownloadSong,
    private readonly getSongById: GetSongById,
  ) {}

  @Get(':videoId/download')
  @UseInterceptors(RequestLoggingInterceptor)
  async download(
    @Param('videoId') videoId: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const result = await this.downloadSong.execute({ videoId })
    const stream = result.stream

    const song = await this.getSongById.execute(videoId)
    const title = song?.title ?? videoId
    const safeTitle = title.replace(/[^\w\s]/gi, '')

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeTitle}.mp3"`
    )
    res.setHeader('X-Download-Source', result.source)

    if (result.contentLength) {
      res.setHeader('Content-Length', result.contentLength)
    }

    const cleanup = () => {
      if (!stream.destroyed) {
        stream.destroy()
      }
    }

    req.on('close', cleanup)
    res.on('close', cleanup)
    res.on('error', cleanup)

    stream.on('error', () => {
      cleanup()
      res.end()
    })

    stream.pipe(res)
  }
}