import type { Medicine, MedicineStatus } from '@/domain/types'
import type { Filters, Page } from '@/data/repositories/interfaces'
import { medicineSchema, type MedicineInput } from '@/validations/schemas'
import { nowIso } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, changedFields } from './context'
import { ConflictError, NotFoundError } from './errors'

export interface MedicineListParams {
  search?: string
  status?: MedicineStatus | ''
  category?: string
  page?: number
  pageSize?: number
}

const SEARCH_FIELDS: Array<keyof Medicine & string> = ['name', 'genericName', 'brandName', 'composition', 'medicineId']

export class MedicineService extends BaseService {
  async list(params: MedicineListParams = {}): Promise<Page<Medicine>> {
    const filters: Filters<Medicine> = {}
    if (params.status) filters.status = params.status
    if (params.category) filters.category = params.category
    return this.repos.medicines.list(this.doctorId(), {
      filters,
      search: params.search ? { term: params.search, fields: SEARCH_FIELDS } : undefined,
      sort: [{ field: 'name', direction: 'asc' }],
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 12,
    })
  }

  /** Active catalog entries matching a term, for the prescription picker. */
  async searchActive(term: string, limit = 8): Promise<Medicine[]> {
    const page = await this.repos.medicines.list(this.doctorId(), {
      filters: { status: 'Active' },
      search: term.trim() ? { term, fields: SEARCH_FIELDS } : undefined,
      sort: [{ field: 'name', direction: 'asc' }],
      page: 1,
      pageSize: limit,
    })
    return page.items
  }

  async get(medicineId: string): Promise<Medicine> {
    const m = await this.repos.medicines.findById(this.doctorId(), medicineId)
    if (!m) throw new NotFoundError('Medicine')
    return m
  }

  async create(input: MedicineInput): Promise<Medicine> {
    const data = this.validate(medicineSchema, input)
    const doctorId = this.doctorId()
    const dupe = (await this.repos.medicines.findAll(doctorId)).find(
      (m) => m.name.toLowerCase() === data.name.toLowerCase() && m.strength.toLowerCase() === data.strength.toLowerCase(),
    )
    if (dupe) throw new ConflictError(`${data.name} ${data.strength} is already in your catalog`)
    const now = nowIso()
    const med: Medicine = { ...data, medicineId: newId('medicine'), doctorId, createdAt: now, updatedAt: now }
    await this.repos.medicines.insert(doctorId, med)
    await this.audit('Medicine', med.medicineId, 'create')
    this.changed('medicines')
    return med
  }

  async update(medicineId: string, input: MedicineInput): Promise<Medicine> {
    const data = this.validate(medicineSchema, input)
    const before = await this.get(medicineId)
    const updated = await this.repos.medicines.update(this.doctorId(), medicineId, { ...data, updatedAt: nowIso() })
    await this.audit('Medicine', medicineId, 'update', changedFields(before, data).join(', '))
    this.changed('medicines')
    return updated
  }

  async setStatus(medicineId: string, status: MedicineStatus): Promise<void> {
    await this.get(medicineId)
    await this.repos.medicines.update(this.doctorId(), medicineId, { status, updatedAt: nowIso() })
    await this.audit('Medicine', medicineId, 'update', `status → ${status}`)
    this.changed('medicines')
  }

  /** Only never-prescribed medicines can be deleted; prescribed ones are deactivated instead. */
  async delete(medicineId: string): Promise<void> {
    const doctorId = this.doctorId()
    await this.get(medicineId)
    const used = await this.repos.prescriptionMedicines.count(doctorId, { filters: { medicineId } })
    if (used > 0) {
      throw new ConflictError('This medicine appears on issued prescriptions. Deactivate it instead so history stays accurate.')
    }
    await this.repos.medicines.remove(doctorId, medicineId)
    await this.audit('Medicine', medicineId, 'archive', 'deleted (never prescribed)')
    this.changed('medicines')
  }

  async categories(): Promise<string[]> {
    const all = await this.repos.medicines.findAll(this.doctorId())
    return [...new Set(all.map((m) => m.category).filter(Boolean))].sort()
  }
}
