import { differenceInCalendarDays, eachDayOfInterval, eachMonthOfInterval, eachWeekOfInterval, format, subMonths } from 'date-fns'
import type {
  Appointment,
  AppointmentView,
  Diagnosis,
  FollowUpView,
  MedicalDocument,
  Patient,
  Prescription,
  PrescriptionMedicine,
  Visit,
} from '@/domain/types'
import { addDaysIso, ageFromDob, daysFromToday, parseDate, toIsoDate, todayIso } from '@/utils/dates'
import { BaseService } from './context'
import { NotFoundError } from './errors'

export interface CountPoint {
  label: string
  count: number
}

export interface DashboardData {
  cards: {
    totalPatients: number
    newPatientsThisMonth: number
    todaysAppointments: number
    totalVisits: number
    visitsThisMonth: number
    pendingFollowUps: number
    overdueFollowUps: number
    prescriptionsIssued: number
    prescriptionsThisMonth: number
  }
  registrationTrend: CountPoint[]
  visitsByMonth: Array<{ label: string; 'New Consultation': number; 'Follow-up': number; Emergency: number }>
  topDiagnoses: CountPoint[]
  appointmentStats: CountPoint[]
  todaysAppointments: AppointmentView[]
  upcomingAppointments: AppointmentView[]
  recentPatients: Array<Patient & { age: number }>
  followUpsDue: FollowUpView[]
  recentPrescriptions: Array<Prescription & { itemCount: number }>
}

export interface ReportRange {
  from: string
  to: string
}

export interface ReportData {
  range: ReportRange
  totals: {
    registeredPatients: number
    newPatients: number
    visits: number
    prescriptions: number
    pendingFollowUps: number
    overdueFollowUps: number
    upcomingAppointments: number
    uniquePatientsSeen: number
  }
  newPatientsByMonth: CountPoint[]
  visitsOverTime: CountPoint[]
  visitsBucket: 'day' | 'week' | 'month'
  visitTypes: CountPoint[]
  topDiagnoses: CountPoint[]
  appointmentStatus: CountPoint[]
  upcomingAppointments: AppointmentView[]
  pendingFollowUps: FollowUpView[]
  visitRows: Array<Visit & { patientName: string }>
  prescriptionRows: Array<Prescription & { itemCount: number }>
  newPatientRows: Patient[]
}

export interface PatientReportData {
  patient: Patient & { age: number }
  visits: Array<Visit & { diagnoses: Diagnosis[] }>
  diagnoses: Diagnosis[]
  prescriptions: Array<Prescription & { items: PrescriptionMedicine[] }>
  appointments: Appointment[]
  followUps: FollowUpView[]
  documents: MedicalDocument[]
}

export type TimelineKind = 'registered' | 'visit' | 'diagnosis' | 'prescription' | 'appointment' | 'followup' | 'document'

export interface TimelineEvent {
  id: string
  at: string
  kind: TimelineKind
  title: string
  detail: string
  link?: string
}

const OPEN_FU = ['Pending', 'Scheduled']

