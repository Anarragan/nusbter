import { Controller, Get, UseInterceptors } from '@nestjs/common'
import { AudioCacheService } from '../infraestrucutre/cache/AudioCacheService'
import { DownloadPreparationService } from '../infraestrucutre/media/download-preparation.service'
import { YtStreamService } from '../infraestrucutre/yt/streaming/yt-Stream.service'
import { RequestMetricsService } from '../../common/services/request-metrics.service'
import { RequestLoggingInterceptor } from '../../common/interceptors/request-logging.interceptor'

@Controller('songs')
export class MetricsController {
  constructor(
    private readonly streamService: YtStreamService,
    private readonly audioCacheService: AudioCacheService,
    private readonly downloadPreparationService: DownloadPreparationService,
    private readonly requestMetricsService: RequestMetricsService,
  ) {}

  @Get('metrics')
  @UseInterceptors(RequestLoggingInterceptor)
  async getMetrics(): Promise<{ success: true; data: Record<string, unknown> }> {
    return {
      success: true,
      data: {
        stream: await this.streamService.getMetrics(),
        audioCache: this.audioCacheService.getMetrics(),
        download: this.downloadPreparationService.getMetrics(),
        requests: this.requestMetricsService.getMetrics(),
      },
    }
  }
}
