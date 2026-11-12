/**
 * PostgreSQL implementation of the repository contracts (Supabase in production,
 * PGlite in tests). Table and column layout comes from src/data/schema/tables.ts.
 *
 * Every tenant query carries `doctor_id = $doctorId`, mirroring the contract the
 * browser repositories follow. Values are always bound parameters; identifiers
 * come only from the static table specs.
 */
import type postgres from 'postgres'
import type { Sql } from 'postgres'
import type { AuditLog, Doctor, Prescription, PrescriptionMedicine, StoredFile } from '@/domain/types'
import type {
  AuditRepository,
  DoctorRepository,
  FileStore,
  FilterValue,
  ListQuery,
  MetaStore,
  Page,
  PrescriptionRepository,
  RepositoryRegistry,
  TenantRepository,
} from '@/data/repositories/interfaces'
import { snake, sqlType } from '@/data/schema/ddl'
import { AUDIT_TABLE, FILES_TABLE, META_TABLE, TABLES_BY_NAME, type ColumnSpec, type TableSpec } from '@/data/schema/tables'
import { DuplicateKeyError, NotFoundError } from '@/services/errors'
import { DB_SCHEMA } from './migration'

type Row = Record<string, unknown>
type Fragment = postgres.PendingQuery<postgres.Row[]>

const TEXTUAL = new Set(['id', 'text', 'longtext', 'enum'])

/** Postgres returns timestamps like "2026-11-12 06:22:49.112+00"; normalise to ISO-8601 UTC. */
export function pgTimestampToIso(v: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(?:([+-]\d{2})(?::?(\d{2}))?|Z)?$/.exec(v)
  if (!m) return new Date(v).toISOString()
  const offset = m[3] ? `${m[3]}:${m[4] ?? '00'}` : 'Z'
  return new Date(`${m[1]}T${m[2]}${offset}`).toISOString()
}

/** Connection options for postgres.js: keep date/time values as strings, decode per column instead. */
export const PG_CLIENT_TYPES = {
  date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
  time: { to: 1083, from: [1083], serialize: (x: string) => x, parse: (x: string) => x },
  timestamp: { to: 1114, from: [1114], serialize: (x: string) => x, parse: (x: string) => x },
  timestamptz: { to: 1184, from: [1184], serialize: (x: string) => x, parse: (x: string) => x },
}

class PgTable {
  readonly spec: TableSpec
  readonly name: string
  readonly pkCol: string
  readonly hasDeletedAt: boolean
  private readonly byKey: Map<string, ColumnSpec>
  protected readonly sql: Sql

  constructor(sql: Sql, spec: TableSpec) {
    this.sql = sql
    this.spec = spec
    this.name = `${DB_SCHEMA}.${spec.name}`
    this.pkCol = snake(spec.primaryKey)
    this.hasDeletedAt = spec.columns.some((c) => c.key === 'deletedAt')
    this.byKey = new Map(spec.columns.map((c) => [c.key, c]))
  }

  col(key: string): ColumnSpec {
    const c = this.byKey.get(key)
    if (!c) throw new Error(`Unknown column ${this.spec.name}.${key}`)
    return c
  }

  /** Entity → DB row (only known columns; JSON stringified; bytes as Buffer). */
  toDb(entity: Row, opts: { partial?: boolean } = {}): Row {
    const out: Row = {}
    for (const c of this.spec.columns) {
      if (opts.partial && !(c.key in entity)) continue
      let v = entity[c.key]
      if (v === undefined) v = null
      if (v !== null && c.type === 'json') v = JSON.stringify(v)
      if (v !== null && c.type === 'bytes' && !(v instanceof Uint8Array)) throw new Error('bytes column needs Uint8Array')
      out[snake(c.key)] = v
    }
    return out
  }

