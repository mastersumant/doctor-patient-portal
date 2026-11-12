/**
 * Wire format for calling services over HTTP. Shared by the browser client and
 * the Netlify Function, and free of Node- or DOM-only APIs.
 *
 *   POST /api/rpc/<service>/<method>
 *   body: JSON {"args": [...]}, or multipart/form-data when an argument is a file
 *         (field "args" holds the JSON with {"$blob": n} placeholders, parts "blob<n>")
 *   200:  JSON {"result": ...}; or the file bytes when the result is (or holds) a Blob
 *   4xx/5xx: JSON {"error": {"code", "message", "fieldErrors"?}}
 */
import { AppError, ConflictError, NotFoundError, UnauthorizedError, ValidationError } from './errors'

export const RPC_PREFIX = '/api/rpc/'
export const RESULT_HEADER = 'x-rpc-result'
export const META_HEADER = 'x-rpc-meta'
/**
 * What the call actually changed, as reported by the services' change bus on the
 * server (e.g. "patients" or "*"). Absent when nothing changed. The browser re-emits
 * exactly these, so open lists refresh the same way as in browser mode.
 */
export const CHANGES_HEADER = 'x-rpc-changes'

/** Collapses change events: "*" (everything) wins; otherwise unique names in order. */
export function normaliseChanges(changes: Iterable<string>): string[] {
  const unique = [...new Set([...changes].map((c) => c.trim()).filter((c) => /^[*a-zA-Z_-]+$/.test(c)))]
  return unique.includes('*') ? ['*'] : unique
}

type BlobRef = { $blob: number; name?: string; type?: string; arraybuffer?: boolean }

const isBlob = (v: unknown): v is Blob => typeof Blob !== 'undefined' && v instanceof Blob

/* ---------- small UTF-8 safe base64url helpers (headers must be ASCII) ---------- */

export function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((value.length + 3) % 4)
  const bin = atob(b64)
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)))
}

/* ---------- arguments ---------- */

export function encodeArgs(args: unknown[]): { body: string | FormData; contentType: string | null } {
  const blobs: Blob[] = []
  const json = JSON.stringify({
    args: args.map((a) => {
      if (isBlob(a)) {
        blobs.push(a)
        return { $blob: blobs.length - 1, name: (a as Blob & { name?: string }).name, type: a.type } satisfies BlobRef
      }
      if (a instanceof ArrayBuffer) {
        blobs.push(new Blob([a]))
        return { $blob: blobs.length - 1, arraybuffer: true } satisfies BlobRef
      }
      return a === undefined ? null : a
    }),
  })
  if (!blobs.length) return { body: json, contentType: 'application/json' }
  const form = new FormData()
  form.append('args', json)
  blobs.forEach((b, i) => form.append(`blob${i}`, b, (b as Blob & { name?: string }).name ?? `blob${i}`))
  return { body: form, contentType: null }
}

export async function decodeArgs(req: Request): Promise<unknown[]> {
  const type = req.headers.get('content-type') ?? ''
  if (type.startsWith('multipart/form-data')) {
    const form = await req.formData()
    const parsed = JSON.parse(String(form.get('args') ?? '{"args":[]}')) as { args: unknown[] }
    return Promise.all(
      parsed.args.map(async (a) => {
        if (a && typeof a === 'object' && '$blob' in a) {
          const ref = a as BlobRef
          const part = form.get(`blob${ref.$blob}`)
          if (!isBlob(part)) throw new ValidationError('A file in the request is missing')
          if (ref.arraybuffer) return part.arrayBuffer()
          // Keep the original name for display; the type is re-checked from the bytes by FileService.
          return Object.assign(new Blob([await part.arrayBuffer()], { type: ref.type || part.type }), { name: ref.name ?? 'file' })
        }
        return a
      }),
    )
  }
  const text = await req.text()
  if (!text) return []
  const parsed = JSON.parse(text) as { args?: unknown }
  if (!Array.isArray(parsed.args)) throw new ValidationError('Malformed request')
  return parsed.args
}

/* ---------- results ---------- */

export function encodeResult(result: unknown, changes: string[] = []): Response {
  const headers: Record<string, string> = { 'cache-control': 'no-store' }
  const changed = normaliseChanges(changes)
  if (changed.length) headers[CHANGES_HEADER] = changed.join(',')
  if (isBlob(result)) {
    return new Response(result, { status: 200, headers: { ...headers, 'content-type': result.type || 'application/octet-stream', [RESULT_HEADER]: 'blob' } })
  }
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const entry = Object.entries(result).find(([, v]) => isBlob(v))
    if (entry) {
      const [key, blob] = entry as [string, Blob]
      const rest = { ...(result as Record<string, unknown>) }
      delete rest[key]
      return new Response(blob, {
        status: 200,
        headers: {
          ...headers,
          'content-type': blob.type || 'application/octet-stream',
          [RESULT_HEADER]: 'blob-in-object',
          [META_HEADER]: toBase64Url(JSON.stringify({ key, rest })),
        },
      })
    }
  }
  return Response.json({ result: result === undefined ? null : result }, { headers })
}

export async function decodeResult(res: Response): Promise<unknown> {
  const kind = res.headers.get(RESULT_HEADER)
  if (kind === 'blob') return res.blob()
  if (kind === 'blob-in-object') {
    const meta = JSON.parse(fromBase64Url(res.headers.get(META_HEADER) ?? '')) as { key: string; rest: Record<string, unknown> }
    return { ...meta.rest, [meta.key]: await res.blob() }
  }
  const body = (await res.json()) as { result: unknown }
  return body.result
}

/* ---------- errors ---------- */

export const STATUS_BY_CODE: Record<string, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_KEY: 409,
  PAYLOAD_TOO_LARGE: 413,
}

export function errorResponse(err: unknown): Response {
  const headers = { 'cache-control': 'no-store' }
  if (err instanceof AppError) {
    const body: Record<string, unknown> = { code: err.code, message: err.message }
    if (err instanceof ValidationError && Object.keys(err.fieldErrors).length) body.fieldErrors = err.fieldErrors
    return Response.json({ error: body }, { status: STATUS_BY_CODE[err.code] ?? 400, headers })
  }
  return Response.json({ error: { code: 'INTERNAL', message: 'The server couldn’t complete this request. Try again in a moment.' } }, { status: 500, headers })
}

/** Rebuilds the typed error the UI checks with instanceof. */
export function errorFromBody(status: number, body: unknown): Error {
  const e = (body as { error?: { code?: string; message?: string; fieldErrors?: Record<string, string> } })?.error
  const message = e?.message ?? `Request failed (${status})`
  switch (e?.code) {
    case 'VALIDATION_ERROR':
      return new ValidationError(message, e.fieldErrors ?? {})
    case 'NOT_FOUND':
      return Object.assign(new NotFoundError('Record'), { message })
    case 'CONFLICT':
      return new ConflictError(message)
    case 'UNAUTHORIZED':
      return new UnauthorizedError()
    default:
      return new AppError(e?.code ?? 'HTTP_ERROR', message)
  }
}
