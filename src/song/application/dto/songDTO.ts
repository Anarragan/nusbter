import type { PreloadStatus } from '../../domain/services/audio-stream.service'

export interface SongDTO {
  videoId: string
  title: string
  artist: string
  duration?: number
  thumbnail?: string
  preload?: {
    status: PreloadStatus
    updatedAt: number
  }
}