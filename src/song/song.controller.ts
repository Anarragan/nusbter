import { Controller, Get, Query, BadRequestException, UseInterceptors } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { SearchSongsUseCase } from './application/use-cases/search-song.use-case'
import { RequestLoggingInterceptor } from '../common/interceptors/request-logging.interceptor'
 
@ApiTags('songs')
@Controller('songs')
export class SongController {
  constructor(private readonly searchSongsUseCase: SearchSongsUseCase) {}
 
  @Get('search')
  @UseInterceptors(RequestLoggingInterceptor)
  @ApiOperation({ summary: 'Buscar canciones en YouTube Music' })
  @ApiQuery({ name: 'q',     required: true,  description: 'Término de búsqueda', example: 'Bohemian Rhapsody' })
  @ApiQuery({ name: 'limit', required: false, description: 'Máximo de resultados (1-50)', example: 10 })
  @ApiResponse({ status: 200, description: 'Lista de canciones encontradas' })
  @ApiResponse({ status: 400, description: 'Parámetros inválidos' })
  async search(
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? parseInt(limit, 10) : 10
 
    if (limit && isNaN(parsedLimit)) {
      throw new BadRequestException('limit must be a number')
    }
 
    const result = await this.searchSongsUseCase.execute({
      query,
      limit: parsedLimit,
    })
 
    return { success: true, data: result }
  }
}