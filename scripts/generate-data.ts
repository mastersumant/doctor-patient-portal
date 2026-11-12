/**
 * Generates, from the same seed and table specs the app uses:
 *   data/<table>.xlsx      one sample workbook per table (both demo doctors)
 *   data/clinicdesk-sample-workspace-<doctor>.xlsx  importable single-workbook exports
 *   docs/schema.postgresql.sql and docs/schema.mysql.sql
 *
 * Run with: npm run generate:data
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildWorkbook } from '@/data/excel/excelWorkbook'
import { toRow } from '@/data/schema/rowCodec'
import { AUDIT_TABLE, TABLES } from '@/data/schema/tables'
import { buildDdl } from '@/data/schema/ddl'
import { MIGRATION_FILE, MIGRATION_SQL } from '@/server/postgres/migration'
import { buildSeed, DEMO_DOCTORS, type SeedBundle } from '@/data/seed/seedData'

const root = resolve(import.meta.dirname, '..')
const dataDir = resolve(root, 'data')
const docsDir = resolve(root, 'docs')
mkdirSync(dataDir, { recursive: true })
mkdirSync(docsDir, { recursive: true })

type Row = Record<string, unknown>
const bundles = DEMO_DOCTORS.map((d) => buildSeed(d))

function rowsFor(table: string, b: SeedBundle): Row[] {
  const map: Record<string, unknown[]> = {
    doctors: [b.doctor],
    patients: b.patients,
    visits: b.visits,
    diagnoses: b.diagnoses,
    prescriptions: b.prescriptions,
    prescription_medicines: b.prescriptionMedicines,
    medicines: b.medicines,
    appointments: b.appointments,
    followups: b.followUps,
    medical_documents: b.documents,
  }
  return (map[table] ?? []) as Row[]
}

async function writeXlsx(path: string, sheets: Parameters<typeof buildWorkbook>[0], title: string) {
  const wb = await buildWorkbook(sheets, { title })
  const buf = await wb.xlsx.writeBuffer()
  writeFileSync(path, Buffer.from(buf as ArrayBuffer))
}

// 1. One file per table, as in the original Excel design (all demo doctors together).
for (const t of TABLES) {
  const rows = bundles.flatMap((b) => rowsFor(t.name, b)).map((r) => toRow(t, r))
  await writeXlsx(resolve(dataDir, `${t.name}.xlsx`), [{ name: t.name, columns: t.columns.map((c) => ({ key: c.key })), rows }], t.label)
  console.log(`data/${t.name}.xlsx  ${rows.length} rows`)
}

// 2. Importable single-workbook exports (the same layout Settings → Export produces).
for (const b of bundles) {
  const slug = b.doctor.fullName.toLowerCase().replace(/^dr\.?\s+/, '').replace(/[^a-z]+/g, '-')
  await writeXlsx(
    resolve(dataDir, `clinicdesk-sample-workspace-${slug}.xlsx`),
    TABLES.map((t) => ({ name: t.name, columns: t.columns.map((c) => ({ key: c.key })), rows: rowsFor(t.name, b).map((r) => toRow(t, r)) })),
    `Sample workspace: ${b.doctor.fullName}`,
  )
  console.log(`data/clinicdesk-sample-workspace-${slug}.xlsx`)
}

// 3. SQL DDL generated from the same table specs.
const all = [...TABLES, AUDIT_TABLE]
writeFileSync(resolve(docsDir, 'schema.postgresql.sql'), buildDdl(all, 'pg', { header: '-- ClinicDesk schema (PostgreSQL), generated from src/data/schema/tables.ts.' }))
writeFileSync(resolve(docsDir, 'schema.mysql.sql'), buildDdl(all, 'mysql', { header: '-- ClinicDesk schema (MySQL 8), generated from src/data/schema/tables.ts.' }))
console.log('docs/schema.postgresql.sql, docs/schema.mysql.sql')

// 4. Supabase migration: dedicated schema, server-only tables, RLS lock-down.
mkdirSync(resolve(root, 'supabase/migrations'), { recursive: true })
writeFileSync(resolve(root, 'supabase/migrations', MIGRATION_FILE), MIGRATION_SQL)
console.log(`supabase/migrations/${MIGRATION_FILE}`)
