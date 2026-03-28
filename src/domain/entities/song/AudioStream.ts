// Value object que representa un stream de audio listo para enviarse al cliente
 
export type AudioQuality = 'best' | 'worst'
 
export interface AudioStreamProps {
  videoId: string
  quality: AudioQuality
  mimeType: string        // ej: "audio/webm", "audio/mp4"
  contentLength?: number  // bytes, si está disponible
}
 
export class AudioStream {
  readonly videoId: string
  readonly quality: AudioQuality
  readonly mimeType: string
  readonly contentLength?: number
 
  constructor(props: AudioStreamProps) {
    if (!props.videoId) throw new Error('AudioStream must have a videoId')
 
    this.videoId       = props.videoId
    this.quality       = props.quality
    this.mimeType      = props.mimeType
    this.contentLength = props.contentLength
  }
}