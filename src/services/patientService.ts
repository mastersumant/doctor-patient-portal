import type { Patient, PatientListItem, PatientStatus, Gender } from '@/domain/types'
import type { Filters, Page, SortSpec } from '@/data/repositories/interfaces'
import { patientSchema, type PatientInput } from '@/validations/schemas'
import { ageFromDob, nowIso, todayIso } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, changedFields, type ServiceDeps } from './context'
import { DuplicateKeyError, NotFoundError } from './errors'
import type { FileService } from './fileService'

export interface PatientListParams {
  search?: string
  status?: PatientStatus | ''
  gender?: Gender | ''
  archived?: boolean
  page?: number
  pageSize?: number
  sort?: 'name' | 'newest' | 'oldest' | 'id'
}

export interface PatientOption {
  patientId: string
  fullName: string
  mobile: string
  age: number
  gender: Gender
}

const SEARCH_FIELDS: Array<keyof Patient & string> = ['fullName', 'patientId', 'mobile']

export class PatientService extends BaseService {
  private readonly files: FileService

  constructor(deps: ServiceDeps, files: FileService) {
    super(deps)
    this.files = files
  }

  async list(params: PatientListParams = {}): Promise<Page<PatientListItem>> {
    const doctorId = this.doctorId()
    const filters: Filters<Patient> = {}
    if (params.status) filters.status = params.status
    if (params.gender) filters.gender = params.gender
    if (params.archived) filters.deletedAt = { isNull: false }

    const sortMap: Record<NonNullable<PatientListParams['sort']>, Array<SortSpec<Patient>>> = {
      name: [{ field: 'fullName', direction: 'asc' }],
      newest: [{ field: 'registrationDate', direction: 'desc' }, { field: 'createdAt', direction: 'desc' }],
      oldest: [{ field: 'registrationDate', direction: 'asc' }],
      id: [{ field: 'patientId', direction: 'asc' }],
    }

    const page = await this.repos.patients.list(doctorId, {
      filters,
      includeDeleted: params.archived,
      search: params.search ? { term: params.search, fields: SEARCH_FIELDS } : undefined,
      sort: sortMap[params.sort ?? 'newest'],
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 10,
    })
    return { ...page, items: await this.enrich(page.items) }
  }

  /** Adds age, last visit and next pending follow-up for the given page of patients. */
  private async enrich(patients: Patient[]): Promise<PatientListItem[]> {
    if (patients.length === 0) return []
    const doctorId = this.doctorId()
    const ids = patients.map((p) => p.patientId)
    const [visits, followUps] = await Promise.all([
      this.repos.visits.findAll(doctorId, { filters: { patientId: { in: ids } } }),
      this.repos.followUps.findAll(doctorId, { filters: { patientId: { in: ids }, status: { in: ['Pending', 'Scheduled'] } } }),
    ])
    const lastVisit = new Map<string, string>()
    for (const v of visits) {
      const prev = lastVisit.get(v.patientId)
      if (!prev || v.visitDateTime > prev) lastVisit.set(v.patientId, v.visitDateTime)
    }
    const nextFu = new Map<string, string>()
    for (const f of followUps) {
      const prev = nextFu.get(f.patientId)
      if (!prev || f.dueDate < prev) nextFu.set(f.patientId, f.dueDate)
    }
    return patients.map((p) => ({
      ...p,
      age: ageFromDob(p.dob),
      lastVisit: lastVisit.get(p.patientId) ?? null,
      nextFollowUp: nextFu.get(p.patientId) ?? null,
    }))
  }

  async get(patientId: string, opts: { includeArchived?: boolean } = {}): Promise<Patient> {
    const p = await this.repos.patients.findById(this.doctorId(), patientId)
    if (!p || (p.deletedAt && !opts.includeArchived)) throw new NotFoundError('Patient')
    return p
  }

  async getDetail(patientId: string): Promise<PatientListItem> {
    const p = await this.get(patientId, { includeArchived: true })
    const [item] = await this.enrich([p])
    return item
  }

