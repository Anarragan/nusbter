export const AUDIO_STREAM_SERVICE = Symbol('AUDIO_STREAM_SERVICE')

export type AudioQuality = 'best' | 'worst'
export type StreamType = 'audio' | 'av'

export interface StreamOptions {
  quality: AudioQuality
  type: StreamType
  range?: string
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
}