import { Controller, Get, Query, UseInterceptors } from '@nestjs/common'
import { SearchSongs } from '../application/use-cases/search-song.use-case'
import { RequestLoggingInterceptor } from '../../common/interceptors/request-logging.interceptor'

@Controller('songs')
export class SongController {
  constructor(private readonly searchSongsUseCase: SearchSongs) {}

  @Get('search')
  @UseInterceptors(RequestLoggingInterceptor)
  async search(
    @Query('q') query: string,
  @Query('limit') limit?: string,
) {
  const result = await this.searchSongsUseCase.execute({
    query,
    limit: limit ? parseInt(limit, 10) : undefined,
  })

  return { success: true, data: result }
}
}