  /** DB row → entity, decoding by column type. */
  fromDb(row: Row): Row {
    const out: Row = {}
    for (const c of this.spec.columns) {
      const v = row[snake(c.key)]
      if (v === null || v === undefined) {
        out[c.key] = c.nullable || c.type === 'json' || c.type === 'bytes' ? null : TEXTUAL.has(c.type) ? '' : null
        continue
      }
      switch (c.type) {
        case 'date':
          out[c.key] = String(v).slice(0, 10)
          break
        case 'datetime':
          out[c.key] = pgTimestampToIso(String(v))
          break
        case 'time':
          out[c.key] = String(v).slice(0, 5)
          break
        case 'int':
        case 'decimal':
          out[c.key] = Number(v)
          break
        case 'bool':
          out[c.key] = v === true || v === 't' || v === 'true'
          break
        case 'json':
          out[c.key] = typeof v === 'string' ? JSON.parse(v) : v
          break
        default:
          out[c.key] = v
      }
    }
    return out
  }

  private cast(c: ColumnSpec): string {
    // Static type names from the spec, never user input.
    return sqlType(c, 'pg').replace(/\(.*\)/, '').toLowerCase()
  }

  private condition(key: string, f: FilterValue): Fragment[] {
    const sql = this.sql
    const c = this.col(key)
    const col = sql(snake(key))
    const typed = (v: unknown) => sql`cast(${v as string} as ${sql.unsafe(this.cast(c))})`
    if (f === null) return [sql`${col} is null`]
    if (typeof f !== 'object') return [sql`${col} = ${typed(f)}`]
    const out: Fragment[] = []
    if (f.eq !== undefined) out.push(f.eq === null ? sql`${col} is null` : sql`${col} = ${typed(f.eq)}`)
    if (f.ne !== undefined) out.push(f.ne === null ? sql`${col} is not null` : sql`${col} is distinct from ${typed(f.ne)}`)
    if (f.in !== undefined) {
      const vals = f.in.filter((v) => v !== null).map(String)
      out.push(vals.length ? sql`${col}::text = any(${vals}::text[])` : sql`false`)
    }
    if (f.isNull !== undefined) {
      const isNull = TEXTUAL.has(c.type) ? sql`(${col} is null or ${col}::text = '')` : sql`${col} is null`
      out.push(f.isNull ? isNull : sql`not ${isNull}`)
    }
    if (f.gte !== undefined) out.push(sql`${col} >= ${typed(f.gte)}`)
    if (f.lte !== undefined) out.push(sql`${col} <= ${typed(f.lte)}`)
    if (f.gt !== undefined) out.push(sql`${col} > ${typed(f.gt)}`)
    if (f.lt !== undefined) out.push(sql`${col} < ${typed(f.lt)}`)
    return out
  }

  where(doctorId: string | null, query: Omit<ListQuery<Row>, 'page' | 'pageSize' | 'sort'> = {}): Fragment {
    const sql = this.sql
    const parts: Fragment[] = []
    if (doctorId !== null) parts.push(sql`doctor_id = ${doctorId}`)
    if (this.hasDeletedAt && !query.includeDeleted) parts.push(sql`deleted_at is null`)
    for (const [k, f] of Object.entries(query.filters ?? {})) {
      if (f !== undefined) parts.push(...this.condition(k, f as FilterValue))
    }
    const term = query.search?.term.trim()
    if (term && query.search) {
      const pattern = `%${term.replace(/[\\%_]/g, (m) => `\\${m}`)}%`
      const ors = query.search.fields.map((f) => sql`${sql(snake(f))}::text ilike ${pattern}`)
      parts.push(sql`(${ors.reduce((a, b) => sql`${a} or ${b}`)})`)
    }
    if (!parts.length) return sql`true`
    return parts.reduce((a, b) => sql`${a} and ${b}`)
  }

  orderBy(sort: ListQuery<Row>['sort']): Fragment {
    const sql = this.sql
    if (!sort?.length) return sql`order by ${sql(this.pkCol)}`
    const items = sort.map((s) => {
      const c = this.col(s.field)
      const expr = TEXTUAL.has(c.type) ? sql`lower(${sql(snake(s.field))}::text)` : sql`${sql(snake(s.field))}`
      return s.direction === 'asc' ? sql`${expr} asc nulls last` : sql`${expr} desc nulls first`
    })
    return sql`order by ${items.reduce((a, b) => sql`${a}, ${b}`)}`
  }

  async select(doctorId: string | null, query: ListQuery<Row> = {}): Promise<Row[]> {
    const sql = this.sql
    const rows = await sql`select * from ${sql(this.name)} where ${this.where(doctorId, query)} ${this.orderBy(query.sort)}`
    return rows.map((r) => this.fromDb(r))
  }

