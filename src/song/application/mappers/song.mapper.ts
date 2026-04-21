import { Song } from '../../domain/entities/song.entity'
import { SongDTO } from '../dto/songDTO'
import type { PreloadState } from '../../domain/services/audio-stream.service'

export class SongMapper {
  static toDTO(song: Song, preloadState?: PreloadState): SongDTO {
    return {
      videoId: song.videoId,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      thumbnail: song.thumbnail,
      preload: preloadState,
    }
  }
}
