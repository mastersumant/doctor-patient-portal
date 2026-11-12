/**
 * The HTTP API: one route that runs an allow-listed service method for the
 * doctor identified by a verified Clerk session token. Platform-neutral (Web
 * Request/Response), used by the Netlify Function and the local dev server.
 */
import type { RepositoryRegistry } from '@/data/repositories/interfaces'
import { ChangeBus, createServices, type Services } from '@/services'
import type { SessionIdentity } from '@/services/context'
import { AppError, UnauthorizedError, ValidationError } from '@/services/errors'
import { rpcKind } from '@/services/rpcMethods'
import { decodeArgs, encodeResult, errorResponse, fromBase64Url, RPC_PREFIX } from '@/services/rpcProtocol'
import type { TokenVerifier } from './auth'

export interface ApiHandlerOptions {
  repos: RepositoryRegistry
  verify: TokenVerifier
  /** Reject request bodies above this size before reading them (Netlify's own cap is 6 MB). */
  maxBodyBytes?: number
  /** Document upload cap passed to the services (binary uploads through functions top out near 4.5 MB). */
  maxUploadBytes?: number
  /** Liveness check for GET /api/health. */
  pingDatabase?: () => Promise<void>
  log?: (line: string) => void
}

export const DEFAULT_MAX_BODY = 6 * 1024 * 1024
export const DEFAULT_MAX_UPLOAD = 4 * 1024 * 1024

class PayloadTooLargeError extends AppError {
  constructor() {
    super('PAYLOAD_TOO_LARGE', 'This file is too large to upload. Files must be 4 MB or smaller.')
  }
}

/** Display details for first-time profile creation only; never used for identity or access. */
function displayHints(req: Request, userId: string): SessionIdentity {
  const read = (name: string, max: number) => {
    const v = req.headers.get(name)
    if (!v) return ''
    try {
      return fromBase64Url(v).slice(0, max)
    } catch {
      return ''
    }
  }
  return {
    userId,
    fullName: read('x-user-name', 120) || 'Doctor',
    email: read('x-user-email', 254),
    imageUrl: read('x-user-image', 1000).startsWith('https://') ? read('x-user-image', 1000) : '',
  }
}

export function createApiHandler(opts: ApiHandlerOptions): (req: Request) => Promise<Response> {
  const maxBody = opts.maxBodyBytes ?? DEFAULT_MAX_BODY
  const log = opts.log ?? ((line: string) => console.error(line))

  return async (req: Request): Promise<Response> => {
    const url = new URL(req.url)

    if (url.pathname === '/api/health') {
      let database = 'not-checked'
      if (opts.pingDatabase) {
        try {
          await opts.pingDatabase()
          database = 'ok'
        } catch {
          database = 'unreachable'
        }
      }
      return Response.json({ status: 'ok', database }, { headers: { 'cache-control': 'no-store' } })
    }

    if (!url.pathname.startsWith(RPC_PREFIX)) {
      return Response.json({ error: { code: 'NOT_FOUND', message: 'Unknown API route' } }, { status: 404 })
    }
    if (req.method !== 'POST') {
      return Response.json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use POST' } }, { status: 405, headers: { allow: 'POST' } })
    }

    const [service, method, ...extra] = url.pathname.slice(RPC_PREFIX.length).split('/')
    const kind = extra.length ? null : rpcKind(service ?? '', method ?? '')
    if (!kind) return Response.json({ error: { code: 'NOT_FOUND', message: 'Unknown API method' } }, { status: 404 })
    const op = `${service}.${method}`

    try {
      const auth = req.headers.get('authorization') ?? ''
      const token = /^Bearer\s+(.+)$/i.exec(auth)?.[1]
      const user = token ? await opts.verify(token) : null
      if (!user) throw new UnauthorizedError()

      const length = Number(req.headers.get('content-length') ?? 0)
      if (length > maxBody) throw new PayloadTooLargeError()

      let args: unknown[]
      try {
        args = await decodeArgs(req)
      } catch (err) {
        if (err instanceof AppError) throw err
        throw new ValidationError('The request could not be read')
      }

      const identity = displayHints(req, user.userId)
      const services: Services = createServices(opts.repos, { getIdentity: () => identity }, new ChangeBus(), {
        maxUploadBytes: opts.maxUploadBytes ?? DEFAULT_MAX_UPLOAD,
      })
      const target = services[service as keyof Services] as unknown as Record<string, (...a: unknown[]) => Promise<unknown>>
      const result = await target[method](...args)
      return encodeResult(result)
    } catch (err) {
      if (!(err instanceof AppError)) {
        // Name, code and message only: no request data, no row values.
        const e = err as { name?: string; code?: string; message?: string }
        log(`[api] ${op} failed: ${e.name ?? 'Error'}${e.code ? ` ${e.code}` : ''}: ${(e.message ?? '').slice(0, 200)}`)
      }
      return errorResponse(err)
    }
  }
}
