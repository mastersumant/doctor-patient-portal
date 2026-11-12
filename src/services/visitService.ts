import type { Diagnosis, Visit, VisitType, VisitWithDiagnoses } from '@/domain/types'
import type { Filters, Page } from '@/data/repositories/interfaces'
import { visitSchema, type DiagnosisInput, type VisitInput } from '@/validations/schemas'
import { calculateBmi, toNumberOrNull } from '@/utils/clinical'
import { combineDateTime, nowIso, splitDateTime } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, changedFields, emptyToNull, type ServiceDeps } from './context'
import { NotFoundError } from './errors'
import type { AppointmentService } from './appointmentService'
import type { FollowUpService } from './followUpService'

export interface VisitListParams {
  search?: string
  patientId?: string
  visitType?: VisitType | ''
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export interface VisitListItem extends Visit {
  patientName: string
}

export interface VitalsPoint {
  visitId: string
  date: string
  bpSystolic: number | null
  bpDiastolic: number | null
  heartRate: number | null
  temperatureF: number | null
  spo2: number | null
  weightKg: number | null
  bmi: number | null
}

export class VisitService extends BaseService {
  private readonly appointments: AppointmentService
  private readonly followUps: FollowUpService

  constructor(deps: ServiceDeps, appointments: AppointmentService, followUps: FollowUpService) {
    super(deps)
    this.appointments = appointments
    this.followUps = followUps
  }

  async list(params: VisitListParams = {}): Promise<Page<VisitListItem>> {
    const doctorId = this.doctorId()
    const filters: Filters<Visit> = {}
    if (params.patientId) filters.patientId = params.patientId
    if (params.visitType) filters.visitType = params.visitType
    if (params.from || params.to) {
      filters.visitDateTime = {
        ...(params.from ? { gte: new Date(params.from + 'T00:00:00').toISOString() } : {}),
        ...(params.to ? { lte: new Date(params.to + 'T23:59:59.999').toISOString() } : {}),
      }
    }
    const patients = await this.repos.patients.findAll(doctorId, { includeDeleted: true })
    const names = new Map(patients.map((p) => [p.patientId, p.fullName]))

    let rows = await this.repos.visits.findAll(doctorId, { filters, sort: [{ field: 'visitDateTime', direction: 'desc' }] })
    const term = params.search?.trim().toLowerCase()
    if (term) {
      rows = rows.filter(
        (v) =>
          v.visitId.toLowerCase().includes(term) ||
          v.chiefComplaint.toLowerCase().includes(term) ||
          v.diagnosisSummary.toLowerCase().includes(term) ||
          (names.get(v.patientId) ?? '').toLowerCase().includes(term),
      )
    }
    const pageSize = params.pageSize ?? 10
    const total = rows.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(1, params.page ?? 1), totalPages)
    const items = rows.slice((page - 1) * pageSize, page * pageSize).map((v) => ({
      ...v,
      patientName: names.get(v.patientId) ?? 'Unknown patient',
    }))
    return { items, total, page, pageSize, totalPages }
  }

  async listForPatient(patientId: string): Promise<VisitWithDiagnoses[]> {
    const doctorId = this.doctorId()
    const [visits, diagnoses] = await Promise.all([
      this.repos.visits.findAll(doctorId, { filters: { patientId }, sort: [{ field: 'visitDateTime', direction: 'desc' }] }),
      this.repos.diagnoses.findAll(doctorId, { filters: { patientId } }),
    ])
    return visits.map((v) => ({ ...v, diagnoses: diagnoses.filter((d) => d.visitId === v.visitId) }))
  }

  async get(visitId: string): Promise<VisitWithDiagnoses> {
    const doctorId = this.doctorId()
    const visit = await this.repos.visits.findById(doctorId, visitId)
    if (!visit || visit.deletedAt) throw new NotFoundError('Visit')
    const diagnoses = await this.repos.diagnoses.findAll(doctorId, {
      filters: { visitId },
      sort: [{ field: 'createdAt', direction: 'asc' }],
    })
    return { ...visit, diagnoses }
  }

