export interface SongProps {
  videoId: string
  title: string
  artist: string
  album?: string
  duration?: number
  thumbnail?: string
}
 
export class Song {
  readonly videoId: string
  readonly title: string
  readonly artist: string
  readonly album?: string
  readonly duration?: number
  readonly thumbnail?: string
 
  constructor(props: SongProps) {
    if (!props.videoId) throw new Error('Song must have a videoId')
    if (!props.title)   throw new Error('Song must have a title')
    if (!props.artist)  throw new Error('Song must have an artist')
 
    this.videoId   = props.videoId
    this.title     = props.title
    this.artist    = props.artist
    this.album     = props.album
    this.duration  = props.duration
    this.thumbnail = props.thumbnail
  }
 
  toJSON(): SongProps {
    return {
      videoId:   this.videoId,
      title:     this.title,
      artist:    this.artist,
      album:     this.album,
      duration:  this.duration,
      thumbnail: this.thumbnail,
    }
  }
}