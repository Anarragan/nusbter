import { Song } from '../../domain/entities/song.entity'
import { SongDTO } from '../dto/songDTO'

export class SongMapper {
  static toDTO(song: Song): SongDTO {
    return {
      videoId: song.videoId,
      title: song.title,
      artist: song.artist,
      duration: song.duration,
      thumbnail: song.thumbnail,
    }
  }
}
