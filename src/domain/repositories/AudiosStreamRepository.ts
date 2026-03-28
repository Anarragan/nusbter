// Puerto para obtener streams de audio.
// Separado de SongRepository porque son responsabilidades distintas:
// una busca metadata, otra obtiene el stream binario.
 
import { Readable } from 'stream'
import { AudioQuality } from '../entities/song/AudioStream'
 
export interface StreamResult {
  stream: Readable
  mimeType: string
  contentLength?: number
}
 
export interface AudioStreamRepository {
  getStream(videoId: string, quality: AudioQuality): Promise<StreamResult>
}