  async page(doctorId: string | null, query: ListQuery<Row> = {}): Promise<Page<Row>> {
    const sql = this.sql
    if (!query.page || !query.pageSize) {
      const items = await this.select(doctorId, query)
      return { items, total: items.length, page: 1, pageSize: items.length || 1, totalPages: 1 }
    }
    const total = await this.count(doctorId, query)
    const totalPages = Math.max(1, Math.ceil(total / query.pageSize))
    const page = Math.min(Math.max(1, query.page), totalPages)
    const rows = await sql`select * from ${sql(this.name)} where ${this.where(doctorId, query)} ${this.orderBy(query.sort)}
      limit ${query.pageSize} offset ${(page - 1) * query.pageSize}`
    return { items: rows.map((r) => this.fromDb(r)), total, page, pageSize: query.pageSize, totalPages }
  }

  async count(doctorId: string | null, query: Omit<ListQuery<Row>, 'page' | 'pageSize' | 'sort'> = {}): Promise<number> {
    const sql = this.sql
    const [r] = await sql`select count(*)::int as n from ${sql(this.name)} where ${this.where(doctorId, query)}`
    return Number(r.n)
  }

  async insert(row: Row, entityLabel: string): Promise<void> {
    const sql = this.sql
    const db = this.toDb(row)
    try {
      await sql`insert into ${sql(this.name)} ${sql(db)}`
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new DuplicateKeyError(entityLabel, String(row[this.spec.primaryKey]))
      throw err
    }
  }

  /** Multi-row upsert in chunks. Callers check tenant ownership first. */
  async upsertMany(rows: Row[], tx: Sql = this.sql): Promise<void> {
    if (!rows.length) return
    const cols = this.spec.columns.map((c) => snake(c.key))
    const updates = cols.filter((c) => c !== this.pkCol).map((c) => `"${c}" = excluded."${c}"`).join(', ')
    for (let i = 0; i < rows.length; i += 200) {
      const chunk = rows.slice(i, i + 200).map((r) => this.toDb(r))
      await tx`insert into ${tx(this.name)} ${tx(chunk, cols)} on conflict (${tx(this.pkCol)}) do update set ${tx.unsafe(updates)}`
    }
  }
}

class PgTenantRepository<T extends { doctorId: string }> implements TenantRepository<T> {
  readonly entity: string
  protected readonly table: PgTable
  protected readonly sql: Sql

  constructor(sql: Sql, tableName: string, entity: string) {
    this.sql = sql
    this.entity = entity
    this.table = new PgTable(sql, TABLES_BY_NAME[tableName])
  }

  protected get pk(): string {
    return this.table.spec.primaryKey
  }

  async findById(doctorId: string, id: string): Promise<T | null> {
    const sql = this.sql
    const rows = await sql`select * from ${sql(this.table.name)} where ${sql(this.table.pkCol)} = ${id} and doctor_id = ${doctorId}`
    return rows[0] ? (this.table.fromDb(rows[0]) as T) : null
  }

  async findByIds(doctorId: string, ids: string[]): Promise<T[]> {
    if (!ids.length) return []
    const sql = this.sql
    const rows = await sql`select * from ${sql(this.table.name)} where ${sql(this.table.pkCol)} = any(${ids}::text[]) and doctor_id = ${doctorId}`
    return rows.map((r) => this.table.fromDb(r) as T)
  }

  async list(doctorId: string, query: ListQuery<T> = {}): Promise<Page<T>> {
    return (await this.table.page(doctorId, query as ListQuery<Row>)) as unknown as Page<T>
  }

  async findAll(doctorId: string, query: Omit<ListQuery<T>, 'page' | 'pageSize'> = {}): Promise<T[]> {
    return (await this.table.select(doctorId, query as ListQuery<Row>)) as T[]
  }

  async count(doctorId: string, query: Omit<ListQuery<T>, 'page' | 'pageSize' | 'sort'> = {}): Promise<number> {
    return this.table.count(doctorId, query as ListQuery<Row>)
  }

  async insert(doctorId: string, entity: T): Promise<T> {
    const row = { ...entity, doctorId }
    await this.table.insert(row, this.entity)
    return row
  }

