import type { Appointment, AppointmentStatus, AppointmentView } from '@/domain/types'
import type { Filters, Page } from '@/data/repositories/interfaces'
import { appointmentSchema, type AppointmentInput } from '@/validations/schemas'
import { formatTime, nowIso, timeToMinutes, todayIso } from '@/utils/dates'
import { newId } from '@/utils/id'
import { BaseService, emptyToNull, type ServiceDeps } from './context'
import { ConflictError, NotFoundError } from './errors'
import type { FollowUpService } from './followUpService'

/** Appointments in these states don't occupy the calendar. */
const NON_BLOCKING: AppointmentStatus[] = ['Cancelled', 'No Show']

export interface AppointmentListParams {
  from?: string
  to?: string
  status?: AppointmentStatus | ''
  patientId?: string
  search?: string
  page?: number
  pageSize?: number
  order?: 'asc' | 'desc'
}

export class AppointmentService extends BaseService {
  private readonly followUps: FollowUpService

  constructor(deps: ServiceDeps, followUps: FollowUpService) {
    super(deps)
    this.followUps = followUps
  }

  private async withPatients(rows: Appointment[]): Promise<AppointmentView[]> {
    const patients = await this.repos.patients.findAll(this.doctorId(), { includeDeleted: true })
    const map = new Map(patients.map((p) => [p.patientId, p]))
    return rows.map((a) => ({
      ...a,
      patientName: map.get(a.patientId)?.fullName ?? 'Unknown patient',
      patientMobile: map.get(a.patientId)?.mobile ?? '',
    }))
  }

  async list(params: AppointmentListParams = {}): Promise<Page<AppointmentView>> {
    const filters: Filters<Appointment> = {}
    if (params.from || params.to) {
      filters.date = { ...(params.from ? { gte: params.from } : {}), ...(params.to ? { lte: params.to } : {}) }
    }
    if (params.status) filters.status = params.status
    if (params.patientId) filters.patientId = params.patientId
    const dir = params.order ?? 'asc'
    const rows = await this.repos.appointments.findAll(this.doctorId(), {
      filters,
      sort: [
        { field: 'date', direction: dir },
        { field: 'startTime', direction: dir },
      ],
    })
    let views = await this.withPatients(rows)
    const term = params.search?.trim().toLowerCase()
    if (term) {
      views = views.filter(
        (a) =>
          a.patientName.toLowerCase().includes(term) ||
          a.reason.toLowerCase().includes(term) ||
          a.appointmentId.toLowerCase().includes(term) ||
          a.patientMobile.includes(term),
      )
    }
    if (!params.page || !params.pageSize) {
      return { items: views, total: views.length, page: 1, pageSize: views.length || 1, totalPages: 1 }
    }
    const total = views.length
    const totalPages = Math.max(1, Math.ceil(total / params.pageSize))
    const page = Math.min(Math.max(1, params.page), totalPages)
    return { items: views.slice((page - 1) * params.pageSize, page * params.pageSize), total, page, pageSize: params.pageSize, totalPages }
  }

  async range(from: string, to: string): Promise<AppointmentView[]> {
    return (await this.list({ from, to })).items
  }

  async upcoming(limit = 6): Promise<AppointmentView[]> {
    const today = todayIso()
    const now = new Date()
    const nowHm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    const items = (await this.list({ from: today })).items.filter(
      (a) => !NON_BLOCKING.includes(a.status) && a.status !== 'Completed' && (a.date > today || a.endTime >= nowHm),
    )
    return items.slice(0, limit)
  }

  async get(appointmentId: string): Promise<AppointmentView> {
    const a = await this.repos.appointments.findById(this.doctorId(), appointmentId)
    if (!a || a.deletedAt) throw new NotFoundError('Appointment')
    return (await this.withPatients([a]))[0]
  }

  /** Same doctor, same day, intersecting time ranges, and still on the calendar. */
  async findConflicts(date: string, startTime: string, endTime: string, excludeId?: string): Promise<AppointmentView[]> {
    const sameDay = await this.repos.appointments.findAll(this.doctorId(), {
      filters: { date, status: { in: ['Scheduled', 'Confirmed', 'Completed'] } },
    })
    const s = timeToMinutes(startTime)
    const e = timeToMinutes(endTime)
    const clashes = sameDay.filter(
      (a) => a.appointmentId !== excludeId && timeToMinutes(a.startTime) < e && s < timeToMinutes(a.endTime),
    )
    return this.withPatients(clashes)
  }

  private async assertNoOverlap(data: AppointmentInput, excludeId?: string): Promise<void> {
    if (NON_BLOCKING.includes(data.status)) return
    const clashes = await this.findConflicts(data.date, data.startTime, data.endTime, excludeId)
    if (clashes.length) {
      const c = clashes[0]
      throw new ConflictError(
        `This overlaps with ${c.patientName}'s appointment (${formatTime(c.startTime)}–${formatTime(c.endTime)}). Choose another time.`,
      )
    }
  }