  async vitalsHistory(patientId: string): Promise<VitalsPoint[]> {
    const visits = await this.repos.visits.findAll(this.doctorId(), {
      filters: { patientId },
      sort: [{ field: 'visitDateTime', direction: 'asc' }],
    })
    return visits.map((v) => ({
      visitId: v.visitId,
      date: v.visitDateTime,
      bpSystolic: v.bpSystolic,
      bpDiastolic: v.bpDiastolic,
      heartRate: v.heartRate,
      temperatureF: v.temperatureF,
      spo2: v.spo2,
      weightKg: v.weightKg,
      bmi: v.bmi,
    }))
  }

  private toVisitFields(data: VisitInput) {
    const weightKg = toNumberOrNull(data.weightKg)
    const heightCm = toNumberOrNull(data.heightCm)
    return {
      patientId: data.patientId,
      visitDateTime: combineDateTime(data.visitDate, data.visitTime),
      visitType: data.visitType,
      chiefComplaint: data.chiefComplaint,
      symptoms: data.symptoms,
      bpSystolic: toNumberOrNull(data.bpSystolic),
      bpDiastolic: toNumberOrNull(data.bpDiastolic),
      heartRate: toNumberOrNull(data.heartRate),
      temperatureF: toNumberOrNull(data.temperatureF),
      respiratoryRate: toNumberOrNull(data.respiratoryRate),
      spo2: toNumberOrNull(data.spo2),
      weightKg,
      heightCm,
      bmi: calculateBmi(weightKg, heightCm),
      observations: data.observations,
      diagnosisSummary: data.diagnoses.map((d) => d.name).join(', '),
      treatmentPlan: data.treatmentPlan,
      notes: data.notes,
      followUpDate: emptyToNull(data.followUpDate),
    }
  }