  /** Compact list for pickers and global search. */
  async search(term: string, limit = 8): Promise<PatientOption[]> {
    const page = await this.repos.patients.list(this.doctorId(), {
      search: term.trim() ? { term, fields: SEARCH_FIELDS } : undefined,
      sort: [{ field: 'fullName', direction: 'asc' }],
      page: 1,
      pageSize: limit,
    })
    return page.items.map(toOption)
  }

  async options(): Promise<PatientOption[]> {
    const all = await this.repos.patients.findAll(this.doctorId(), { sort: [{ field: 'fullName', direction: 'asc' }] })
    return all.map(toOption)
  }

  async nameMap(): Promise<Map<string, Patient>> {
    const all = await this.repos.patients.findAll(this.doctorId(), { includeDeleted: true })
    return new Map(all.map((p) => [p.patientId, p]))
  }

  async create(input: PatientInput): Promise<Patient> {
    const data = this.validate(patientSchema, input)
    const doctorId = this.doctorId()
    const now = nowIso()
    for (let attempt = 0; ; attempt++) {
      const patient: Patient = {
        ...data,
        patientId: newId('patient'),
        doctorId,
        photoFileId: null,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
      }
      try {
        await this.repos.patients.insert(doctorId, patient)
        await this.audit('Patient', patient.patientId, 'create')
        this.changed('patients')
        return patient
      } catch (err) {
        if (!(err instanceof DuplicateKeyError) || attempt >= 3) throw err
      }
    }
  }

  async update(patientId: string, input: PatientInput): Promise<Patient> {
    const data = this.validate(patientSchema, input)
    const before = await this.get(patientId, { includeArchived: true })
    const updated = await this.repos.patients.update(this.doctorId(), patientId, { ...data, updatedAt: nowIso() })
    await this.audit('Patient', patientId, 'update', changedFields(before, data).join(', '))
    this.changed('patients')
    return updated
  }

  /** Soft delete: the record and its clinical history stay intact and can be restored. */
  async archive(patientId: string): Promise<void> {
    await this.get(patientId)
    await this.repos.patients.update(this.doctorId(), patientId, { deletedAt: nowIso(), status: 'Inactive', updatedAt: nowIso() })
    await this.audit('Patient', patientId, 'archive')
    this.changed('patients')
  }

  async restore(patientId: string): Promise<void> {
    await this.get(patientId, { includeArchived: true })
    await this.repos.patients.update(this.doctorId(), patientId, { deletedAt: null, status: 'Active', updatedAt: nowIso() })
    await this.audit('Patient', patientId, 'restore')
    this.changed('patients')
  }

  async setPhoto(patientId: string, file: Blob & { name?: string }): Promise<void> {
    const patient = await this.get(patientId, { includeArchived: true })
    const stored = await this.files.store(file, { imagesOnly: true })
    await this.files.remove(patient.photoFileId)
    await this.repos.patients.update(this.doctorId(), patientId, { photoFileId: stored.fileId, updatedAt: nowIso() })
    await this.audit('Patient', patientId, 'update', 'photo')
    this.changed('patients')
  }

  async removePhoto(patientId: string): Promise<void> {
    const patient = await this.get(patientId, { includeArchived: true })
    await this.files.remove(patient.photoFileId)
    await this.repos.patients.update(this.doctorId(), patientId, { photoFileId: null, updatedAt: nowIso() })
    this.changed('patients')
  }

  async getPhoto(fileId: string | null): Promise<Blob | null> {
    const f = await this.files.get(fileId)
    return f?.blob ?? null
  }

  async counts(): Promise<{ total: number; active: number; newThisMonth: number }> {
    const all = await this.repos.patients.findAll(this.doctorId())
    const month = todayIso().slice(0, 7)
    return {
      total: all.length,
      active: all.filter((p) => p.status === 'Active').length,
      newThisMonth: all.filter((p) => p.registrationDate.startsWith(month)).length,
    }
  }
}

function toOption(p: Patient): PatientOption {
  return { patientId: p.patientId, fullName: p.fullName, mobile: p.mobile, age: ageFromDob(p.dob), gender: p.gender }
}
