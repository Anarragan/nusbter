import { Song } from '../entities/song.entity'
import { SearchQuery } from '../value-object/search-query'
import { SearchLimit } from '../value-object/search-limit'

export const SONG_REPOSITORY = Symbol('SONG_REPOSITORY')

export interface SongRepository {
  search(query: SearchQuery, limit: SearchLimit): Promise<Song[]>

  getById(videoId: string): Promise<Song | null>
}