/**
 * Standalone local API on http://localhost:8787. You usually don't need it:
 * with VITE_STORAGE_TYPE=API, `npm run dev` runs the same API inside the dev server.
 * If this is already running when `npm run dev` starts, the dev server forwards /api here.
 *
 * Database: DATABASE_URL, else MIGRATION_DATABASE_URL, else an embedded Postgres in ./.pglite.
 * Sign-in still goes through Clerk: CLERK_SECRET_KEY must be in .env.local.
 */
import { existsSync } from 'node:fs'
import { createServer } from 'node:http'
import { createLocalApi } from './localApi'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f)
const PORT = Number(process.env.API_PORT ?? 8787)

const api = await createLocalApi(process.env, { pglitePort: PORT + 1 })
console.log(`Database: ${api.database}`)

createServer((req, res) => void api.handle(req, res, req.url ?? '/')).listen(PORT, () =>
  console.log(`ClinicDesk API listening on http://localhost:${PORT}/api`),
)
