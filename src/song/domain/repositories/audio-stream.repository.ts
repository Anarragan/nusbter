import { Readable } from 'stream'
 
export const AUDIO_STREAM_REPOSITORY = 'AUDIO_STREAM_REPOSITORY'
 
export type AudioQuality = 'best' | 'worst'

export type StreamType = 'audio' | 'av'
 
export interface StreamResult {
  stream: Readable
  mimeType: string
  contentLength?: number
  contentRange?: string
}
 
export interface DirectUrlResult {
  directUrl: string
  mimeType: string
  contentLength?: number
}
 
export interface AudioStreamRepository {
  getStream(videoId: string, quality: AudioQuality, type?: StreamType): Promise<StreamResult>
  getDirectUrl(videoId: string, quality: AudioQuality, type?: StreamType): Promise<DirectUrlResult>
  getStreamWithRange(
    videoId: string,
    quality: AudioQuality,
    type?: StreamType,
    range?: string,
  ): Promise<StreamResult & { statusCode: number }>
}