  private buildDiagnosis(d: DiagnosisInput, visit: Pick<Visit, 'visitId' | 'patientId'>, now: string): Diagnosis {
    return {
      diagnosisId: newId('diagnosis'),
      patientId: visit.patientId,
      doctorId: this.doctorId(),
      visitId: visit.visitId,
      name: d.name,
      icd10Code: d.icd10Code,
      description: d.description,
      symptoms: d.symptoms,
      diagnosisDate: d.diagnosisDate,
      severity: d.severity,
      status: d.status,
      treatmentNotes: d.treatmentNotes,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
  }

  async create(input: VisitInput): Promise<Visit> {
    const data = this.validate(visitSchema, input)
    const doctorId = this.doctorId()
    const patient = await this.repos.patients.findById(doctorId, data.patientId)
    if (!patient || patient.deletedAt) throw new NotFoundError('Patient')

    const now = nowIso()
    const visit: Visit = {
      visitId: newId('visit'),
      doctorId,
      ...this.toVisitFields(data),
      appointmentId: emptyToNull(data.appointmentId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await this.repos.visits.insert(doctorId, visit)
    for (const d of data.diagnoses) {
      const dx = this.buildDiagnosis(d, visit, now)
      await this.repos.diagnoses.insert(doctorId, dx)
      await this.audit('Diagnosis', dx.diagnosisId, 'create', `visit ${visit.visitId}`)
    }
    await this.audit('Visit', visit.visitId, 'create', `patient ${visit.patientId}`)

    if (visit.followUpDate) {
      await this.followUps.createForVisit(visit, visit.followUpDate)
    }
    if (visit.appointmentId) {
      await this.appointments.markCompletedFromVisit(visit.appointmentId)
    }
    this.changed('visits', 'diagnoses', 'followups')
    return visit
  }

  async update(visitId: string, input: VisitInput): Promise<Visit> {
    const data = this.validate(visitSchema, input)
    const doctorId = this.doctorId()
    const before = await this.get(visitId)
    if (data.patientId !== before.patientId) {
      // Moving a visit between patients would corrupt two histories at once.
      data.patientId = before.patientId
    }
    const now = nowIso()
    const fields = this.toVisitFields(data)
    const updated = await this.repos.visits.update(doctorId, visitId, { ...fields, updatedAt: now })

    // Sync diagnoses: update kept ones, add new ones, soft-delete removed ones.
    const keepIds = new Set(data.diagnoses.map((d) => d.diagnosisId).filter(Boolean) as string[])
    for (const existing of before.diagnoses) {
      if (!keepIds.has(existing.diagnosisId)) {
        await this.repos.diagnoses.update(doctorId, existing.diagnosisId, { deletedAt: now, updatedAt: now })
        await this.audit('Diagnosis', existing.diagnosisId, 'archive', `removed from visit ${visitId}`)
      }
    }
    for (const d of data.diagnoses) {
      if (d.diagnosisId && before.diagnoses.some((x) => x.diagnosisId === d.diagnosisId)) {
        const { diagnosisId, ...rest } = d
        await this.repos.diagnoses.update(doctorId, diagnosisId, { ...rest, updatedAt: now })
      } else {
        const dx = this.buildDiagnosis(d, updated, now)
        await this.repos.diagnoses.insert(doctorId, dx)
        await this.audit('Diagnosis', dx.diagnosisId, 'create', `visit ${visitId}`)
      }
    }

    await this.followUps.syncForVisit(updated, before.followUpDate)
    await this.audit('Visit', visitId, 'update', changedFields(before as Visit, fields).join(', '))
    this.changed('visits', 'diagnoses', 'followups')
    return updated
  }

  async archive(visitId: string): Promise<void> {
    const doctorId = this.doctorId()
    const visit = await this.get(visitId)
    const now = nowIso()
    await this.repos.visits.update(doctorId, visitId, { deletedAt: now, updatedAt: now })
    for (const d of visit.diagnoses) await this.repos.diagnoses.update(doctorId, d.diagnosisId, { deletedAt: now, updatedAt: now })
    await this.audit('Visit', visitId, 'archive')
    this.changed('visits', 'diagnoses')
  }

  /** Default form values for editing (strings, as the form expects). */
  toFormValues(v: VisitWithDiagnoses): VisitInput {
    const { date, time } = splitDateTime(v.visitDateTime)
    const s = (n: number | null) => (n == null ? '' : String(n))
    return {
      patientId: v.patientId,
      visitDate: date,
      visitTime: time,
      visitType: v.visitType,
      chiefComplaint: v.chiefComplaint,
      symptoms: v.symptoms,
      bpSystolic: s(v.bpSystolic),
      bpDiastolic: s(v.bpDiastolic),
      heartRate: s(v.heartRate),
      temperatureF: s(v.temperatureF),
      respiratoryRate: s(v.respiratoryRate),
      spo2: s(v.spo2),
      weightKg: s(v.weightKg),
      heightCm: s(v.heightCm),
      observations: v.observations,
      treatmentPlan: v.treatmentPlan,
      notes: v.notes,
      followUpDate: v.followUpDate ?? '',
      appointmentId: v.appointmentId ?? '',
      diagnoses: v.diagnoses.map((d) => ({
        diagnosisId: d.diagnosisId,
        name: d.name,
        icd10Code: d.icd10Code,
        description: d.description,
        symptoms: d.symptoms,
        diagnosisDate: d.diagnosisDate,
        severity: d.severity,
        status: d.status,
        treatmentNotes: d.treatmentNotes,
      })),
    }
  }

  /** Most recent visit for a patient, used to prefill height on new visits. */
  async latestForPatient(patientId: string): Promise<Visit | null> {
    const page = await this.repos.visits.list(this.doctorId(), {
      filters: { patientId },
      sort: [{ field: 'visitDateTime', direction: 'desc' }],
      page: 1,
      pageSize: 1,
    })
    return page.items[0] ?? null
  }
}
