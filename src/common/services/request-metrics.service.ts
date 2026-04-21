import { Injectable } from '@nestjs/common'

interface RouteMetrics {
  method: string
  route: string
  requests: number
  completed: number
  aborted: number
  errors5xx: number
  errors4xx: number
  avgDurationMs: number
  avgTtfbMs?: number
  lastStatusCode?: number
  lastDurationMs?: number
  lastSeenAt: number
}

interface MutableRouteMetrics {
  method: string
  route: string
  requests: number
  completed: number
  aborted: number
  errors5xx: number
  errors4xx: number
  totalDurationMs: number
  ttfbCount: number
  totalTtfbMs: number
  lastStatusCode?: number
  lastDurationMs?: number
  lastSeenAt: number
}

@Injectable()
export class RequestMetricsService {
  private readonly routes = new Map<string, MutableRouteMetrics>()

  record(data: {
    method: string
    route: string
    statusCode: number
    durationMs: number
    ttfbMs?: number
    aborted: boolean
  }) {
    const key = `${data.method.toUpperCase()} ${data.route}`

    let metrics = this.routes.get(key)
    if (!metrics) {
      metrics = {
        method: data.method.toUpperCase(),
        route: data.route,
        requests: 0,
        completed: 0,
        aborted: 0,
        errors5xx: 0,
        errors4xx: 0,
        totalDurationMs: 0,
        ttfbCount: 0,
        totalTtfbMs: 0,
        lastSeenAt: Date.now(),
      }
      this.routes.set(key, metrics)
    }

    metrics.requests += 1
    metrics.totalDurationMs += data.durationMs
    metrics.lastStatusCode = data.statusCode
    metrics.lastDurationMs = data.durationMs
    metrics.lastSeenAt = Date.now()

    if (data.aborted) {
      metrics.aborted += 1
    } else {
      metrics.completed += 1
    }

    if (data.statusCode >= 500) {
      metrics.errors5xx += 1
    } else if (data.statusCode >= 400) {
      metrics.errors4xx += 1
    }

    if (typeof data.ttfbMs === 'number') {
      metrics.ttfbCount += 1
      metrics.totalTtfbMs += data.ttfbMs
    }
  }

  getMetrics() {
    const entries: RouteMetrics[] = Array.from(this.routes.values())
      .map((item) => ({
        method: item.method,
        route: item.route,
        requests: item.requests,
        completed: item.completed,
        aborted: item.aborted,
        errors5xx: item.errors5xx,
        errors4xx: item.errors4xx,
        avgDurationMs: item.requests === 0 ? 0 : Math.round(item.totalDurationMs / item.requests),
        avgTtfbMs:
          item.ttfbCount === 0
            ? undefined
            : Math.round(item.totalTtfbMs / item.ttfbCount),
        lastStatusCode: item.lastStatusCode,
        lastDurationMs: item.lastDurationMs,
        lastSeenAt: item.lastSeenAt,
      }))
      .sort((a, b) => b.requests - a.requests)

    const totals = entries.reduce(
      (acc, entry) => {
        acc.requests += entry.requests
        acc.completed += entry.completed
        acc.aborted += entry.aborted
        acc.errors4xx += entry.errors4xx
        acc.errors5xx += entry.errors5xx
        return acc
      },
      { requests: 0, completed: 0, aborted: 0, errors4xx: 0, errors5xx: 0 },
    )

    return {
      totals,
      routes: entries,
    }
  }
}