  async create(input: AppointmentInput): Promise<Appointment> {
    const data = this.validate(appointmentSchema, input)
    const doctorId = this.doctorId()
    const patient = await this.repos.patients.findById(doctorId, data.patientId)
    if (!patient || patient.deletedAt) throw new NotFoundError('Patient')
    await this.assertNoOverlap(data)
    const now = nowIso()
    const appt: Appointment = {
      appointmentId: newId('appointment'),
      doctorId,
      patientId: data.patientId,
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      type: data.type,
      reason: data.reason,
      status: data.status,
      notes: data.notes,
      followUpId: emptyToNull(data.followUpId),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    }
    await this.repos.appointments.insert(doctorId, appt)
    await this.audit('Appointment', appt.appointmentId, 'create')
    if (appt.followUpId) await this.followUps.setStatus(appt.followUpId, 'Scheduled', appt.appointmentId)
    this.changed('appointments')
    return appt
  }

  async update(appointmentId: string, input: AppointmentInput): Promise<Appointment> {
    const data = this.validate(appointmentSchema, input)
    const before = await this.get(appointmentId)
    await this.assertNoOverlap(data, appointmentId)
    const updated = await this.repos.appointments.update(this.doctorId(), appointmentId, {
      date: data.date,
      startTime: data.startTime,
      endTime: data.endTime,
      type: data.type,
      reason: data.reason,
      status: data.status,
      notes: data.notes,
      updatedAt: nowIso(),
    })
    const rescheduled = before.date !== data.date || before.startTime !== data.startTime
    await this.audit('Appointment', appointmentId, 'update', rescheduled ? 'rescheduled' : 'details')
    await this.afterStatusChange(updated, before.status)
    this.changed('appointments')
    return updated
  }

  async reschedule(appointmentId: string, date: string, startTime: string, endTime: string): Promise<Appointment> {
    const a = await this.get(appointmentId)
    const status = a.status === 'Cancelled' || a.status === 'No Show' ? 'Scheduled' : a.status
    return this.update(appointmentId, { ...toInput(a), date, startTime, endTime, status })
  }

  async setStatus(appointmentId: string, status: AppointmentStatus): Promise<void> {
    const a = await this.get(appointmentId)
    if (!NON_BLOCKING.includes(status) && NON_BLOCKING.includes(a.status)) {
      await this.assertNoOverlap({ ...toInput(a), status }, appointmentId)
    }
    const updated = await this.repos.appointments.update(this.doctorId(), appointmentId, { status, updatedAt: nowIso() })
    await this.audit('Appointment', appointmentId, status === 'Cancelled' ? 'cancel' : 'update', `status → ${status}`)
    await this.afterStatusChange(updated, a.status)
    this.changed('appointments')
  }

  /** Recording a visit against an appointment completes it. */
  async markCompletedFromVisit(appointmentId: string): Promise<void> {
    const a = await this.repos.appointments.findById(this.doctorId(), appointmentId)
    if (!a || a.deletedAt || a.status === 'Completed') return
    await this.setStatus(appointmentId, 'Completed')
  }

  private async afterStatusChange(a: Appointment, previous: AppointmentStatus): Promise<void> {
    if (!a.followUpId || a.status === previous) return
    if (a.status === 'Completed') await this.followUps.setStatus(a.followUpId, 'Completed')
    else if (NON_BLOCKING.includes(a.status)) await this.followUps.setStatus(a.followUpId, 'Pending', null)
  }

  /** DELETE semantics: soft delete, so the schedule history survives. */
  async archive(appointmentId: string): Promise<void> {
    const a = await this.get(appointmentId)
    await this.repos.appointments.update(this.doctorId(), appointmentId, { deletedAt: nowIso(), updatedAt: nowIso() })
    if (a.followUpId && a.status !== 'Completed') await this.followUps.setStatus(a.followUpId, 'Pending', null)
    await this.audit('Appointment', appointmentId, 'archive')
    this.changed('appointments')
  }

  async todayCount(): Promise<number> {
    return this.repos.appointments.count(this.doctorId(), {
      filters: { date: todayIso(), status: { in: ['Scheduled', 'Confirmed', 'Completed'] } },
    })
  }
}

export function toInput(a: Appointment): AppointmentInput {
  return {
    patientId: a.patientId,
    date: a.date,
    startTime: a.startTime,
    endTime: a.endTime,
    type: a.type,
    reason: a.reason,
    status: a.status,
    notes: a.notes,
    followUpId: a.followUpId ?? '',
  }
}
