import { Module } from '@nestjs/common'
import { SongController } from './song.controller'
import { StreamController } from './stream.controller'
import { SearchSongsUseCase } from './application/use-cases/search-song.use-case'
import { StreamSongUseCase } from './application/use-cases/stream-song.use-case'
import { YTMusicSongRepository } from './infraestrucutre/repositories/ytmusic-song.repository'
import { YtDlpAudioStreamRepository } from './infraestrucutre/repositories/ytdlp-audio-stream.repository'
import { SONG_REPOSITORY } from './domain/repositories/song.repository'
import { AUDIO_STREAM_REPOSITORY } from './domain/repositories/audio-stream.repository'
import { RequestLoggingInterceptor } from '../common/interceptors/request-logging.interceptor'
 
@Module({
  controllers: [SongController, StreamController],
  providers: [
    RequestLoggingInterceptor,
    // Casos de uso
    SearchSongsUseCase,
    StreamSongUseCase,
 
    // Adaptadores inyectados por token
    // Para cambiar de implementación solo tocas aquí — los casos de uso no se enteran
    {
      provide: SONG_REPOSITORY,
      useClass: YTMusicSongRepository,
    },
    {
      provide: AUDIO_STREAM_REPOSITORY,
      useClass: YtDlpAudioStreamRepository,
    },
  ],
})
export class SongModule {}