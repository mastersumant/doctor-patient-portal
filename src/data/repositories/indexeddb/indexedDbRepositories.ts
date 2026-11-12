/**
 * IndexedDB implementation of the repository contracts — the prototype's
 * persistence layer while there is no backend. Each entity is its own object
 * store (≈ one SQL table / one Excel sheet) with a `doctorId` index.
 *
 * IndexedDB transactions are atomic and serialised per store, which gives the
 * same guarantees the Excel design needed file locking and atomic writes for.
 */
import { openDB, type IDBPDatabase } from 'idb'
import type { AuditLog, Doctor, Prescription, PrescriptionMedicine, StoredFile } from '@/domain/types'
import { DuplicateKeyError, NotFoundError } from '@/services/errors'
import type {
  AuditRepository,
  DoctorRepository,
  FileStore,
  ListQuery,
  MetaStore,
  Page,
  PrescriptionRepository,
  RepositoryRegistry,
  TenantRepository,
} from '../interfaces'
import { filterRows, runQuery } from '../queryEngine'

export const DB_NAME = 'clinicdesk'
export const DB_VERSION = 1

/** store name → primary key. Store names match the planned SQL tables / Excel sheets. */
export const STORES = {
  doctors: 'doctorId',
  patients: 'patientId',
  visits: 'visitId',
  diagnoses: 'diagnosisId',
  prescriptions: 'prescriptionId',
  prescription_medicines: 'id',
  medicines: 'medicineId',
  appointments: 'appointmentId',
  followups: 'followUpId',
  medical_documents: 'documentId',
  audit_logs: 'auditId',
  files: 'fileId',
  meta: 'key',
} as const

export type StoreName = keyof typeof STORES

type DB = IDBPDatabase<unknown>

export async function openClinicDb(name = DB_NAME): Promise<DB> {
  return openDB(name, DB_VERSION, {
    upgrade(db) {
      for (const [store, keyPath] of Object.entries(STORES)) {
        if (db.objectStoreNames.contains(store)) continue
        const os = db.createObjectStore(store, { keyPath })
        if (store !== 'doctors' && store !== 'meta') os.createIndex('doctorId', 'doctorId')
      }
    },
  })
}

function isConstraintError(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'ConstraintError'
}

export class IdbTenantRepository<T extends { doctorId: string }> implements TenantRepository<T> {
  readonly entity: string
  protected readonly db: DB
  protected readonly store: StoreName
  protected readonly key: keyof T

  constructor(db: DB, store: StoreName, entity: string) {
    this.db = db
    this.store = store
    this.entity = entity
    this.key = STORES[store] as keyof T
  }

  protected async scoped(doctorId: string): Promise<T[]> {
    return (await this.db.getAllFromIndex(this.store, 'doctorId', doctorId)) as T[]
  }

  async findById(doctorId: string, id: string): Promise<T | null> {
    const row = (await this.db.get(this.store, id)) as T | undefined
    return row && row.doctorId === doctorId ? row : null
  }

  async findByIds(doctorId: string, ids: string[]): Promise<T[]> {
    const tx = this.db.transaction(this.store)
    const rows = (await Promise.all(ids.map((id) => tx.store.get(id)))) as Array<T | undefined>
    await tx.done
    return rows.filter((r): r is T => !!r && r.doctorId === doctorId)
  }

  async list(doctorId: string, query: ListQuery<T> = {}): Promise<Page<T>> {
    return runQuery(await this.scoped(doctorId), query)
  }

  async findAll(doctorId: string, query: Omit<ListQuery<T>, 'page' | 'pageSize'> = {}): Promise<T[]> {
    return filterRows(await this.scoped(doctorId), query)
  }

  async count(doctorId: string, query: Omit<ListQuery<T>, 'page' | 'pageSize' | 'sort'> = {}): Promise<number> {
    if (!query.filters && !query.search && query.includeDeleted) {
      return this.db.countFromIndex(this.store, 'doctorId', doctorId)
    }
    return filterRows(await this.scoped(doctorId), query).length
  }

  async insert(doctorId: string, entity: T): Promise<T> {
    const row = { ...entity, doctorId }
    try {
      await this.db.add(this.store, row)
    } catch (err) {
      if (isConstraintError(err)) throw new DuplicateKeyError(this.entity, String(entity[this.key]))
      throw err
    }
    return row
  }

  async update(doctorId: string, id: string, patch: Partial<T>): Promise<T> {
    const tx = this.db.transaction(this.store, 'readwrite')
    const existing = (await tx.store.get(id)) as T | undefined
    if (!existing || existing.doctorId !== doctorId) {
      tx.abort()
      await tx.done.catch(() => undefined)
      throw new NotFoundError(this.entity)
    }
    const next = { ...existing, ...patch, [this.key]: existing[this.key], doctorId } as T
    await tx.store.put(next)
    await tx.done
    return next
  }

  async remove(doctorId: string, id: string): Promise<void> {
    const tx = this.db.transaction(this.store, 'readwrite')
    const existing = (await tx.store.get(id)) as T | undefined
    if (existing && existing.doctorId === doctorId) await tx.store.delete(id)
    await tx.done
  }

  async bulkUpsert(doctorId: string, entities: T[]): Promise<void> {
    const tx = this.db.transaction(this.store, 'readwrite')
    for (const e of entities) {
      const existing = (await tx.store.get(e[this.key] as IDBValidKey)) as T | undefined
      if (existing && existing.doctorId !== doctorId) {
        tx.abort()
        await tx.done.catch(() => undefined)
        throw new DuplicateKeyError(this.entity, String(e[this.key]))
      }
      await tx.store.put({ ...e, doctorId })
    }
    await tx.done
  }

