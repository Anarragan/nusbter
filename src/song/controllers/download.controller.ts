import {
  Controller,
  Get,
  Param,
  Res,
} from '@nestjs/common'
import type { Response } from 'express'
import { DownloadSong } from '../application/use-cases/download-song.use-case'
import { GetSongById } from '../application/use-cases/get-song-by-Id.use-case'

@Controller('songs')
export class DownloadController {
  constructor(
    private readonly downloadSong: DownloadSong,
    private readonly getSongById: GetSongById,
  ) {}

  @Get(':videoId/download')
  async download(
    @Param('videoId') videoId: string,
    @Res() res: Response,
  ) {
    const stream = await this.downloadSong.execute({ videoId })

    const song = await this.getSongById.execute(videoId)
    const title = song?.title ?? videoId
    const safeTitle = title.replace(/[^\w\s]/gi, '')

    res.setHeader('Content-Type', 'audio/mpeg')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${safeTitle}.mp3"`
    )

    stream.pipe(res)
  }
}