import { Module } from '@nestjs/common'
import { SongModule } from './song/song.module'
import { ConfigModule } from '@nestjs/config'

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }), SongModule],
})
export class AppModule {}
 