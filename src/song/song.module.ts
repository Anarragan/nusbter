import { Module } from '@nestjs/common'

// Controllers
import { SongController } from './controllers/song.controller'
import { StreamController } from './controllers/stream.controller'
import { DownloadController } from './controllers/download.controller'
import { MetricsController } from './controllers/metrics.controller'
import { PreloadController } from './controllers/preload.controller'

// Use cases
import { SearchSongs } from './application/use-cases/search-song.use-case'
import { StreamSong } from './application/use-cases/stream-song.use-case'
import { DownloadSong } from './application/use-cases/download-song.use-case'
import { GetSongById } from './application/use-cases/get-song-by-Id.use-case'

// Domain tokens
import { SONG_REPOSITORY } from './domain/repositories/song.repository'
import { AUDIO_STREAM_SERVICE } from './domain/services/audio-stream.service'

// Infrastructure - ytmusic
import { YTMusicSongRepository } from './infraestrucutre/yt-Music/ytmusic-song.repository'

// Infrastructure - yt (stream)
import { YtStreamService } from './infraestrucutre/yt/streaming/yt-Stream.service'
import { YtDlpClient } from './infraestrucutre/yt/yt-dlp-Client.service'
import { YtUrlResolver } from './infraestrucutre/yt/yt-url-resolver.service'
import { HttpStreamClient } from './infraestrucutre/yt/HttpStreamClient'

// Infrastructure - cache
import { AudioCacheService } from './infraestrucutre/cache/AudioCacheService'
import { DownloadFileCacheService } from './infraestrucutre/cache/DownloadFileCacheService'

// Infrastructure - media
import { FfmpegService } from './infraestrucutre/media/ffmeg.service'
import { DownloadPreparationService } from './infraestrucutre/media/download-preparation.service'

// Common
import { RequestLoggingInterceptor } from '../common/interceptors/request-logging.interceptor'
import { RequestMetricsService } from '../common/services/request-metrics.service'

@Module({
  controllers: [SongController, StreamController, DownloadController, MetricsController, PreloadController],

  providers: [
    // Interceptors
    RequestLoggingInterceptor,
    RequestMetricsService,

    // Use cases
    SearchSongs,
    StreamSong,
    DownloadSong,
    GetSongById,
    {
      provide: SONG_REPOSITORY,
      useClass: YTMusicSongRepository,
    },
    YtStreamService,
    {
      provide: AUDIO_STREAM_SERVICE,
      useExisting: YtStreamService,
    },

    // Infra dependencies (auto-injected)
    YtDlpClient,
    YtUrlResolver,
    HttpStreamClient,
    AudioCacheService,
    DownloadFileCacheService,
    FfmpegService,
    DownloadPreparationService,
  ],
})
export class SongModule {}