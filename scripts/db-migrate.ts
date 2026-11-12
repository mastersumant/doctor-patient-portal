/**
 * Creates the ClinicDesk tables in your Supabase (or any Postgres) database.
 * Usage: set DATABASE_URL (e.g. in .env.local), then `npm run db:migrate`.
 * Use Supabase's "Session pooler" or direct connection string for this step.
 */
import { existsSync } from 'node:fs'
import { createSql } from '@/server/runtime'
import { migrate } from '@/server/postgres/migration'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f)

const url = process.env.MIGRATION_DATABASE_URL || process.env.DATABASE_URL
if (!url) {
  console.error('Set DATABASE_URL (or MIGRATION_DATABASE_URL) to your Supabase connection string first.')
  process.exit(1)
}
const sql = createSql(url, { max: 1 })
try {
  const result = await migrate(sql)
  console.log(result === 'applied' ? 'Database schema created.' : 'Database schema already up to date.')
} catch (err) {
  console.error('Migration failed:', (err as Error).message)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
