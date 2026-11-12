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
import { AUDIT_TABLE, TABLES, type ColumnSpec, type TableSpec } from '@/data/schema/tables'
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
const snake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)

function sqlType(c: ColumnSpec, dialect: 'pg' | 'mysql'): string {
  switch (c.type) {
    case 'id':
      return 'VARCHAR(64)'
    case 'text':
      return `VARCHAR(${c.maxLength ?? 255})`
    case 'longtext':
      return 'TEXT'
    case 'int':
      return 'INTEGER'
    case 'decimal':
      return 'NUMERIC(7,2)'
    case 'date':
      return 'DATE'
    case 'datetime':
      return dialect === 'pg' ? 'TIMESTAMPTZ' : 'DATETIME(3)'
    case 'time':
      return 'TIME'
    case 'bool':
      return 'BOOLEAN'
    case 'json':
      return dialect === 'pg' ? 'JSONB' : 'JSON'
    case 'enum':
      return `VARCHAR(${Math.max(...(c.enumValues ?? ['x']).map((v) => v.length), 8)})`
  }
}

function ddl(tables: TableSpec[], dialect: 'pg' | 'mysql'): string {
  const q = (s: string) => (dialect === 'pg' ? `"${s}"` : `\`${s}\``)
  const out: string[] = [
    `-- ClinicDesk schema (${dialect === 'pg' ? 'PostgreSQL' : 'MySQL 8'}), generated from src/data/schema/tables.ts.`,
    '-- Every clinical table carries doctor_id (tenant key). Repositories must filter on it in every statement.',
    dialect === 'pg' ? '-- Consider enabling row-level security on doctor_id as a second line of defence.' : '',
    '',
  ]
  const fks: string[] = []
  for (const t of tables) {
    const lines = t.columns.map((c) => {
      const notNull = c.nullable ? '' : ' NOT NULL'
      const check = c.type === 'enum' && c.enumValues ? ` CHECK (${q(snake(c.key))} IN (${c.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}))` : ''
      return `  ${q(snake(c.key))} ${sqlType(c, dialect)}${notNull}${check}`
    })
    lines.push(`  PRIMARY KEY (${q(snake(t.primaryKey))})`)
    out.push(`CREATE TABLE ${q(t.name)} (\n${lines.join(',\n')}\n);`)
    if (t.columns.some((c) => c.key === 'doctorId') && t.name !== 'doctors') {
      out.push(`CREATE INDEX ${q(`ix_${t.name}_doctor`)} ON ${q(t.name)} (${q('doctor_id')});`)
    }
    for (const idx of t.indexes ?? []) {
      out.push(`CREATE INDEX ${q(`ix_${t.name}_${idx.map(snake).join('_')}`)} ON ${q(t.name)} (${idx.map((k) => q(snake(k))).join(', ')});`)
    }
    for (const c of t.columns) {
      if (!c.ref) continue
      const [rt, rc] = c.ref.split('.')
      fks.push(`ALTER TABLE ${q(t.name)} ADD CONSTRAINT ${q(`fk_${t.name}_${snake(c.key)}`)} FOREIGN KEY (${q(snake(c.key))}) REFERENCES ${q(rt)} (${q(snake(rc))});`)
    }
    out.push('')
  }
  out.push('-- Foreign keys are added after all tables exist (some references are circular, e.g. visits ↔ appointments).')
  out.push(...fks, '')
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}

const all = [...TABLES, AUDIT_TABLE]
writeFileSync(resolve(docsDir, 'schema.postgresql.sql'), ddl(all, 'pg'))
writeFileSync(resolve(docsDir, 'schema.mysql.sql'), ddl(all, 'mysql'))
console.log('docs/schema.postgresql.sql, docs/schema.mysql.sql')
