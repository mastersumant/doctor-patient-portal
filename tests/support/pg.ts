/**
 * Real PostgreSQL for tests: PGlite (Postgres compiled to WebAssembly) behind a
 * wire-protocol socket, so the production postgres.js client and SQL run unchanged.
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import postgres, { type Sql } from 'postgres'
import { DB_SCHEMA, migrate } from '@/server/postgres/migration'
import { PG_CLIENT_TYPES } from '@/server/postgres/pgRepositories'

export interface TestPg {
  sql: Sql
  url: string
  reset(): Promise<void>
  stop(): Promise<void>
}

export async function startTestPg(port: number): Promise<TestPg> {
  const db = await PGlite.create()
  const server = new PGLiteSocketServer({ db, port, host: '127.0.0.1' })
  await server.start()
  const url = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`
  const sql = postgres(url, { max: 1, prepare: false, types: PG_CLIENT_TYPES, onnotice: () => undefined })
  await migrate(sql)
  const tables = (await sql`select tablename from pg_tables where schemaname = ${DB_SCHEMA} and tablename <> 'schema_migrations'`).map(
    (r) => `"${DB_SCHEMA}"."${r.tablename}"`,
  )
  return {
    sql,
    url,
    reset: async () => {
      await sql.unsafe(`TRUNCATE ${tables.join(', ')} CASCADE`)
    },
    stop: async () => {
      await sql.end({ timeout: 1 })
      await server.stop()
      await db.close()
    },
  }
}
