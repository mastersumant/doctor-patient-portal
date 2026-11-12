/**
 * The API for local development, shared by `npm run dev` (which runs it inside the
 * Vite dev server when VITE_STORAGE_TYPE=API) and `npm run dev:api` (standalone).
 * Same handler as the Netlify Function.
 *
 * Database: DATABASE_URL, else MIGRATION_DATABASE_URL, else an embedded Postgres
 * (PGlite) stored in ./.pglite.
 */
import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { Readable } from 'node:stream'
import type { Sql } from 'postgres'
import { checkDatabaseUrl, describeDatabaseUrl } from '@/server/databaseUrl'
import { migrate } from '@/server/postgres/migration'
import { createApiFromEnv, createSql } from '@/server/runtime'

export type Env = Record<string, string | undefined>

export interface LocalApi {
  /** Where records go, for the startup log. */
  database: string
  /** Handles one request; `path` is the URL path and query (e.g. /api/health). */
  handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void>
}

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
    socket.setTimeout(500, () => (socket.destroy(), resolve(false)))
  })
}

async function embeddedDatabase(port: number): Promise<Sql> {
  // Two processes opening ./.pglite at once would corrupt it.
  if (await portInUse(port)) {
    throw new Error(
      `Another local API (npm run dev or npm run dev:api) is already using the embedded database on port ${port}. ` +
        'Stop it first, or set DATABASE_URL in .env.local.',
    )
  }
  const { PGlite } = await import('@electric-sql/pglite')
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket')
  const db = await PGlite.create('./.pglite')
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await server.start()
  const sql = createSql(`postgres://postgres:postgres@127.0.0.1:${port}/postgres`, { max: 1 })
  await migrate(sql)
  return sql
}

export async function createLocalApi(env: Env, opts: { pglitePort: number }): Promise<LocalApi> {
  const source = env.DATABASE_URL ? 'DATABASE_URL' : env.MIGRATION_DATABASE_URL ? 'MIGRATION_DATABASE_URL' : null
  const databaseUrl = source ? env[source] : undefined
  // A long-running local server can keep a few connections, so one slow request
  // (e.g. loading sample data across the world) doesn't hold up every other page.
  // Netlify Functions keep one connection per instance instead.
  const usable = databaseUrl && !checkDatabaseUrl(databaseUrl, 'server')
  const sql = databaseUrl ? (usable ? createSql(databaseUrl, { max: 4 }) : undefined) : await embeddedDatabase(opts.pglitePort)
  const database = databaseUrl
    ? `${describeDatabaseUrl(databaseUrl)} (from ${source})`
    : 'embedded Postgres in ./.pglite. Records will NOT appear in Supabase; set DATABASE_URL in .env.local to use it'
  // With an unusable URL, createApiFromEnv returns a handler that explains what to fix.
  const handler = createApiFromEnv({ ...env, DATABASE_URL: databaseUrl }, { sql })

  return {
    database,
    async handle(req, res, path) {
      try {
        // The browser's Host (e.g. localhost:5173), so the origin matches the azp claim
        // of tokens Clerk issued to the page.
        const url = `http://${req.headers.host ?? 'localhost'}${path}`
        const headers = new Headers()
        for (const [name, value] of Object.entries(req.headers)) {
          if (name.startsWith(':') || value === undefined) continue
          headers.set(name, Array.isArray(value) ? value.join(', ') : value)
        }
        const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
        const request = new Request(url, {
          method: req.method,
          headers,
          body: hasBody ? (Readable.toWeb(req) as ReadableStream) : undefined,
          duplex: 'half',
        } as RequestInit)
        const response = await handler(request)
        res.writeHead(response.status, Object.fromEntries(response.headers))
        res.end(Buffer.from(await response.arrayBuffer()))
      } catch (err) {
        res.writeHead(500, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ error: { code: 'INTERNAL', message: (err as Error).message } }))
      }
    },
  }
}
