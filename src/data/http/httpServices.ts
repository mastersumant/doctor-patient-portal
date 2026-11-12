/**
 * The Services interface implemented over HTTP (VITE_STORAGE_TYPE=API). Each call
 * goes to the Netlify Function with the signed-in user's Clerk session token; the
 * server runs the very same service code against Supabase Postgres.
 */
import type { Services } from '@/services'
import { ChangeBus, type SessionIdentity } from '@/services/context'
import { AppError, UnauthorizedError } from '@/services/errors'
import { PrescriptionService } from '@/services/prescriptionService'
import { RPC_METHODS, type RpcService } from '@/services/rpcMethods'
import { decodeResult, encodeArgs, errorFromBody, RPC_PREFIX, toBase64Url } from '@/services/rpcProtocol'
import { VisitService } from '@/services/visitService'

export interface HttpServicesOptions {
  /** Origin of the API; empty for same-origin (Netlify, or Vite's dev proxy). */
  baseUrl?: string
  getToken: () => Promise<string | null>
  getIdentity: () => SessionIdentity | null
  fetch?: typeof fetch
  bus?: ChangeBus
}

type AnyFn = (...args: unknown[]) => Promise<unknown>

export function createHttpServices(opts: HttpServicesOptions): Services {
  const bus = opts.bus ?? new ChangeBus()
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init))
  const base = (opts.baseUrl ?? '').replace(/\/$/, '')

  async function call(service: RpcService, method: string, args: unknown[]): Promise<unknown> {
    const token = await opts.getToken()
    if (!token) throw new UnauthorizedError()
    const { body, contentType } = encodeArgs(args)
    const headers: Record<string, string> = { authorization: `Bearer ${token}` }
    if (contentType) headers['content-type'] = contentType
    const identity = opts.getIdentity()
    if (identity) {
      // Display details for the first-time profile only; the server takes identity from the token.
      headers['x-user-name'] = toBase64Url(identity.fullName)
      headers['x-user-email'] = toBase64Url(identity.email)
      if (identity.imageUrl) headers['x-user-image'] = toBase64Url(identity.imageUrl)
    }

    let res: Response
    try {
      res = await doFetch(`${base}${RPC_PREFIX}${service}/${method}`, { method: 'POST', headers, body })
    } catch {
      throw new AppError('NETWORK', 'Can’t reach the server. Check your internet connection and try again.')
    }
    if (!res.ok) {
      let payload: unknown = null
      try {
        payload = await res.json()
      } catch {
        /* non-JSON error page */
      }
      throw errorFromBody(res.status, payload)
    }
    const result = await decodeResult(res)
    const kind = (RPC_METHODS[service] as Record<string, string>)[method]
    if (kind === 'write') bus.emit(service === 'data' ? '*' : service === 'doctor' ? 'doctor' : service)
    return result
  }

  // Pure helpers that never touch storage run locally.
  const local: Partial<Record<RpcService, Record<string, unknown>>> = {
    visits: { toFormValues: VisitService.prototype.toFormValues },
    prescriptions: { toFormValues: PrescriptionService.prototype.toFormValues },
  }

  const make = (service: RpcService) => {
    const api: Record<string, AnyFn | unknown> = {}
    for (const method of Object.keys(RPC_METHODS[service])) {
      api[method] = (...args: unknown[]) => call(service, method, args)
    }
    return Object.assign(api, local[service] ?? {})
  }

  const unavailable = new Proxy(
    {},
    {
      get: () => () => Promise.reject(new AppError('UNSUPPORTED', 'This operation runs on the server only.')),
    },
  )

  return {
    bus,
    storageType: 'API',
    doctor: make('doctor'),
    patients: make('patients'),
    visits: make('visits'),
    diagnoses: make('diagnoses'),
    prescriptions: make('prescriptions'),
    medicines: make('medicines'),
    appointments: make('appointments'),
    followUps: make('followUps'),
    documents: make('documents'),
    analytics: make('analytics'),
    audit: make('audit'),
    data: make('data'),
    files: unavailable,
  } as unknown as Services
}
