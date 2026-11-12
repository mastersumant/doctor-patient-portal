/**
 * Local API server for `VITE_STORAGE_TYPE=API` development. Runs the same handler
 * as the Netlify Function on http://localhost:8787 (Vite proxies /api to it).
 *
 *   DATABASE_URL set  → uses that database (e.g. your Supabase project)
 *   DATABASE_URL unset → uses an embedded Postgres (PGlite) stored in ./.pglite
 *
 * Sign-in still goes through Clerk: CLERK_SECRET_KEY must be in .env.local.
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { Readable } from 'node:stream'
import type { Sql } from 'postgres'
import { createApiFromEnv, createSql } from '@/server/runtime'
import { migrate } from '@/server/postgres/migration'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f)
const PORT = Number(process.env.API_PORT ?? 8787)

async function embeddedDatabase(): Promise<Sql> {
  const { PGlite } = await import('@electric-sql/pglite')
  const { PGLiteSocketServer } = await import('@electric-sql/pglite-socket')
  const db = await PGlite.create('./.pglite')
  const server = new PGLiteSocketServer({ db, port: PORT + 1, host: '127.0.0.1' })
  await server.start()
  const sql = createSql(`postgres://postgres:postgres@127.0.0.1:${PORT + 1}/postgres`, { max: 1 })
  await migrate(sql)
  console.log('Using embedded Postgres in ./.pglite (set DATABASE_URL to use Supabase instead).')
  return sql
}

const sql = process.env.DATABASE_URL ? undefined : await embeddedDatabase()
const handler = createApiFromEnv({ ...process.env, CONTEXT: 'dev' }, { sql })

createServer(async (req, res) => {
  try {
    const url = `http://localhost:${PORT}${req.url ?? '/'}`
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD'
    const request = new Request(url, {
      method: req.method,
      headers: req.headers as Record<string, string>,
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
}).listen(PORT, () => console.log(`ClinicDesk API listening on http://localhost:${PORT}/api`))