  async removeAllForDoctor(doctorId: string): Promise<void> {
    const tx = this.db.transaction(this.store, 'readwrite')
    const keys = await tx.store.index('doctorId').getAllKeys(doctorId)
    for (const k of keys) await tx.store.delete(k)
    await tx.done
  }

  async foreignIds(doctorId: string, ids: string[]): Promise<string[]> {
    const tx = this.db.transaction(this.store)
    const rows = (await Promise.all(ids.map((id) => tx.store.get(id)))) as Array<T | undefined>
    await tx.done
    return ids.filter((_, i) => !!rows[i] && rows[i]!.doctorId !== doctorId)
  }
}

class IdbPrescriptionRepository extends IdbTenantRepository<Prescription> implements PrescriptionRepository {
  constructor(db: DB) {
    super(db, 'prescriptions', 'Prescription')
  }

  async saveVersion(
    doctorId: string,
    header: Prescription,
    items: PrescriptionMedicine[],
    supersede?: { prescriptionId: string; updatedAt: string },
  ): Promise<void> {
    // One transaction across both stores: header, lines and supersede flag commit together or not at all.
    const tx = this.db.transaction(['prescriptions', 'prescription_medicines'], 'readwrite')
    const rx = tx.objectStore('prescriptions')
    const lines = tx.objectStore('prescription_medicines')
    try {
      if (supersede) {
        const prev = (await rx.get(supersede.prescriptionId)) as Prescription | undefined
        if (!prev || prev.doctorId !== doctorId) throw new NotFoundError(this.entity)
        await rx.put({
          ...prev,
          status: 'Superseded',
          supersededById: header.prescriptionId,
          updatedAt: supersede.updatedAt,
        })
      }
      await rx.add({ ...header, doctorId })
      for (const item of items) await lines.add({ ...item, doctorId })
      await tx.done
    } catch (err) {
      try {
        tx.abort()
      } catch {
        /* already finished */
      }
      await tx.done.catch(() => undefined)
      if (isConstraintError(err)) throw new DuplicateKeyError(this.entity, header.prescriptionId)
      throw err
    }
  }
}

class IdbDoctorRepository implements DoctorRepository {
  private readonly db: DB
  constructor(db: DB) {
    this.db = db
  }
  async findById(doctorId: string) {
    return ((await this.db.get('doctors', doctorId)) as Doctor | undefined) ?? null
  }
  async upsert(doctor: Doctor) {
    await this.db.put('doctors', doctor)
    return doctor
  }
  async remove(doctorId: string) {
    await this.db.delete('doctors', doctorId)
  }
}

class IdbAuditRepository implements AuditRepository {
  private readonly db: DB
  constructor(db: DB) {
    this.db = db
  }
  async append(entry: AuditLog) {
    await this.db.add('audit_logs', entry)
  }
  async list(doctorId: string, query: ListQuery<AuditLog> = {}) {
    const rows = (await this.db.getAllFromIndex('audit_logs', 'doctorId', doctorId)) as AuditLog[]
    return runQuery(rows, query)
  }
  async removeAllForDoctor(doctorId: string) {
    const tx = this.db.transaction('audit_logs', 'readwrite')
    for (const k of await tx.store.index('doctorId').getAllKeys(doctorId)) await tx.store.delete(k)
    await tx.done
  }
}

class IdbFileStore implements FileStore {
  private readonly db: DB
  constructor(db: DB) {
    this.db = db
  }
  async put(file: StoredFile) {
    await this.db.put('files', file)
  }
  async get(doctorId: string, fileId: string) {
    const f = (await this.db.get('files', fileId)) as StoredFile | undefined
    return f && f.doctorId === doctorId ? f : null
  }
  async remove(doctorId: string, fileId: string) {
    const f = await this.get(doctorId, fileId)
    if (f) await this.db.delete('files', fileId)
  }
  async removeAllForDoctor(doctorId: string) {
    const tx = this.db.transaction('files', 'readwrite')
    for (const k of await tx.store.index('doctorId').getAllKeys(doctorId)) await tx.store.delete(k)
    await tx.done
  }
}

class IdbMetaStore implements MetaStore {
  private readonly db: DB
  constructor(db: DB) {
    this.db = db
  }
  async get<V>(key: string) {
    const row = (await this.db.get('meta', key)) as { key: string; value: V } | undefined
    return row?.value
  }
  async set<V>(key: string, value: V) {
    await this.db.put('meta', { key, value })
  }
}

export async function createIndexedDbRepositories(dbName = DB_NAME): Promise<RepositoryRegistry> {
  const db = await openClinicDb(dbName)
  return {
    storageType: 'INDEXEDDB',
    doctors: new IdbDoctorRepository(db),
    patients: new IdbTenantRepository(db, 'patients', 'Patient'),
    visits: new IdbTenantRepository(db, 'visits', 'Visit'),
    diagnoses: new IdbTenantRepository(db, 'diagnoses', 'Diagnosis'),
    prescriptions: new IdbPrescriptionRepository(db),
    prescriptionMedicines: new IdbTenantRepository(db, 'prescription_medicines', 'Prescription medicine'),
    medicines: new IdbTenantRepository(db, 'medicines', 'Medicine'),
    appointments: new IdbTenantRepository(db, 'appointments', 'Appointment'),
    followUps: new IdbTenantRepository(db, 'followups', 'Follow-up'),
    documents: new IdbTenantRepository(db, 'medical_documents', 'Document'),
    audit: new IdbAuditRepository(db),
    files: new IdbFileStore(db),
    meta: new IdbMetaStore(db),
  }
}
