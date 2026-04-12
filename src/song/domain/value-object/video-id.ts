export class VideoId {
  private constructor(public readonly value: string) {}

  static create(value: string): VideoId {
    if (!value?.trim()) {
      throw new Error('videoId cannot be empty')
    }

    const trimmed = value.trim()

    if (trimmed.length !== 11) {
      throw new Error('Invalid videoId')
    }

    return new VideoId(trimmed)
  }
}