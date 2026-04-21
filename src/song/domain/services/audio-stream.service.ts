export const AUDIO_STREAM_SERVICE = Symbol('AUDIO_STREAM_SERVICE')

export type AudioQuality = 'best' | 'worst'
export type StreamType = 'audio' | 'av'
export type PreloadStatus = 'cached' | 'warming' | 'missed' | 'failed'

export interface StreamOptions {
  quality: AudioQuality
  type: StreamType
  range?: string
}

export interface PreloadOptions {
  quality: AudioQuality
  type: StreamType
  concurrency?: number
  timeoutMs?: number
  waitForWarm?: boolean
}

export interface PreloadState {
  status: PreloadStatus
  updatedAt: number
}

export interface StreamResult {
  stream: unknown        
  mimeType: string
  contentLength?: number
  contentRange?: string
  statusCode?: number
}

export interface AudioStreamService {
  getStream(videoId: string, options: StreamOptions): Promise<StreamResult>
  preload(videoIds: string[], options?: Partial<PreloadOptions>): Promise<void>
  getPreloadState(
    videoId: string,
    options?: Partial<Pick<PreloadOptions, 'quality' | 'type'>>,
  ): Promise<PreloadState>
}