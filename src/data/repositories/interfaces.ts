/**
 * Repository contracts. Business services depend only on these interfaces,
 * never on a storage technology. Implementations today: IndexedDB (browser
 * persistence) and in-memory (tests / fallback). A SQL or REST implementation
 * only has to satisfy the same contracts.
 *
 * Tenancy is part of the contract: every clinical repository method takes the
 * owning doctor's ID and must only ever read or write that doctor's rows.
 * A SQL implementation maps this to `WHERE doctor_id = $1` on every statement.
 */
import type {
  Appointment,
  AuditLog,
  Diagnosis,
  Doctor,
  FollowUp,
  MedicalDocument,
  Medicine,
  Patient,
  Prescription,
  PrescriptionMedicine,
  StoredFile,
  Visit,
} from '@/domain/types'

export type Scalar = string | number | boolean | null

/** Storage-agnostic filter operators (map 1:1 to SQL WHERE clauses / query params). */
export type FilterValue =
  | Scalar
  | {
      eq?: Scalar
      ne?: Scalar
      in?: Scalar[]
      gte?: string | number
      lte?: string | number
      gt?: string | number
      lt?: string | number
      isNull?: boolean
    }

export type Filters<T> = Partial<Record<Extract<keyof T, string>, FilterValue>>

export interface SortSpec<T> {
  field: Extract<keyof T, string>
  direction: 'asc' | 'desc'
}

export interface ListQuery<T> {
  filters?: Filters<T>
  /** Case-insensitive "contains" across the given fields (SQL: ILIKE ... OR ...). */
  search?: { term: string; fields: Array<Extract<keyof T, string>> }
  sort?: Array<SortSpec<T>>
  /** 1-based page number. Omit page/pageSize to get every match. */
  page?: number
  pageSize?: number
  /** Soft-deleted rows are excluded unless this is true. */
  includeDeleted?: boolean
}

export interface Page<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

/** Generic doctor-scoped repository for one entity/table. */
export interface TenantRepository<T> {
  readonly entity: string
  findById(doctorId: string, id: string): Promise<T | null>
  findByIds(doctorId: string, ids: string[]): Promise<T[]>
  list(doctorId: string, query?: ListQuery<T>): Promise<Page<T>>
  findAll(doctorId: string, query?: Omit<ListQuery<T>, 'page' | 'pageSize'>): Promise<T[]>
  count(doctorId: string, query?: Omit<ListQuery<T>, 'page' | 'pageSize' | 'sort'>): Promise<number>
  /** Fails with DuplicateKeyError if the primary key already exists. */
  insert(doctorId: string, entity: T): Promise<T>
  /** Fails with NotFoundError if the row does not exist for this doctor. The tenant key cannot be changed. */
  update(doctorId: string, id: string, patch: Partial<T>): Promise<T>
  /** Physical delete. Services use soft delete for clinical records instead. */
  remove(doctorId: string, id: string): Promise<void>
  bulkUpsert(doctorId: string, entities: T[]): Promise<void>
  removeAllForDoctor(doctorId: string): Promise<void>
  /** IDs from the list that already exist under a different doctor (pre-flight check for imports). */
  foreignIds(doctorId: string, ids: string[]): Promise<string[]>
}

export type PatientRepository = TenantRepository<Patient>
export type VisitRepository = TenantRepository<Visit>
export type DiagnosisRepository = TenantRepository<Diagnosis>
export type MedicineRepository = TenantRepository<Medicine>
export type AppointmentRepository = TenantRepository<Appointment>
export type FollowUpRepository = TenantRepository<FollowUp>
export type DocumentRepository = TenantRepository<MedicalDocument>
export type PrescriptionMedicineRepository = TenantRepository<PrescriptionMedicine>

export interface PrescriptionRepository extends TenantRepository<Prescription> {
  /**
   * Atomically writes a prescription header with its medicine lines and, when
   * revising, marks the previous version as superseded. SQL: one transaction.
   */
  saveVersion(
    doctorId: string,
    header: Prescription,
    items: PrescriptionMedicine[],
    supersede?: { prescriptionId: string; updatedAt: string },
  ): Promise<void>
}

export interface DoctorRepository {
  findById(doctorId: string): Promise<Doctor | null>
  upsert(doctor: Doctor): Promise<Doctor>
  remove(doctorId: string): Promise<void>
}

export interface AuditRepository {
  append(entry: AuditLog): Promise<void>
  list(doctorId: string, query?: ListQuery<AuditLog>): Promise<Page<AuditLog>>
  removeAllForDoctor(doctorId: string): Promise<void>
}

/** Binary storage for documents, photos and signatures (never inside records). */
export interface FileStore {
  put(file: StoredFile): Promise<void>
  get(doctorId: string, fileId: string): Promise<StoredFile | null>
  remove(doctorId: string, fileId: string): Promise<void>
  removeAllForDoctor(doctorId: string): Promise<void>
}

export interface MetaStore {
  get<V = unknown>(key: string): Promise<V | undefined>
  set<V = unknown>(key: string, value: V): Promise<void>
}

export interface RepositoryRegistry {
  storageType: StorageType
  doctors: DoctorRepository
  patients: PatientRepository
  visits: VisitRepository
  diagnoses: DiagnosisRepository
  prescriptions: PrescriptionRepository
  prescriptionMedicines: PrescriptionMedicineRepository
  medicines: MedicineRepository
  appointments: AppointmentRepository
  followUps: FollowUpRepository
  documents: DocumentRepository
  audit: AuditRepository
  files: FileStore
  meta: MetaStore
}

export type StorageType = 'INDEXEDDB' | 'MEMORY'
