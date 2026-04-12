import { Injectable } from '@nestjs/common'

@Injectable()
export class AudioCacheService {
  private cache = new Map<string, any>()

  get(key: string) {
    const item = this.cache.get(key)
    if (!item || item.expiresAt < Date.now()) return null
    return item.value
  }

  set(key: string, value: any, ttl: number) {
    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
    })
  }
}