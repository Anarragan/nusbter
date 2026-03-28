// Caso de uso: obtener el stream de audio de una canción.
// No sabe nada de HTTP ni de yt-dlp — solo orquesta.
 
import { AudioStreamRepository, StreamResult } from '../../../domain/repositories/AudiosStreamRepository'
import { AudioQuality } from '../../../domain/entities/song/AudioStream'
 
export interface StreamSongInput {
  videoId: string
  quality?: AudioQuality
}
 
export class StreamSongUseCase {
  constructor(private readonly audioStreamRepository: AudioStreamRepository) {}
 
  async execute(input: StreamSongInput): Promise<StreamResult> {
    const { videoId, quality = 'best' } = input
 
    if (!videoId || videoId.trim().length === 0) {
      throw new Error('videoId cannot be empty')
    }
 
    // Los videoIds de YouTube tienen siempre 11 caracteres
    if (videoId.trim().length !== 11) {
      throw new Error('Invalid videoId format — must be 11 characters')
    }
 
    return this.audioStreamRepository.getStream(videoId.trim(), quality)
  }
}
 