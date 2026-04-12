import { Injectable } from '@nestjs/common'
import { spawn } from 'child_process'
import { Readable } from 'stream'

@Injectable()
export class FfmpegService {
  convertToMp3(inputStream: Readable): Readable {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',     // input desde stream
      '-vn',              // sin video
      '-acodec', 'libmp3lame',
      '-ab', '192k',
      '-f', 'mp3',
      'pipe:1',           // output a stream
    ])

    inputStream.pipe(ffmpeg.stdin)

    return ffmpeg.stdout
  }
}