  async update(doctorId: string, id: string, patch: Partial<T>): Promise<T> {
    const sql = this.sql
    const clean: Row = { ...patch }
    delete clean[this.pk]
    delete clean.doctorId
    const db = this.table.toDb(clean, { partial: true })
    const rows = Object.keys(db).length
      ? await sql`update ${sql(this.table.name)} set ${sql(db)} where ${sql(this.table.pkCol)} = ${id} and doctor_id = ${doctorId} returning *`
      : await sql`select * from ${sql(this.table.name)} where ${sql(this.table.pkCol)} = ${id} and doctor_id = ${doctorId}`
    if (!rows[0]) throw new NotFoundError(this.entity)
    return this.table.fromDb(rows[0]) as T
  }

  async remove(doctorId: string, id: string): Promise<void> {
    const sql = this.sql
    await sql`delete from ${sql(this.table.name)} where ${sql(this.table.pkCol)} = ${id} and doctor_id = ${doctorId}`
  }

  async bulkUpsert(doctorId: string, entities: T[]): Promise<void> {
    if (!entities.length) return
    const foreign = await this.foreignIds(doctorId, entities.map((e) => String((e as Row)[this.pk])))
    if (foreign.length) throw new DuplicateKeyError(this.entity, foreign[0])
    await this.table.upsertMany(entities.map((e) => ({ ...e, doctorId })))
  }

  async removeAllForDoctor(doctorId: string): Promise<void> {
    const sql = this.sql
    await sql`delete from ${sql(this.table.name)} where doctor_id = ${doctorId}`
  }

  async foreignIds(doctorId: string, ids: string[]): Promise<string[]> {
    if (!ids.length) return []
    const sql = this.sql
    const rows = await sql`select ${sql(this.table.pkCol)} as id from ${sql(this.table.name)}
      where ${sql(this.table.pkCol)} = any(${ids}::text[]) and doctor_id <> ${doctorId}`
    return rows.map((r) => String(r.id))
  }
}

class PgPrescriptionRepository extends PgTenantRepository<Prescription> implements PrescriptionRepository {
  private readonly lines: PgTable

  constructor(sql: Sql) {
    super(sql, 'prescriptions', 'Prescription')
    this.lines = new PgTable(sql, TABLES_BY_NAME.prescription_medicines)
  }

  /** Header, medicine lines and the supersede flag commit together or not at all. */
  async saveVersion(
    doctorId: string,
    header: Prescription,
    items: PrescriptionMedicine[],
    supersede?: { prescriptionId: string; updatedAt: string },
  ): Promise<void> {
    try {
      await this.sql.begin(async (tx) => {
        await tx`insert into ${tx(this.table.name)} ${tx(this.table.toDb({ ...header, doctorId }))}`
        if (items.length) {
          const cols = this.lines.spec.columns.map((c) => snake(c.key))
          await tx`insert into ${tx(this.lines.name)} ${tx(
            items.map((i) => this.lines.toDb({ ...i, doctorId })),
            cols,
          )}`
        }
        if (supersede) {
          const res = await tx`update ${tx(this.table.name)}
            set status = 'Superseded', superseded_by_id = ${header.prescriptionId}, updated_at = ${supersede.updatedAt}
            where prescription_id = ${supersede.prescriptionId} and doctor_id = ${doctorId} returning prescription_id`
          if (!res.length) throw new NotFoundError(this.entity)
        }
      })
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw new DuplicateKeyError(this.entity, header.prescriptionId)
      throw err
    }
  }
}

class PgDoctorRepository implements DoctorRepository {
  private readonly table: PgTable
  private readonly sql: Sql
  constructor(sql: Sql) {
    this.sql = sql
    this.table = new PgTable(sql, TABLES_BY_NAME.doctors)
  }
  async findById(doctorId: string): Promise<Doctor | null> {
    const sql = this.sql
    const rows = await sql`select * from ${sql(this.table.name)} where doctor_id = ${doctorId}`
    return rows[0] ? (this.table.fromDb(rows[0]) as unknown as Doctor) : null
  }
  async upsert(doctor: Doctor): Promise<Doctor> {
    await this.table.upsertMany([doctor as unknown as Row])
    return doctor
  }
  async remove(doctorId: string): Promise<void> {
    const sql = this.sql
    await sql`delete from ${sql(this.table.name)} where doctor_id = ${doctorId}`
  }
}

