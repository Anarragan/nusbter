import { Injectable, Inject } from '@nestjs/common'
import { SONG_REPOSITORY } from '../../domain/repositories/song.repository'
import type { SongRepository } from '../../domain/repositories/song.repository'
import { SearchQuery } from '../../domain/value-object/search-query'
import { SearchLimit } from '../../domain/value-object/search-limit'
import { SongMapper } from '../mappers/song.mapper'
import { SongDTO } from '../dto/songDTO'
import { AUDIO_STREAM_SERVICE } from '../../domain/services/audio-stream.service'
import type { AudioStreamService } from '../../domain/services/audio-stream.service'
import { DownloadPreparationService } from '../../infraestrucutre/media/download-preparation.service'

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

    @Inject(AUDIO_STREAM_SERVICE)
    private readonly audioService: AudioStreamService,

    private readonly downloadPreparationService: DownloadPreparationService,
  ) {}

  async execute(input: SearchSongsInput): Promise<SearchSongsOutput> {
    const query = SearchQuery.create(input.query)
    const limit = SearchLimit.create(input.limit)

    const songs = await this.songRepository.search(query, limit)
    const topVideoIds = songs.slice(0, 5).map((song) => song.videoId)

    // La precarga corre en segundo plano para no penalizar la respuesta de búsqueda.
    void this.audioService.preload(topVideoIds, {
      quality: 'best',
      type: 'audio',
      concurrency: 2,
      timeoutMs: 7_000,
    }).catch(() => undefined)

    // Precarga selectiva de MP3 para acelerar la descarga de resultados probables.
    void this.downloadPreparationService.preload(topVideoIds.slice(0, 3), {
      concurrency: 1,
      timeoutMs: 15_000,
      waitForWarm: false,
    }).catch(() => undefined)

    const songsDto = await Promise.all(
      songs.map(async (song) => {
        const preloadState = await this.audioService.getPreloadState(song.videoId, {
          quality: 'best',
          type: 'audio',
        })

        return SongMapper.toDTO(song, preloadState)
      }),
    )

    return {
      songs: songsDto,
      total: songs.length,
      query: query.value,
    }
  }
}
