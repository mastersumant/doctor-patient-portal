import type { Sql } from 'postgres'
import { buildDdl } from '@/data/schema/ddl'
import { AUDIT_TABLE, FILES_TABLE, META_TABLE, TABLES } from '@/data/schema/tables'

/** All ClinicDesk tables live in their own schema, so Supabase's public Data API never exposes them. */
export const DB_SCHEMA = 'clinicdesk'

export const MIGRATION_FILE = '20261112000000_clinicdesk_init.sql'

export const MIGRATION_SQL = buildDdl([...TABLES, AUDIT_TABLE, FILES_TABLE, META_TABLE], 'pg', {
  schema: DB_SCHEMA,
  lockDown: true,
  header: [
    '-- ClinicDesk initial schema for Supabase Postgres (generated from src/data/schema/tables.ts).',
    '-- Apply with `npm run db:migrate`, or paste into the Supabase SQL editor once.',
    '-- Every clinical table carries doctor_id: the server filters on it in every statement.',
  ].join('\n'),
})

/** Applies the migration once, tracked in clinicdesk.schema_migrations. */
export async function migrate(sql: Sql): Promise<'applied' | 'already-applied'> {
  await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS "${DB_SCHEMA}"`)
  await sql.unsafe(`CREATE TABLE IF NOT EXISTS "${DB_SCHEMA}"."schema_migrations" (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`)
  await sql.unsafe(`ALTER TABLE "${DB_SCHEMA}"."schema_migrations" ENABLE ROW LEVEL SECURITY`)
  const done = await sql`SELECT 1 FROM ${sql(`${DB_SCHEMA}.schema_migrations`)} WHERE name = ${MIGRATION_FILE}`
  if (done.length) return 'already-applied'
  // Tables created by pasting the SQL into Supabase's editor: record it instead of failing.
  const [existing] = await sql`select to_regclass(${`${DB_SCHEMA}.patients`}) as t`
  if (existing?.t) {
    await sql`INSERT INTO ${sql(`${DB_SCHEMA}.schema_migrations`)} (name) VALUES (${MIGRATION_FILE})`
    return 'already-applied'
  }
  await sql.begin(async (tx) => {
    await tx.unsafe(MIGRATION_SQL)
    await tx`INSERT INTO ${tx(`${DB_SCHEMA}.schema_migrations`)} (name) VALUES (${MIGRATION_FILE})`
  })
  return 'applied'
}