class PgAuditRepository implements AuditRepository {
  private readonly table: PgTable
  private readonly sql: Sql
  constructor(sql: Sql) {
    this.sql = sql
    this.table = new PgTable(sql, AUDIT_TABLE)
  }
  async append(entry: AuditLog): Promise<void> {
    await this.table.insert(entry as unknown as Row, 'Audit entry')
  }
  async list(doctorId: string, query: ListQuery<AuditLog> = {}): Promise<Page<AuditLog>> {
    return (await this.table.page(doctorId, query as ListQuery<Row>)) as unknown as Page<AuditLog>
  }
  async removeAllForDoctor(doctorId: string): Promise<void> {
    const sql = this.sql
    await sql`delete from ${sql(this.table.name)} where doctor_id = ${doctorId}`
  }
}

/** Binary files in Postgres (bytea). Kept behind FileStore so it can move to object storage later. */
class PgFileStore implements FileStore {
  private readonly table: PgTable
  private readonly sql: Sql
  constructor(sql: Sql) {
    this.sql = sql
    this.table = new PgTable(sql, FILES_TABLE)
  }
  async put(file: StoredFile): Promise<void> {
    const data = new Uint8Array(await file.blob.arrayBuffer())
    await this.table.upsertMany([{ ...file, data } as unknown as Row])
  }
  async get(doctorId: string, fileId: string): Promise<StoredFile | null> {
    const sql = this.sql
    const rows = await sql`select * from ${sql(this.table.name)} where file_id = ${fileId} and doctor_id = ${doctorId}`
    if (!rows[0]) return null
    const r = this.table.fromDb(rows[0])
    const bytes = r.data as Uint8Array
    return {
      fileId: String(r.fileId),
      doctorId: String(r.doctorId),
      fileName: String(r.fileName),
      mimeType: String(r.mimeType),
      sizeBytes: Number(r.sizeBytes),
      createdAt: String(r.createdAt),
      blob: new Blob([bytes as BlobPart], { type: String(r.mimeType) }),
    }
  }
  async remove(doctorId: string, fileId: string): Promise<void> {
    const sql = this.sql
    await sql`delete from ${sql(this.table.name)} where file_id = ${fileId} and doctor_id = ${doctorId}`
  }
  async removeAllForDoctor(doctorId: string): Promise<void> {
    const sql = this.sql
    await sql`delete from ${sql(this.table.name)} where doctor_id = ${doctorId}`
  }
}

class PgMetaStore implements MetaStore {
  private readonly table: PgTable
  private readonly sql: Sql
  constructor(sql: Sql) {
    this.sql = sql
    this.table = new PgTable(sql, META_TABLE)
  }
  async get<V>(key: string): Promise<V | undefined> {
    const sql = this.sql
    const rows = await sql`select value from ${sql(this.table.name)} where key = ${key}`
    if (!rows[0]) return undefined
    const v = rows[0].value
    return (typeof v === 'string' ? JSON.parse(v) : v) as V
  }
  async set<V>(key: string, value: V): Promise<void> {
    await this.table.upsertMany([{ key, value } as Row])
  }
}

export function createPostgresRepositories(sql: Sql): RepositoryRegistry {
  return {
    storageType: 'POSTGRES',
    doctors: new PgDoctorRepository(sql),
    patients: new PgTenantRepository(sql, 'patients', 'Patient'),
    visits: new PgTenantRepository(sql, 'visits', 'Visit'),
    diagnoses: new PgTenantRepository(sql, 'diagnoses', 'Diagnosis'),
    prescriptions: new PgPrescriptionRepository(sql),
    prescriptionMedicines: new PgTenantRepository(sql, 'prescription_medicines', 'Prescription medicine'),
    medicines: new PgTenantRepository(sql, 'medicines', 'Medicine'),
    appointments: new PgTenantRepository(sql, 'appointments', 'Appointment'),
    followUps: new PgTenantRepository(sql, 'followups', 'Follow-up'),
    documents: new PgTenantRepository(sql, 'medical_documents', 'Document'),
    audit: new PgAuditRepository(sql),
    files: new PgFileStore(sql),
    meta: new PgMetaStore(sql),
  }
}
