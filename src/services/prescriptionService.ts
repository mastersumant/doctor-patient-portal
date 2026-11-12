import type { Prescription, PrescriptionMedicine, PrescriptionSnapshot, PrescriptionWithItems } from '@/domain/types'
import type { Filters, Page } from '@/data/repositories/interfaces'
import { prescriptionSchema, type PrescriptionInput } from '@/validations/schemas'
import { formatAge, nowIso } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, emptyToNull } from './context'
import { ConflictError, NotFoundError, ValidationError } from './errors'

export interface PrescriptionListParams {
  search?: string
  patientId?: string
  from?: string
  to?: string
  /** Include superseded versions (history view). Defaults to current versions only. */
  includeSuperseded?: boolean
  page?: number
  pageSize?: number
}

export interface PrescriptionListItem extends Prescription {
  itemCount: number
  medicineNames: string
}

export interface PrescriptionDetail extends PrescriptionWithItems {
  versions: Array<Pick<Prescription, 'prescriptionId' | 'version' | 'status' | 'issuedAt' | 'editReason'>>
}

/**
 * Prescriptions are legal clinical records. Once issued, a version is never
 * modified: "editing" issues a new version with the same Rx number and marks the
 * previous one Superseded, so the originally issued contents stay retrievable.
 */
export class PrescriptionService extends BaseService {
  async list(params: PrescriptionListParams = {}): Promise<Page<PrescriptionListItem>> {
    const doctorId = this.doctorId()
    const filters: Filters<Prescription> = {}
    if (params.patientId) filters.patientId = params.patientId
    if (!params.includeSuperseded) filters.status = { ne: 'Superseded' }
    if (params.from || params.to) {
      filters.prescriptionDate = { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) }
    }
    let rows = await this.repos.prescriptions.findAll(doctorId, {
      filters,
      sort: [
        { field: 'prescriptionDate', direction: 'desc' },
        { field: 'issuedAt', direction: 'desc' },
      ],
    })
    const term = params.search?.trim().toLowerCase()
    if (term) {
      rows = rows.filter(
        (r) =>
          r.rxNumber.toLowerCase().includes(term) ||
          r.snapshot.patientName.toLowerCase().includes(term) ||
          r.patientId.toLowerCase().includes(term) ||
          r.diagnosis.toLowerCase().includes(term),
      )
    }
    const pageSize = params.pageSize ?? 10
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(1, params.page ?? 1), totalPages)
    const slice = rows.slice((page - 1) * pageSize, page * pageSize)
    const items = await this.repos.prescriptionMedicines.findAll(doctorId, {
      filters: { prescriptionId: { in: slice.map((r) => r.prescriptionId) } },
      sort: [{ field: 'sortOrder', direction: 'asc' }],
    })
    return {
      items: slice.map((r) => {
        const lines = items.filter((i) => i.prescriptionId === r.prescriptionId)
        return { ...r, itemCount: lines.length, medicineNames: lines.map((l) => l.medicineName).join(', ') }
      }),
      total,
      page,
      pageSize,
      totalPages,
    }
  }

  async get(prescriptionId: string): Promise<PrescriptionDetail> {
    const doctorId = this.doctorId()
    const rx = await this.repos.prescriptions.findById(doctorId, prescriptionId)
    if (!rx) throw new NotFoundError('Prescription')
    const [items, versions] = await Promise.all([
      this.repos.prescriptionMedicines.findAll(doctorId, {
        filters: { prescriptionId },
        sort: [{ field: 'sortOrder', direction: 'asc' }],
      }),
      this.repos.prescriptions.findAll(doctorId, {
        filters: { rxNumber: rx.rxNumber },
        sort: [{ field: 'version', direction: 'desc' }],
      }),
    ])
    return {
      ...rx,
      items,
      versions: versions.map((v) => ({
        prescriptionId: v.prescriptionId,
        version: v.version,
        status: v.status,
        issuedAt: v.issuedAt,
        editReason: v.editReason,
      })),
    }
  }

  async recent(limit = 5): Promise<PrescriptionListItem[]> {
    return (await this.list({ page: 1, pageSize: limit })).items
  }

  private async buildSnapshot(patientId: string): Promise<PrescriptionSnapshot> {
    const doctorId = this.doctorId()
    const [patient, doctor] = await Promise.all([
      this.repos.patients.findById(doctorId, patientId),
      this.repos.doctors.findById(doctorId),
    ])
    if (!patient || patient.deletedAt) throw new NotFoundError('Patient')
    return {
      patientName: patient.fullName,
      patientAge: formatAge(patient.dob),
      patientGender: patient.gender,
      patientMobile: patient.mobile,
      patientAllergies: patient.allergies,
      doctorName: doctor?.fullName ?? '',
      qualifications: doctor?.qualifications ?? '',
      specialization: doctor?.specialization ?? '',
      registrationNumber: doctor?.registrationNumber ?? '',
      clinicName: doctor?.clinicName ?? '',
      clinicAddress: doctor?.clinicAddress ?? '',
      contactNumber: doctor?.contactNumber ?? '',
    }
  }

  private buildItems(prescriptionId: string, data: PrescriptionInput): PrescriptionMedicine[] {
    const doctorId = this.doctorId()
    return data.items.map((item, idx) => ({
      id: newId('prescriptionMedicine', 8),
      prescriptionId,
      doctorId,
      medicineId: emptyToNull(item.medicineId),
      medicineName: item.medicineName,
      genericName: item.genericName,
      strength: item.strength,
      dosage: item.dosage,
      dosageForm: item.dosageForm,
      frequency: item.frequency,
      route: item.route,
      duration: item.duration,
      quantity: item.quantity,
      timing: item.timing,
      instructions: item.instructions,
      sortOrder: idx,
    }))
  }

  private async assertVisitBelongsToPatient(visitId: string | null, patientId: string): Promise<void> {
    if (!visitId) return
    const visit = await this.repos.visits.findById(this.doctorId(), visitId)
    if (!visit || visit.deletedAt || visit.patientId !== patientId) {
      throw new ValidationError('The selected visit does not belong to this patient', { visitId: 'Choose a visit for this patient' })
    }
  }

  async create(input: PrescriptionInput): Promise<Prescription> {
    const data = this.validate(prescriptionSchema, input)
    const doctorId = this.doctorId()
    const visitId = emptyToNull(data.visitId)
    await this.assertVisitBelongsToPatient(visitId, data.patientId)
    const now = nowIso()
    const header: Prescription = {
      prescriptionId: newId('prescription'),
      rxNumber: newId('rxNumber'),
      version: 1,
      status: 'Issued',
      supersededById: null,
      patientId: data.patientId,
      doctorId,
      visitId,
      prescriptionDate: data.prescriptionDate,
      diagnosis: data.diagnosis,
      instructions: data.instructions,
      followUpDate: emptyToNull(data.followUpDate),
      editReason: '',
      issuedAt: now,
      snapshot: await this.buildSnapshot(data.patientId),
      createdAt: now,
      updatedAt: now,
    }
    await this.repos.prescriptions.saveVersion(doctorId, header, this.buildItems(header.prescriptionId, data))
    await this.audit('Prescription', header.prescriptionId, 'issue', `${header.rxNumber} v1`)
    this.changed('prescriptions')
    return header
  }

  /** Issues version N+1. The previous version is kept unchanged except for its status. */
  async revise(prescriptionId: string, input: PrescriptionInput): Promise<Prescription> {
    const data = this.validate(prescriptionSchema, input)
    if (!data.editReason.trim()) {
      throw new ValidationError('Say why this prescription is being revised', { editReason: 'A reason is required for revisions' })
    }
    const doctorId = this.doctorId()
    const previous = await this.repos.prescriptions.findById(doctorId, prescriptionId)
    if (!previous) throw new NotFoundError('Prescription')
    if (previous.status !== 'Issued') {
      throw new ConflictError(
        previous.status === 'Superseded'
          ? 'A newer version of this prescription exists. Open the latest version to revise it.'
          : 'Cancelled prescriptions cannot be revised.',
      )
    }
    const visitId = emptyToNull(data.visitId)
    await this.assertVisitBelongsToPatient(visitId, previous.patientId)
    const now = nowIso()
    const header: Prescription = {
      ...previous,
      prescriptionId: newId('prescription'),
      version: previous.version + 1,
      status: 'Issued',
      supersededById: null,
      visitId,
      prescriptionDate: data.prescriptionDate,
      diagnosis: data.diagnosis,
      instructions: data.instructions,
      followUpDate: emptyToNull(data.followUpDate),
      editReason: data.editReason,
      issuedAt: now,
      snapshot: await this.buildSnapshot(previous.patientId),
      createdAt: now,
      updatedAt: now,
    }
    await this.repos.prescriptions.saveVersion(doctorId, header, this.buildItems(header.prescriptionId, data), {
      prescriptionId: previous.prescriptionId,
      updatedAt: now,
    })
    await this.audit('Prescription', previous.prescriptionId, 'revise', `superseded by v${header.version}`)
    await this.audit('Prescription', header.prescriptionId, 'issue', `${header.rxNumber} v${header.version}`)
    this.changed('prescriptions')
    return header
  }

  async cancel(prescriptionId: string, reason: string): Promise<void> {
    const doctorId = this.doctorId()
    const rx = await this.repos.prescriptions.findById(doctorId, prescriptionId)
    if (!rx) throw new NotFoundError('Prescription')
    if (rx.status !== 'Issued') throw new ConflictError('Only the current issued version can be cancelled.')
    if (!reason.trim()) throw new ValidationError('Give a reason for cancelling', { reason: 'Required' })
    await this.repos.prescriptions.update(doctorId, prescriptionId, {
      status: 'Cancelled',
      editReason: reason.trim().slice(0, 300),
      updatedAt: nowIso(),
    })
    await this.audit('Prescription', prescriptionId, 'cancel')
    this.changed('prescriptions')
  }

  toFormValues(rx: PrescriptionWithItems): PrescriptionInput {
    return {
      patientId: rx.patientId,
      visitId: rx.visitId ?? '',
      prescriptionDate: rx.prescriptionDate,
      diagnosis: rx.diagnosis,
      instructions: rx.instructions,
      followUpDate: rx.followUpDate ?? '',
      editReason: '',
      items: rx.items.map((i) => ({
        medicineId: i.medicineId ?? '',
        medicineName: i.medicineName,
        genericName: i.genericName,
        strength: i.strength,
        dosage: i.dosage,
        dosageForm: i.dosageForm,
        frequency: i.frequency,
        route: i.route,
        duration: i.duration,
        quantity: i.quantity,
        timing: i.timing,
        instructions: i.instructions,
      })),
    }
  }
}
