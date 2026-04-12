import { Injectable, Inject } from '@nestjs/common'
import { SONG_REPOSITORY } from '../../domain/repositories/song.repository'
import type { SongRepository } from '../../domain/repositories/song.repository'
import { SearchQuery } from '../../domain/value-object/search-query'
import { SearchLimit } from '../../domain/value-object/search-limit'
import { SongMapper } from '../mappers/song.mapper'
import { SongDTO } from '../dto/songDTO'

export interface SearchSongsInput {
  query: string
  limit?: number
}

export interface SearchSongsOutput {
  songs: SongDTO[]
  total: number
  query: string
}

@Injectable()
export class SearchSongs {
  constructor(
    @Inject(SONG_REPOSITORY)
    private readonly songRepository: SongRepository,
  ) {}

  async execute(input: SearchSongsInput): Promise<SearchSongsOutput> {
  const query = SearchQuery.create(input.query)
  const limit = SearchLimit.create(input.limit)

  const songs = await this.songRepository.search(query, limit)

  return {
    songs: songs.map(SongMapper.toDTO),
    total: songs.length,
    query: query.value,
  }
}
}