import { Injectable, OnModuleDestroy } from '@nestjs/common'

interface CacheEntry<T> {
  value: T
  expiresAt: number
  lastAccessedAt: number
}

@Injectable()
export class AudioCacheService implements OnModuleDestroy {
  private readonly cache = new Map<string, CacheEntry<unknown>>()
  private readonly maxItems = 500
  private readonly cleanupIntervalMs = 60_000
  private readonly cleanupTimer: NodeJS.Timeout

  private hits = 0
  private misses = 0
  private evictions = 0

  constructor() {
    this.cleanupTimer = setInterval(() => this.cleanupExpired(), this.cleanupIntervalMs)
    this.cleanupTimer.unref?.()
  }

  get<T = unknown>(key: string): T | null {
    const item = this.cache.get(key)

    if (!item) {
      this.misses += 1
      return null
    }

    if (item.expiresAt < Date.now()) {
      this.cache.delete(key)
      this.misses += 1
      return null
    }

    this.hits += 1
    item.lastAccessedAt = Date.now()
    this.cache.delete(key)
    this.cache.set(key, item)

    return item.value as T
  }

  set<T = unknown>(key: string, value: T, ttl: number) {
    if (this.cache.has(key)) {
      this.cache.delete(key)
    } else if (this.cache.size >= this.maxItems) {
      this.evictLeastRecentlyUsed()
    }

    this.cache.set(key, {
      value,
      expiresAt: Date.now() + ttl,
      lastAccessedAt: Date.now(),
    })
  }

  getMetrics() {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRate: total === 0 ? 0 : this.hits / total,
    }
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer)
  }

  private cleanupExpired() {
    const now = Date.now()
    for (const [key, item] of this.cache.entries()) {
      if (item.expiresAt < now) {
        this.cache.delete(key)
      }
    }
  }

  private evictLeastRecentlyUsed() {
    const oldestKey = this.cache.keys().next().value as string | undefined
    if (!oldestKey) return

    this.cache.delete(oldestKey)
    this.evictions += 1
  }
}