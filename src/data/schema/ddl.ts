/**
 * Generates SQL DDL from the table specs. Used for the Supabase migration, the
 * reference schema files in docs/, and the Postgres test database.
 */
import type { ColumnSpec, TableSpec } from './tables'

export type Dialect = 'pg' | 'mysql'

export const snake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`)

export function sqlType(c: ColumnSpec, dialect: Dialect): string {
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
    case 'bytes':
      return dialect === 'pg' ? 'BYTEA' : 'LONGBLOB'
    case 'enum':
      return `VARCHAR(${Math.max(...(c.enumValues ?? ['x']).map((v) => v.length), 8)})`
  }
}

export interface DdlOptions {
  /** Postgres schema to create the tables in (keeps them out of Supabase's public Data API). */
  schema?: string
  /** Enable row-level security with no policies and revoke Supabase API roles. */
  lockDown?: boolean
  header?: string
}

export function buildDdl(tables: TableSpec[], dialect: Dialect, opts: DdlOptions = {}): string {
  const q = (s: string) => (dialect === 'pg' ? `"${s}"` : `\`${s}\``)
  const schema = dialect === 'pg' ? opts.schema : undefined
  const t = (name: string) => (schema ? `${q(schema)}.${q(name)}` : q(name))
  const out: string[] = []
  if (opts.header) out.push(opts.header, '')
  if (schema) out.push(`CREATE SCHEMA IF NOT EXISTS ${q(schema)};`, '')

  const fks: string[] = []
  for (const table of tables) {
    const lines = table.columns.map((c) => {
      const notNull = c.nullable ? '' : ' NOT NULL'
      const check =
        c.type === 'enum' && c.enumValues
          ? ` CHECK (${q(snake(c.key))} IN (${c.enumValues.map((v) => `'${v.replace(/'/g, "''")}'`).join(', ')}))`
          : ''
      return `  ${q(snake(c.key))} ${sqlType(c, dialect)}${notNull}${check}`
    })
    lines.push(`  PRIMARY KEY (${q(snake(table.primaryKey))})`)
    out.push(`CREATE TABLE ${t(table.name)} (\n${lines.join(',\n')}\n);`)
    if (table.columns.some((c) => c.key === 'doctorId') && table.name !== 'doctors') {
      out.push(`CREATE INDEX ${q(`ix_${table.name}_doctor`)} ON ${t(table.name)} (${q('doctor_id')});`)
    }
    for (const idx of table.indexes ?? []) {
      if (idx.length === 1 && idx[0] === 'doctorId') continue
      out.push(`CREATE INDEX ${q(`ix_${table.name}_${idx.map(snake).join('_')}`)} ON ${t(table.name)} (${idx.map((k) => q(snake(k))).join(', ')});`)
    }
    for (const c of table.columns) {
      if (!c.ref || c.softRef) continue
      const [rt, rc] = c.ref.split('.')
      if (!tables.some((x) => x.name === rt)) continue
      fks.push(
        `ALTER TABLE ${t(table.name)} ADD CONSTRAINT ${q(`fk_${table.name}_${snake(c.key)}`)} FOREIGN KEY (${q(snake(c.key))}) REFERENCES ${t(rt)} (${q(snake(rc))});`,
      )
    }
    out.push('')
  }
  out.push('-- Foreign keys. Circular cross-links (visit ↔ appointment ↔ follow-up) are checked by the app, not the database.')
  out.push(...fks, '')

  if (dialect === 'pg' && opts.lockDown) {
    out.push(
      '-- Defence in depth: these tables are only reached by the server (Netlify Function) connecting as the',
      '-- table owner. Row-level security with no policies blocks every other role, including Supabase API roles.',
    )
    for (const table of tables) out.push(`ALTER TABLE ${t(table.name)} ENABLE ROW LEVEL SECURITY;`)
    out.push(
      'DO $$',
      'BEGIN',
      "  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN",
      schema ? `    EXECUTE 'REVOKE ALL ON SCHEMA ${schema} FROM anon, authenticated';` : '',
      schema ? `    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA ${schema} FROM anon, authenticated';` : `    EXECUTE 'REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated';`,
      '  END IF;',
      'END $$;',
      '',
    )
  }
  return out.filter((l, i, a) => !(l === '' && a[i - 1] === '')).join('\n')
}