function countBy<T>(rows: T[], key: (r: T) => string): CountPoint[] {
  const map = new Map<string, number>()
  for (const r of rows) {
    const k = key(r)
    if (k) map.set(k, (map.get(k) ?? 0) + 1)
  }
  return [...map.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
}

function inRange(iso: string, range: ReportRange): boolean {
  const d = iso.slice(0, 10)
  return d >= range.from && d <= range.to
}

/** Visit timestamps are UTC ISO; compare on the local calendar day. */
function localDay(isoTimestamp: string): string {
  const d = parseDate(isoTimestamp)
  return d ? toIsoDate(d) : isoTimestamp.slice(0, 10)
}

export class AnalyticsService extends BaseService {
  private async load() {
    const doctorId = this.doctorId()
    const [patients, allPatients, visits, diagnoses, prescriptions, appointments, followUps] = await Promise.all([
      this.repos.patients.findAll(doctorId),
      this.repos.patients.findAll(doctorId, { includeDeleted: true }),
      this.repos.visits.findAll(doctorId),
      this.repos.diagnoses.findAll(doctorId),
      this.repos.prescriptions.findAll(doctorId, { filters: { status: { ne: 'Superseded' } } }),
      this.repos.appointments.findAll(doctorId),
      this.repos.followUps.findAll(doctorId),
    ])
    const names = new Map(allPatients.map((p) => [p.patientId, p]))
    const activeIds = new Set(patients.map((p) => p.patientId))
    return { patients, names, activeIds, visits, diagnoses, prescriptions, appointments, followUps }
  }

  private followUpViews(
    followUps: Awaited<ReturnType<AnalyticsService['load']>>['followUps'],
    names: Map<string, Patient>,
    activeIds: Set<string>,
  ): FollowUpView[] {
    const today = todayIso()
    return followUps
      .filter((f) => OPEN_FU.includes(f.status) && activeIds.has(f.patientId))
      .map((f) => ({
        ...f,
        patientName: names.get(f.patientId)?.fullName ?? 'Unknown patient',
        isOverdue: f.status === 'Pending' && f.dueDate < today,
        daysFromToday: daysFromToday(f.dueDate),
      }))
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  }

  private appointmentViews(rows: Appointment[], names: Map<string, Patient>): AppointmentView[] {
    return rows.map((a) => ({
      ...a,
      patientName: names.get(a.patientId)?.fullName ?? 'Unknown patient',
      patientMobile: names.get(a.patientId)?.mobile ?? '',
    }))
  }

  async dashboard(): Promise<DashboardData> {
    const { patients, names, activeIds, visits, diagnoses, prescriptions, appointments, followUps } = await this.load()
    const today = todayIso()
    const month = today.slice(0, 7)
    const now = new Date()
    const months = eachMonthOfInterval({ start: subMonths(now, 5), end: now })

    const fuViews = this.followUpViews(followUps, names, activeIds)
    const live = appointments.filter((a) => !a.deletedAt)
    const todays = live
      .filter((a) => a.date === today && a.status !== 'Cancelled')
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    const upcoming = live
      .filter((a) => a.date > today && (a.status === 'Scheduled' || a.status === 'Confirmed'))
      .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
      .slice(0, 6)

    const windowStart = addDaysIso(today, -30)
    const windowEnd = addDaysIso(today, 30)

    const rxCounts = new Map<string, number>()
    const recentRx = [...prescriptions].sort((a, b) => b.issuedAt.localeCompare(a.issuedAt)).slice(0, 5)
    if (recentRx.length) {
      const lines = await this.repos.prescriptionMedicines.findAll(this.doctorId(), {
        filters: { prescriptionId: { in: recentRx.map((r) => r.prescriptionId) } },
      })
      for (const l of lines) rxCounts.set(l.prescriptionId, (rxCounts.get(l.prescriptionId) ?? 0) + 1)
    }

    return {
      cards: {
        totalPatients: patients.length,
        newPatientsThisMonth: patients.filter((p) => p.registrationDate.startsWith(month)).length,
        todaysAppointments: todays.filter((a) => a.status !== 'No Show').length,
        totalVisits: visits.length,
        visitsThisMonth: visits.filter((v) => localDay(v.visitDateTime).startsWith(month)).length,
        pendingFollowUps: fuViews.length,
        overdueFollowUps: fuViews.filter((f) => f.isOverdue).length,
        prescriptionsIssued: prescriptions.filter((p) => p.status === 'Issued').length,
        prescriptionsThisMonth: prescriptions.filter((p) => p.prescriptionDate.startsWith(month)).length,
      },
      registrationTrend: months.map((m) => {
        const key = format(m, 'yyyy-MM')
        return { label: format(m, 'MMM'), count: patients.filter((p) => p.registrationDate.startsWith(key)).length }
      }),
      visitsByMonth: months.map((m) => {
        const key = format(m, 'yyyy-MM')
        const mv = visits.filter((v) => localDay(v.visitDateTime).startsWith(key))
        return {
          label: format(m, 'MMM'),
          'New Consultation': mv.filter((v) => v.visitType === 'New Consultation').length,
          'Follow-up': mv.filter((v) => v.visitType === 'Follow-up').length,
          Emergency: mv.filter((v) => v.visitType === 'Emergency').length,
        }
      }),
      topDiagnoses: countBy(diagnoses, (d) => d.name).slice(0, 6),
      appointmentStats: ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show'].map((s) => ({
        label: s,
        count: live.filter((a) => a.status === s && a.date >= windowStart && a.date <= windowEnd).length,
      })),
      todaysAppointments: this.appointmentViews(todays, names),
      upcomingAppointments: this.appointmentViews(upcoming, names),
      recentPatients: [...patients]
        .sort((a, b) => (b.registrationDate + b.createdAt).localeCompare(a.registrationDate + a.createdAt))
        .slice(0, 5)
        .map((p) => ({ ...p, age: ageFromDob(p.dob) })),
      followUpsDue: [...fuViews.filter((f) => f.isOverdue), ...fuViews.filter((f) => !f.isOverdue)].slice(0, 6),
      recentPrescriptions: recentRx.map((r) => ({ ...r, itemCount: rxCounts.get(r.prescriptionId) ?? 0 })),
    }
  }

  async report(range: ReportRange): Promise<ReportData> {
    const { patients, names, activeIds, visits, diagnoses, prescriptions, appointments, followUps } = await this.load()
    const today = todayIso()
    const rangeVisits = visits.filter((v) => inRange(localDay(v.visitDateTime), range))
    const rangeRx = prescriptions.filter((p) => inRange(p.prescriptionDate, range))
    const newPatients = patients.filter((p) => inRange(p.registrationDate, range))
    const rangeDx = diagnoses.filter((d) => inRange(d.diagnosisDate, range))
    const rangeAppts = appointments.filter((a) => !a.deletedAt && inRange(a.date, range))
    const fuViews = this.followUpViews(followUps, names, activeIds)

    const start = parseDate(range.from) ?? new Date()
    const end = parseDate(range.to) ?? new Date()
    const spanDays = Math.max(0, differenceInCalendarDays(end, start))
    const bucket: ReportData['visitsBucket'] = spanDays <= 31 ? 'day' : spanDays <= 120 ? 'week' : 'month'
    let visitsOverTime: CountPoint[]
    if (bucket === 'day') {
      visitsOverTime = eachDayOfInterval({ start, end }).map((d) => {
        const key = toIsoDate(d)
        return { label: format(d, 'd MMM'), count: rangeVisits.filter((v) => localDay(v.visitDateTime) === key).length }
      })
    } else if (bucket === 'week') {
      visitsOverTime = eachWeekOfInterval({ start, end }, { weekStartsOn: 1 }).map((w) => {
        const wEnd = toIsoDate(new Date(w.getTime() + 6 * 86400000))
        const wStart = toIsoDate(w)
        return {
          label: format(w, 'd MMM'),
          count: rangeVisits.filter((v) => {
            const d = localDay(v.visitDateTime)
            return d >= wStart && d <= wEnd
          }).length,
        }
      })
    } else {
      visitsOverTime = eachMonthOfInterval({ start, end }).map((m) => {
        const key = format(m, 'yyyy-MM')
        return { label: format(m, 'MMM yy'), count: rangeVisits.filter((v) => localDay(v.visitDateTime).startsWith(key)).length }
      })
    }

    const months = eachMonthOfInterval({ start, end })
    return {
      range,
      totals: {
        registeredPatients: patients.filter((p) => p.registrationDate <= range.to).length,
        newPatients: newPatients.length,
        visits: rangeVisits.length,
        prescriptions: rangeRx.length,
        pendingFollowUps: fuViews.length,
        overdueFollowUps: fuViews.filter((f) => f.isOverdue).length,
        upcomingAppointments: appointments.filter(
          (a) => !a.deletedAt && a.date >= today && (a.status === 'Scheduled' || a.status === 'Confirmed'),
        ).length,
        uniquePatientsSeen: new Set(rangeVisits.map((v) => v.patientId)).size,
      },
      newPatientsByMonth: months.map((m) => {
        const key = format(m, 'yyyy-MM')
        return { label: format(m, 'MMM yy'), count: newPatients.filter((p) => p.registrationDate.startsWith(key)).length }
      }),
      visitsOverTime,
      visitsBucket: bucket,
      visitTypes: countBy(rangeVisits, (v) => v.visitType),
      topDiagnoses: countBy(rangeDx, (d) => d.name).slice(0, 10),
      appointmentStatus: countBy(rangeAppts, (a) => a.status),
      upcomingAppointments: this.appointmentViews(
        appointments
          .filter((a) => !a.deletedAt && a.date >= today && (a.status === 'Scheduled' || a.status === 'Confirmed'))
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
          .slice(0, 25),
        names,
      ),
      pendingFollowUps: fuViews.slice(0, 50),
      visitRows: rangeVisits
        .sort((a, b) => b.visitDateTime.localeCompare(a.visitDateTime))
        .map((v) => ({ ...v, patientName: names.get(v.patientId)?.fullName ?? 'Unknown patient' })),
      prescriptionRows: rangeRx.sort((a, b) => b.prescriptionDate.localeCompare(a.prescriptionDate)).map((r) => ({ ...r, itemCount: 0 })),
      newPatientRows: newPatients.sort((a, b) => b.registrationDate.localeCompare(a.registrationDate)),
    }
  }

  async patientReport(patientId: string): Promise<PatientReportData> {
    const doctorId = this.doctorId()
    const patient = await this.repos.patients.findById(doctorId, patientId)
    if (!patient) throw new NotFoundError('Patient')
    const q = { filters: { patientId } }
    const [visits, diagnoses, prescriptions, appointments, followUps, documents] = await Promise.all([
      this.repos.visits.findAll(doctorId, { ...q, sort: [{ field: 'visitDateTime', direction: 'desc' }] }),
      this.repos.diagnoses.findAll(doctorId, { ...q, sort: [{ field: 'diagnosisDate', direction: 'desc' }] }),
      this.repos.prescriptions.findAll(doctorId, {
        filters: { patientId, status: { ne: 'Superseded' } },
        sort: [{ field: 'prescriptionDate', direction: 'desc' }],
      }),
      this.repos.appointments.findAll(doctorId, { ...q, sort: [{ field: 'date', direction: 'desc' }] }),
      this.repos.followUps.findAll(doctorId, { ...q, sort: [{ field: 'dueDate', direction: 'desc' }] }),
      this.repos.documents.findAll(doctorId, { ...q, sort: [{ field: 'uploadDate', direction: 'desc' }] }),
    ])
    const items = prescriptions.length
      ? await this.repos.prescriptionMedicines.findAll(doctorId, {
          filters: { prescriptionId: { in: prescriptions.map((p) => p.prescriptionId) } },
          sort: [{ field: 'sortOrder', direction: 'asc' }],
        })
      : []
    const today = todayIso()
    return {
      patient: { ...patient, age: ageFromDob(patient.dob) },
      visits: visits.map((v) => ({ ...v, diagnoses: diagnoses.filter((d) => d.visitId === v.visitId) })),
      diagnoses,
      prescriptions: prescriptions.map((p) => ({ ...p, items: items.filter((i) => i.prescriptionId === p.prescriptionId) })),
      appointments,
      followUps: followUps.map((f) => ({
        ...f,
        patientName: patient.fullName,
        isOverdue: f.status === 'Pending' && f.dueDate < today,
        daysFromToday: daysFromToday(f.dueDate),
      })),
      documents,
    }
  }

  /** A single chronological story of the patient's care, newest first. */
  async timeline(patientId: string): Promise<TimelineEvent[]> {
    const r = await this.patientReport(patientId)
    const events: TimelineEvent[] = [
      {
        id: `reg-${r.patient.patientId}`,
        at: r.patient.registrationDate + 'T00:00:00',
        kind: 'registered',
        title: 'Registered as a patient',
        detail: r.patient.patientId,
      },
    ]
    for (const v of r.visits) {
      events.push({
        id: v.visitId,
        at: v.visitDateTime,
        kind: 'visit',
        title: `${v.visitType}: ${v.chiefComplaint}`,
        detail: v.diagnoses.length ? v.diagnoses.map((d) => d.name).join(', ') : 'No diagnosis recorded',
        link: `/visits/${v.visitId}`,
      })
    }
    for (const p of r.prescriptions) {
      events.push({
        id: p.prescriptionId,
        at: p.issuedAt,
        kind: 'prescription',
        title: `Prescription ${p.rxNumber}${p.version > 1 ? ` (v${p.version})` : ''}${p.status === 'Cancelled' ? ', cancelled' : ''}`,
        detail: p.items.map((i) => `${i.medicineName}${i.strength ? ' ' + i.strength : ''}`).join(', '),
        link: `/prescriptions/${p.prescriptionId}`,
      })
    }
    for (const a of r.appointments.filter((a) => !a.deletedAt)) {
      events.push({
        id: a.appointmentId,
        at: `${a.date}T${a.startTime}:00`,
        kind: 'appointment',
        title: `${a.type} appointment, ${a.status.toLowerCase()}`,
        detail: a.reason || 'No reason given',
      })
    }
    for (const f of r.followUps) {
      events.push({
        id: f.followUpId,
        at: `${f.dueDate}T09:00:00`,
        kind: 'followup',
        title: `Follow-up due${f.isOverdue ? ', overdue' : ''} (${f.status.toLowerCase()})`,
        detail: f.reason,
      })
    }
    for (const d of r.documents.filter((d) => !d.deletedAt)) {
      events.push({ id: d.documentId, at: d.uploadDate + 'T12:00:00', kind: 'document', title: `${d.type} added`, detail: d.name })
    }
    return events.sort((a, b) => b.at.localeCompare(a.at))
  }

  /** Header bell: what needs attention now. */
  async notifications(): Promise<Array<{ id: string; tone: 'danger' | 'info'; title: string; detail: string; link: string }>> {
    const { names, activeIds, appointments, followUps } = await this.load()
    const today = todayIso()
    const out: Array<{ id: string; tone: 'danger' | 'info'; title: string; detail: string; link: string }> = []
    const overdue = this.followUpViews(followUps, names, activeIds).filter((f) => f.isOverdue)
    for (const f of overdue.slice(0, 5)) {
      out.push({
        id: f.followUpId,
        tone: 'danger',
        title: `Follow-up overdue: ${f.patientName}`,
        detail: `Was due ${-f.daysFromToday} day${f.daysFromToday === -1 ? '' : 's'} ago`,
        link: '/follow-ups?bucket=overdue',
      })
    }
    const nowHm = format(new Date(), 'HH:mm')
    const next = appointments
      .filter((a) => !a.deletedAt && a.date === today && (a.status === 'Scheduled' || a.status === 'Confirmed') && a.startTime >= nowHm)
      .sort((a, b) => a.startTime.localeCompare(b.startTime))
    for (const a of next.slice(0, 4)) {
      out.push({
        id: a.appointmentId,
        tone: 'info',
        title: `${names.get(a.patientId)?.fullName ?? 'Patient'} at ${a.startTime}`,
        detail: `${a.type}${a.reason ? `: ${a.reason}` : ''}`,
        link: '/appointments',
      })
    }
    return out
  }
}

