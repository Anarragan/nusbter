import { Injectable, OnModuleDestroy } from '@nestjs/common'
import { access, mkdir, stat, unlink } from 'fs/promises'
import { join } from 'path'

interface DownloadCacheEntry {
  filePath: string
  sizeBytes: number
  expiresAt: number
  lastAccessedAt: number
}

@Injectable()
export class DownloadFileCacheService implements OnModuleDestroy {
  private readonly entries = new Map<string, DownloadCacheEntry>()
  private readonly pendingBuilds = new Map<string, Promise<{ filePath: string; sizeBytes: number; fromCache: boolean }>>()

  private readonly cacheDir = join(process.cwd(), '.cache', 'downloads')
  private readonly defaultTtlMs = 45 * 60 * 1000
  private readonly maxItems = 40
  private readonly cleanupIntervalMs = 2 * 60 * 1000
  private readonly cleanupTimer: NodeJS.Timeout

  private hits = 0
  private misses = 0
  private builds = 0
  private buildFailures = 0
  private evictions = 0

  constructor() {
    this.cleanupTimer = setInterval(() => {
      void this.cleanupExpired()
    }, this.cleanupIntervalMs)
    this.cleanupTimer.unref?.()
  }

  async get(key: string): Promise<{ filePath: string; sizeBytes: number; fromCache: boolean } | null> {
    const entry = this.entries.get(key)

    if (!entry) {
      this.misses += 1
      return null
    }

    if (entry.expiresAt < Date.now()) {
      await this.deleteEntry(key)
      this.misses += 1
      return null
    }

    const exists = await this.fileExists(entry.filePath)
    if (!exists) {
      this.entries.delete(key)
      this.misses += 1
      return null
    }

    this.hits += 1
    entry.lastAccessedAt = Date.now()
    this.entries.delete(key)
    this.entries.set(key, entry)

    return {
      filePath: entry.filePath,
      sizeBytes: entry.sizeBytes,
      fromCache: true,
    }
  }

  async getOrBuild(
    key: string,
    builder: (outputPath: string) => Promise<void>,
    ttlMs?: number,
  ): Promise<{ filePath: string; sizeBytes: number; fromCache: boolean }> {
    const cached = await this.get(key)
    if (cached) {
      return cached
    }

    const pending = this.pendingBuilds.get(key)
    if (pending) {
      return pending
    }

    const buildPromise = this.buildFile(key, builder, ttlMs)
      .finally(() => {
        this.pendingBuilds.delete(key)
      })

    this.pendingBuilds.set(key, buildPromise)
    return buildPromise
  }

  getMetrics() {
    return {
      cacheDir: this.cacheDir,
      entries: this.entries.size,
      inFlightBuilds: this.pendingBuilds.size,
      hits: this.hits,
      misses: this.misses,
      builds: this.builds,
      buildFailures: this.buildFailures,
      evictions: this.evictions,
      approxSizeBytes: this.approximateSizeBytes(),
    }
  }

  onModuleDestroy() {
    clearInterval(this.cleanupTimer)
  }

  private async buildFile(
    key: string,
    builder: (outputPath: string) => Promise<void>,
    ttlMs?: number,
  ): Promise<{ filePath: string; sizeBytes: number; fromCache: boolean }> {
    await this.ensureCacheDir()
    const outputPath = this.buildOutputPath(key)

    try {
      await builder(outputPath)
      const fileStat = await stat(outputPath)

      await this.setEntry(key, outputPath, fileStat.size, ttlMs ?? this.defaultTtlMs)
      this.builds += 1

      return {
        filePath: outputPath,
        sizeBytes: fileStat.size,
        fromCache: false,
      }
    } catch (error) {
      this.buildFailures += 1
      await this.safeUnlink(outputPath)
      throw error
    }
  }

  private async ensureCacheDir() {
    await mkdir(this.cacheDir, { recursive: true })
  }

  private async setEntry(key: string, filePath: string, sizeBytes: number, ttlMs: number) {
    if (this.entries.has(key)) {
      const previous = this.entries.get(key)
      if (previous && previous.filePath !== filePath) {
        await this.safeUnlink(previous.filePath)
      }
      this.entries.delete(key)
    }

    while (this.entries.size >= this.maxItems) {
      const oldestKey = this.entries.keys().next().value as string | undefined
      if (!oldestKey) {
        break
      }
      await this.deleteEntry(oldestKey)
      this.evictions += 1
    }

    this.entries.set(key, {
      filePath,
      sizeBytes,
      expiresAt: Date.now() + ttlMs,
      lastAccessedAt: Date.now(),
    })
  }

  private buildOutputPath(key: string): string {
    const safeKey = key.replace(/[^a-zA-Z0-9_.:-]/g, '_')
    const nonce = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    return join(this.cacheDir, `${safeKey}-${nonce}.mp3`)
  }

  private async cleanupExpired() {
    const now = Date.now()

    for (const [key, entry] of this.entries.entries()) {
      if (entry.expiresAt < now) {
        await this.deleteEntry(key)
      }
    }
  }

  private async deleteEntry(key: string) {
    const entry = this.entries.get(key)
    if (!entry) {
      return
    }

    this.entries.delete(key)
    await this.safeUnlink(entry.filePath)
  }

  private async safeUnlink(filePath: string) {
    try {
      await unlink(filePath)
    } catch {
      // Si no existe o esta bloqueado temporalmente, evitamos romper el flujo.
    }
  }

  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await access(filePath)
      return true
    } catch {
      return false
    }
  }

  private approximateSizeBytes(): number {
    let total = 0
    for (const entry of this.entries.values()) {
      total += entry.sizeBytes
    }
    return total
  }
}
