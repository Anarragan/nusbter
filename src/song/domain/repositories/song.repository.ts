import { Song } from '../entities/song.entity'
 
// Token para la inyección de dependencias en NestJS
export const SONG_REPOSITORY = 'SONG_REPOSITORY'
 
export interface SongRepository {
  search(query: string, limit?: number): Promise<Song[]>
}