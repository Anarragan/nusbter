import { Injectable } from '@nestjs/common'
import { spawn } from 'child_process'
import { createWriteStream } from 'fs'
import { PassThrough, Readable } from 'stream'

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

    const output = new PassThrough()
    let finished = false

    const fail = (error: Error) => {
      if (finished) return
      finished = true

      if (!ffmpeg.killed) {
        ffmpeg.kill('SIGKILL')
      }

      output.destroy(error)
    }

    ffmpeg.on('error', (error) => fail(error))

    ffmpeg.on('close', (code) => {
      if (finished) return
      finished = true

      if (code === 0) {
        output.end()
        return
      }

      output.destroy(new Error(`ffmpeg exited with code ${code ?? 'unknown'}`))
    })

    ffmpeg.stdin.on('error', () => {
      // Ignora EPIPE si ffmpeg terminó antes de que finalice el input.
    })

    inputStream.on('error', (error) => fail(error instanceof Error ? error : new Error('Input stream error')))

    ffmpeg.stdout.pipe(output)

    inputStream.pipe(ffmpeg.stdin)

    return output
  }

  async convertToMp3File(inputStream: Readable, outputPath: string): Promise<void> {
    const ffmpeg = spawn('ffmpeg', [
      '-i', 'pipe:0',
      '-vn',
      '-acodec', 'libmp3lame',
      '-ab', '192k',
      '-f', 'mp3',
      'pipe:1',
    ])

    const output = createWriteStream(outputPath)

    await new Promise<void>((resolve, reject) => {
      let finished = false

      const fail = (error: Error) => {
        if (finished) return
        finished = true

        if (!ffmpeg.killed) {
          ffmpeg.kill('SIGKILL')
        }

        output.destroy()
        reject(error)
      }

      ffmpeg.on('error', (error) => fail(error))

      ffmpeg.on('close', (code) => {
        if (finished) return
        finished = true

        if (code === 0) {
          resolve()
          return
        }

        reject(new Error(`ffmpeg exited with code ${code ?? 'unknown'}`))
      })

      ffmpeg.stdin.on('error', () => {
        // Ignora EPIPE si ffmpeg terminó antes de que finalice el input.
      })

      inputStream.on('error', (error) => fail(error instanceof Error ? error : new Error('Input stream error')))

      ffmpeg.stderr.on('data', () => {
        // Consumimos stderr para evitar bloqueo del buffer interno del proceso.
      })

      output.on('error', (error) => fail(error))
      output.on('finish', () => {
        if (finished) return
        finished = true
        resolve()
      })

      ffmpeg.stdout.pipe(output)
      inputStream.pipe(ffmpeg.stdin)
    })
  }

  async saveStreamToFile(inputStream: Readable, outputPath: string): Promise<void> {
    const output = createWriteStream(outputPath)

    await new Promise<void>((resolve, reject) => {
      let finished = false

      const fail = (error: Error) => {
        if (finished) return
        finished = true
        output.destroy()
        reject(error)
      }

      output.on('error', (error) => fail(error))
      inputStream.on('error', (error) => fail(error instanceof Error ? error : new Error('Input stream error')))

      output.on('finish', () => {
        if (finished) return
        finished = true
        resolve()
      })

      inputStream.pipe(output)
    })
  }
}