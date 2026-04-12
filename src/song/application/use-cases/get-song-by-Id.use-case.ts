import { Injectable, Inject } from '@nestjs/common'
import { SONG_REPOSITORY, type SongRepository } from '../../domain/repositories/song.repository'
import { VideoId } from '../../domain/value-object/video-id'

@Injectable()
export class GetSongById {
  constructor(
    @Inject(SONG_REPOSITORY)
    private readonly songRepository: SongRepository,
  ) {}

  async execute(videoIdRaw: string) {
    const videoId = VideoId.create(videoIdRaw)

    return this.songRepository.getById(videoId.value)
  }
}