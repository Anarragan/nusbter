import { Injectable, OnModuleInit } from '@nestjs/common'
import YTMusic from 'ytmusic-api'
import { Song } from '../../domain/entities/song.entity'
import { SongRepository } from '../../domain/repositories/song.repository'
 
@Injectable()
export class YTMusicSongRepository implements SongRepository, OnModuleInit {
  private ytmusic: YTMusic
 
  constructor() {
    this.ytmusic = new YTMusic()
  }

  async onModuleInit(): Promise<void> {
    await this.ytmusic.initialize()
  }
 
  async search(query: string, limit: number = 10): Promise<Song[]> {
    const results = await this.ytmusic.searchSongs(query)
 
    return results.slice(0, limit).map(
      (item) =>
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
}