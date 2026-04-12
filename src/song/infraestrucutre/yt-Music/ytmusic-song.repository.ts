import { Injectable, OnModuleInit } from '@nestjs/common'
import YTMusic from 'ytmusic-api'
import { Song } from '../../domain/entities/song.entity'
import { SongRepository } from '../../domain/repositories/song.repository'
import { SearchQuery } from '../../domain/value-object/search-query'
import { SearchLimit } from '../../domain/value-object/search-limit'

@Injectable()
export class YTMusicSongRepository implements SongRepository, OnModuleInit {
  private ytmusic: YTMusic

  constructor() {
    this.ytmusic = new YTMusic()
  }

  async onModuleInit(): Promise<void> {
    await this.ytmusic.initialize()
  }

  async search(query: SearchQuery, limit: SearchLimit): Promise<Song[]> {
    const results = await this.ytmusic.searchSongs(query.value)

    return results
      .slice(0, limit.value)
      .map((item) =>
        new Song({
          videoId:   item.videoId,
          title:     item.name,
          artist:    item.artist?.name ?? 'Unknown Artist',
          album:     item.album?.name,
          duration:  item.duration ?? undefined,
          thumbnail: item.thumbnails?.[0]?.url ?? undefined,
        }),
      )
  }

  async getById(videoId: string): Promise<Song | null> {
  try {
    const item = await this.ytmusic.getSong(videoId)

    if (!item) return null

    return new Song({
      videoId: item.videoId,
      title: item.name,
      artist: item.artist?.name ?? 'Unknown Artist',
      duration: item.duration ?? undefined,
      thumbnail: item.thumbnails?.[0]?.url ?? undefined,
    })
  } catch {
    return null
  }
}
}