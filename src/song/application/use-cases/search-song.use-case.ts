import { Injectable, Inject, BadRequestException } from '@nestjs/common'
import { SONG_REPOSITORY } from '../../domain/repositories/song.repository'
import type { SongRepository } from '../../domain/repositories/song.repository'
import { Song } from '../../domain/entities/song.entity'
 
export interface SearchSongsInput {
  query: string
  limit?: number
}
 
export interface SearchSongsOutput {
  songs: ReturnType<Song['toJSON']>[]
  total: number
  query: string
}
 
@Injectable()
export class SearchSongsUseCase {
  constructor(
    @Inject(SONG_REPOSITORY)
    private readonly songRepository: SongRepository,
  ) {}
 
  async execute(input: SearchSongsInput): Promise<SearchSongsOutput> {
    const { query, limit = 10 } = input
 
    if (!query?.trim()) {
      throw new BadRequestException('Search query cannot be empty')
    }
 
    if (limit < 1 || limit > 50) {
      throw new BadRequestException('Limit must be between 1 and 50')
    }
 
    const songs = await this.songRepository.search(query.trim(), limit)
 
    return {
      songs: songs.map((s) => s.toJSON()),
      total: songs.length,
      query: query.trim(),
    }
  }
}