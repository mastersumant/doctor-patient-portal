/**
 * In-memory implementation of every repository contract. Used by the test
 * suite and as a fallback when the browser blocks IndexedDB (data then lasts
 * only for the tab's lifetime, and the UI says so).
 */
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

const clone = <T>(v: T): T => structuredClone(v)

export class MemoryTenantRepository<T extends { doctorId: string }> implements TenantRepository<T> {
  readonly entity: string
  protected readonly key: keyof T
  protected readonly rows = new Map<string, T>()

  constructor(entity: string, key: keyof T) {
    this.entity = entity
    this.key = key
  }

  protected idOf(row: T): string {
    return String(row[this.key])
  }

  protected scoped(doctorId: string): T[] {
    return [...this.rows.values()].filter((r) => r.doctorId === doctorId)
  }

  async findById(doctorId: string, id: string): Promise<T | null> {
    const row = this.rows.get(id)
    return row && row.doctorId === doctorId ? clone(row) : null
  }

  async findByIds(doctorId: string, ids: string[]): Promise<T[]> {
    const set = new Set(ids)
    return this.scoped(doctorId)
      .filter((r) => set.has(this.idOf(r)))
      .map(clone)
  }

  async list(doctorId: string, query: ListQuery<T> = {}): Promise<Page<T>> {
    const page = runQuery(this.scoped(doctorId), query)
    return { ...page, items: page.items.map(clone) }
  }

  async findAll(doctorId: string, query: Omit<ListQuery<T>, 'page' | 'pageSize'> = {}): Promise<T[]> {
    return filterRows(this.scoped(doctorId), query).map(clone)
  }

  async count(doctorId: string, query: Omit<ListQuery<T>, 'page' | 'pageSize' | 'sort'> = {}): Promise<number> {
    return filterRows(this.scoped(doctorId), query).length
  }

  async insert(doctorId: string, entity: T): Promise<T> {
    const id = this.idOf(entity)
    if (this.rows.has(id)) throw new DuplicateKeyError(this.entity, id)
    const row = clone({ ...entity, doctorId })
    this.rows.set(id, row)
    return clone(row)
  }

  async update(doctorId: string, id: string, patch: Partial<T>): Promise<T> {
    const existing = this.rows.get(id)
    if (!existing || existing.doctorId !== doctorId) throw new NotFoundError(this.entity)
    const next = { ...existing, ...clone(patch), [this.key]: existing[this.key], doctorId } as T
    this.rows.set(id, next)
    return clone(next)
  }

  async remove(doctorId: string, id: string): Promise<void> {
    const existing = this.rows.get(id)
    if (existing && existing.doctorId === doctorId) this.rows.delete(id)
  }

  async bulkUpsert(doctorId: string, entities: T[]): Promise<void> {
    for (const e of entities) {
      const id = this.idOf(e)
      const existing = this.rows.get(id)
      if (existing && existing.doctorId !== doctorId) throw new DuplicateKeyError(this.entity, id)
      this.rows.set(id, clone({ ...e, doctorId }))
    }
  }

  async removeAllForDoctor(doctorId: string): Promise<void> {
    for (const [id, row] of this.rows) if (row.doctorId === doctorId) this.rows.delete(id)
  }

  async foreignIds(doctorId: string, ids: string[]): Promise<string[]> {
    return ids.filter((id) => {
      const row = this.rows.get(id)
      return !!row && row.doctorId !== doctorId
    })
  }
}

export class MemoryPrescriptionRepository extends MemoryTenantRepository<Prescription> implements PrescriptionRepository {
  private readonly items: MemoryTenantRepository<PrescriptionMedicine>

  constructor(items: MemoryTenantRepository<PrescriptionMedicine>) {
    super('Prescription', 'prescriptionId')
    this.items = items
  }

  async saveVersion(
    doctorId: string,
    header: Prescription,
    items: PrescriptionMedicine[],
    supersede?: { prescriptionId: string; updatedAt: string },
  ): Promise<void> {
    // Validate everything first so the write is all-or-nothing.
    if (this.rows.has(header.prescriptionId)) throw new DuplicateKeyError(this.entity, header.prescriptionId)
    if (supersede) {
      const prev = this.rows.get(supersede.prescriptionId)
      if (!prev || prev.doctorId !== doctorId) throw new NotFoundError(this.entity)
    }
    await this.insert(doctorId, header)
    await this.items.bulkUpsert(doctorId, items)
    if (supersede) {
      await this.update(doctorId, supersede.prescriptionId, {
        status: 'Superseded',
        supersededById: header.prescriptionId,
        updatedAt: supersede.updatedAt,
      })
    }
  }
}

class MemoryDoctorRepository implements DoctorRepository {
  private readonly rows = new Map<string, Doctor>()
  async findById(doctorId: string) {
    const d = this.rows.get(doctorId)
    return d ? clone(d) : null
  }
  async upsert(doctor: Doctor) {
    this.rows.set(doctor.doctorId, clone(doctor))
    return clone(doctor)
  }
  async remove(doctorId: string) {
    this.rows.delete(doctorId)
  }
}

class MemoryAuditRepository implements AuditRepository {
  private readonly rows: AuditLog[] = []
  async append(entry: AuditLog) {
    this.rows.push(clone(entry))
  }
  async list(doctorId: string, query: ListQuery<AuditLog> = {}) {
    return runQuery(
      this.rows.filter((r) => r.doctorId === doctorId),
      query,
    )
  }
  async removeAllForDoctor(doctorId: string) {
    for (let i = this.rows.length - 1; i >= 0; i--) if (this.rows[i].doctorId === doctorId) this.rows.splice(i, 1)
  }
}

class MemoryFileStore implements FileStore {
  private readonly files = new Map<string, StoredFile>()
  async put(file: StoredFile) {
    this.files.set(file.fileId, file)
  }
  async get(doctorId: string, fileId: string) {
    const f = this.files.get(fileId)
    return f && f.doctorId === doctorId ? f : null
  }
  async remove(doctorId: string, fileId: string) {
    const f = this.files.get(fileId)
    if (f && f.doctorId === doctorId) this.files.delete(fileId)
  }
  async removeAllForDoctor(doctorId: string) {
    for (const [id, f] of this.files) if (f.doctorId === doctorId) this.files.delete(id)
  }
}

class MemoryMetaStore implements MetaStore {
  private readonly values = new Map<string, unknown>()
  async get<V>(key: string) {
    return this.values.get(key) as V | undefined
  }
  async set<V>(key: string, value: V) {
    this.values.set(key, value)
  }
}

export function createMemoryRepositories(): RepositoryRegistry {
  const prescriptionMedicines = new MemoryTenantRepository<PrescriptionMedicine>('Prescription medicine', 'id')
  return {
    storageType: 'MEMORY',
    doctors: new MemoryDoctorRepository(),
    patients: new MemoryTenantRepository('Patient', 'patientId'),
    visits: new MemoryTenantRepository('Visit', 'visitId'),
    diagnoses: new MemoryTenantRepository('Diagnosis', 'diagnosisId'),
    prescriptions: new MemoryPrescriptionRepository(prescriptionMedicines),
    prescriptionMedicines,
    medicines: new MemoryTenantRepository('Medicine', 'medicineId'),
    appointments: new MemoryTenantRepository('Appointment', 'appointmentId'),
    followUps: new MemoryTenantRepository('Follow-up', 'followUpId'),
    documents: new MemoryTenantRepository('Document', 'documentId'),
    audit: new MemoryAuditRepository(),
    files: new MemoryFileStore(),
    meta: new MemoryMetaStore(),
  }
}
