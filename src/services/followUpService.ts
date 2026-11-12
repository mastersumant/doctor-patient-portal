import type { FollowUp, FollowUpStatus, FollowUpView, Visit } from '@/domain/types'
import type { Page } from '@/data/repositories/interfaces'
import { followUpSchema, type FollowUpInput } from '@/validations/schemas'
import { addDaysIso, daysFromToday, nowIso, todayIso } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, emptyToNull } from './context'
import { NotFoundError } from './errors'

export type FollowUpBucket = 'overdue' | 'upcoming' | 'open' | 'completed' | 'all'

export interface FollowUpListParams {
  bucket?: FollowUpBucket
  search?: string
  patientId?: string
  page?: number
  pageSize?: number
}

const OPEN: FollowUpStatus[] = ['Pending', 'Scheduled']

export class FollowUpService extends BaseService {
  async list(params: FollowUpListParams = {}): Promise<Page<FollowUpView>> {
    const doctorId = this.doctorId()
    const today = todayIso()
    const [rows, patients] = await Promise.all([
      this.repos.followUps.findAll(doctorId, {
        filters: params.patientId ? { patientId: params.patientId } : undefined,
        sort: [{ field: 'dueDate', direction: 'asc' }],
      }),
      this.repos.patients.findAll(doctorId, { includeDeleted: true }),
    ])
    const patientMap = new Map(patients.map((p) => [p.patientId, p]))
    let views: FollowUpView[] = rows
      // Hide follow-ups for archived patients from working lists.
      .filter((f) => params.bucket === 'all' || params.patientId || !patientMap.get(f.patientId)?.deletedAt)
      .map((f) => ({
        ...f,
        patientName: patientMap.get(f.patientId)?.fullName ?? 'Unknown patient',
        isOverdue: f.status === 'Pending' && f.dueDate < today,
        daysFromToday: daysFromToday(f.dueDate),
      }))

    switch (params.bucket ?? 'open') {
      case 'overdue':
        views = views.filter((f) => f.isOverdue)
        break
      case 'upcoming':
        views = views.filter((f) => OPEN.includes(f.status) && f.dueDate >= today)
        break
      case 'open':
        views = views.filter((f) => OPEN.includes(f.status))
        break
      case 'completed':
        views = views.filter((f) => f.status === 'Completed' || f.status === 'Cancelled').reverse()
        break
      case 'all':
        break
    }
    const term = params.search?.trim().toLowerCase()
    if (term) {
      views = views.filter(
        (f) => f.patientName.toLowerCase().includes(term) || f.reason.toLowerCase().includes(term) || f.patientId.toLowerCase().includes(term),
      )
    }
    const pageSize = params.pageSize ?? 10
    const total = views.length
    const totalPages = Math.max(1, Math.ceil(total / pageSize))
    const page = Math.min(Math.max(1, params.page ?? 1), totalPages)
    return { items: views.slice((page - 1) * pageSize, page * pageSize), total, page, pageSize, totalPages }
  }

  async counts(): Promise<{ overdue: number; dueThisWeek: number; open: number }> {
    const doctorId = this.doctorId()
    const today = todayIso()
    const weekEnd = addDaysIso(today, 7)
    const [rows, patients] = await Promise.all([
      this.repos.followUps.findAll(doctorId, { filters: { status: { in: OPEN } } }),
      this.repos.patients.findAll(doctorId),
    ])
    const active = new Set(patients.map((p) => p.patientId))
    const open = rows.filter((f) => active.has(f.patientId))
    return {
      overdue: open.filter((f) => f.status === 'Pending' && f.dueDate < today).length,
      dueThisWeek: open.filter((f) => f.dueDate >= today && f.dueDate <= weekEnd).length,
      open: open.length,
    }
  }

  async get(followUpId: string): Promise<FollowUp> {
    const f = await this.repos.followUps.findById(this.doctorId(), followUpId)
    if (!f) throw new NotFoundError('Follow-up')
    return f
  }

  async create(input: FollowUpInput): Promise<FollowUp> {
    const data = this.validate(followUpSchema, input)
    const doctorId = this.doctorId()
    const patient = await this.repos.patients.findById(doctorId, data.patientId)
    if (!patient || patient.deletedAt) throw new NotFoundError('Patient')
    const now = nowIso()
    const f: FollowUp = {
      followUpId: newId('followUp'),
      doctorId,
      patientId: data.patientId,
      visitId: emptyToNull(data.visitId),
      dueDate: data.dueDate,
      reason: data.reason,
      status: data.status,
      appointmentId: null,
      notes: data.notes,
      createdAt: now,
      updatedAt: now,
    }
    await this.repos.followUps.insert(doctorId, f)
    await this.audit('FollowUp', f.followUpId, 'create')
    this.changed('followups')
    return f
  }

  async update(followUpId: string, input: FollowUpInput): Promise<FollowUp> {
    const data = this.validate(followUpSchema, input)
    await this.get(followUpId)
    const updated = await this.repos.followUps.update(this.doctorId(), followUpId, {
      dueDate: data.dueDate,
      reason: data.reason,
      status: data.status,
      notes: data.notes,
      updatedAt: nowIso(),
    })
    await this.audit('FollowUp', followUpId, 'update')
    this.changed('followups')
    return updated
  }

  async setStatus(followUpId: string, status: FollowUpStatus, appointmentId?: string | null): Promise<void> {
    await this.get(followUpId)
    const patch: Partial<FollowUp> = { status, updatedAt: nowIso() }
    if (appointmentId !== undefined) patch.appointmentId = appointmentId
    await this.repos.followUps.update(this.doctorId(), followUpId, patch)
    await this.audit('FollowUp', followUpId, 'update', `status → ${status}`)
    this.changed('followups')
  }

  /** Called by VisitService when a visit records a recommended follow-up date. */
  async createForVisit(visit: Visit, dueDate: string): Promise<FollowUp> {
    const now = nowIso()
    const f: FollowUp = {
      followUpId: newId('followUp'),
      doctorId: this.doctorId(),
      patientId: visit.patientId,
      visitId: visit.visitId,
      dueDate,
      reason: visit.diagnosisSummary ? `Review: ${visit.diagnosisSummary}` : `Review: ${visit.chiefComplaint}`,
      status: 'Pending',
      appointmentId: null,
      notes: '',
      createdAt: now,
      updatedAt: now,
    }
    await this.repos.followUps.insert(this.doctorId(), f)
    await this.audit('FollowUp', f.followUpId, 'create', `from visit ${visit.visitId}`)
    return f
  }

  /** Keeps the visit's follow-up in step when its recommended date is edited. */
  async syncForVisit(visit: Visit, previousDate: string | null): Promise<void> {
    if (visit.followUpDate === previousDate) return
    const doctorId = this.doctorId()
    const existing = (await this.repos.followUps.findAll(doctorId, { filters: { visitId: visit.visitId } })).find((f) =>
      OPEN.includes(f.status),
    )
    if (existing && visit.followUpDate) {
      await this.repos.followUps.update(doctorId, existing.followUpId, { dueDate: visit.followUpDate, updatedAt: nowIso() })
    } else if (existing && !visit.followUpDate) {
      await this.repos.followUps.update(doctorId, existing.followUpId, { status: 'Cancelled', updatedAt: nowIso() })
    } else if (!existing && visit.followUpDate) {
      await this.createForVisit(visit, visit.followUpDate)
    }
  }
}
