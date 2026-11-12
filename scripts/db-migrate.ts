/**
 * Creates the ClinicDesk tables in your Supabase (or any Postgres) database.
 * Usage: set MIGRATION_DATABASE_URL (or DATABASE_URL) in .env.local, then `npm run db:migrate`.
 * Use Supabase's "Session pooler" connection string for this step (Connect → Session pooler).
 */
import { existsSync } from 'node:fs'
import { checkDatabaseUrl, describeDatabaseUrl, explainDbError } from '@/server/databaseUrl'
import { createSql } from '@/server/runtime'
import { migrate } from '@/server/postgres/migration'

for (const f of ['.env.local', '.env']) if (existsSync(f)) process.loadEnvFile(f)

const source = process.env.MIGRATION_DATABASE_URL ? 'MIGRATION_DATABASE_URL' : 'DATABASE_URL'
const url = process.env[source]
if (!url) {
  console.error('Set MIGRATION_DATABASE_URL in .env.local to your Supabase Session pooler connection string first.')
  process.exit(1)
}

const problem = checkDatabaseUrl(url, 'migrate')
if (problem) {
  console.error(`${source} needs fixing: ${problem}`)
  process.exit(1)
}

console.log(`Connecting to ${describeDatabaseUrl(url)} (from ${source})…`)
const sql = createSql(url, { max: 1 })
try {
  const result = await migrate(sql)
  console.log(result === 'applied' ? 'Database schema created.' : 'Database schema already up to date.')
} catch (err) {
  console.error(`Migration failed: ${explainDbError(err, url, 'migrate')}`)
  process.exitCode = 1
} finally {
  await sql.end({ timeout: 5 })
}
