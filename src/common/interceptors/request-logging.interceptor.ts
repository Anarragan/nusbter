import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common'
import type { Request, Response } from 'express'
import { Observable } from 'rxjs'

function redactHeaders(headers: Record<string, unknown>) {
  const redactedKeys = new Set(['authorization', 'cookie', 'set-cookie'])

  return Object.fromEntries(
    Object.entries(headers).map(([key, value]) => {
      if (redactedKeys.has(key.toLowerCase())) {
        return [key, '[REDACTED]']
      }
      return [key, value]
    }),
  )
}

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') {
      return next.handle()
    }

    const req = context.switchToHttp().getRequest<Request>()
    const res = context.switchToHttp().getResponse<Response>()

    const startNs = process.hrtime.bigint()
    let firstByteNs: bigint | undefined
    const method = req.method
    const url = (req as any).originalUrl ?? req.url
    const requestHeaders = redactHeaders(req.headers as unknown as Record<string, unknown>)

    let logged = false

    // Medimos TTFB (primer byte escrito) — clave en endpoints de streaming
    const resAny = res as any
    const originalWrite = resAny.write?.bind(resAny)
    const originalEnd = resAny.end?.bind(resAny)
    if (typeof originalWrite === 'function') {
      resAny.write = (...args: any[]) => {
        if (!firstByteNs) firstByteNs = process.hrtime.bigint()
        return originalWrite(...args)
      }
    }
    if (typeof originalEnd === 'function') {
      resAny.end = (...args: any[]) => {
        if (!firstByteNs) firstByteNs = process.hrtime.bigint()
        return originalEnd(...args)
      }
    }

    const log = (event: 'finish' | 'close', extra?: Record<string, unknown>) => {
      if (logged) return
      logged = true

      const endNs = process.hrtime.bigint()
      const durationMs = Number(endNs - startNs) / 1e6
      const ttfbMs = firstByteNs ? Number(firstByteNs - startNs) / 1e6 : undefined

      const base = {
        method,
        url,
        statusCode: res.statusCode,
        durationMs: Number(durationMs.toFixed(1)),
        ...(ttfbMs !== undefined ? { ttfbMs: Number(ttfbMs.toFixed(1)) } : {}),
        event,
      }

      // eslint-disable-next-line no-console
      console.log('[HTTP]', { ...base, ...extra })
      // eslint-disable-next-line no-console
      console.log('[HTTP] headers', requestHeaders)
    }

    res.once('finish', () => {
      log('finish')
    })

    // `close` puede ocurrir por abortos/cancelaciones
    res.once('close', () => {
      log('close', { aborted: !res.writableEnded })
    })

    return next.handle()
  }
}
