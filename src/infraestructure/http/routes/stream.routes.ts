import { Router } from 'express'
import { StreamController } from '../controllers/StreamController'
import { StreamSongUseCase } from '../../../aplication/song/use-cases/StreamSongUseCase'
import { YtDlpAudioStreamRepository } from '../../repositories/YtDlpAudiosStreamRepository'
 
const router = Router()
 
// Composición de dependencias
const audioStreamRepository = new YtDlpAudioStreamRepository()
const streamSongUseCase     = new StreamSongUseCase(audioStreamRepository)
const streamController      = new StreamController(streamSongUseCase)
 
// GET /api/songs/:videoId/stream?quality=best
router.get('/:videoId/stream', (req, res, next) =>
  streamController.stream(req, res, next)
)
 
export default router