/**
 * Deterministic synthetic demo data. All people, clinics and brands are fictional.
 * Dates are generated relative to "today" so the dashboard always has today's
 * appointments, upcoming and overdue follow-ups, and recent activity.
 */
import type {
  Appointment,
  AppointmentStatus,
  AppointmentType,
  Diagnosis,
  Doctor,
  FollowUp,
  Gender,
  MedicalDocument,
  Medicine,
  Patient,
  Prescription,
  PrescriptionMedicine,
  StoredFile,
  Visit,
  VisitType,
} from '@/domain/types'
import type { RepositoryRegistry } from '@/data/repositories/interfaces'
import { calculateBmi } from '@/utils/clinical'
import { addDaysIso, combineDateTime, formatAge, nowIso, toIsoDate } from '@/utils/dates'
import { seededId } from '@/utils/id'
import {
  ADULT_CONDITIONS,
  ADULT_MEDICINES,
  ADULT_NAMES,
  ALLERGIES,
  CHILD_NAMES,
  FAMILY,
  PEDIATRIC_CONDITIONS,
  PEDIATRIC_MEDICINES,
  STREETS,
  SURGERIES,
  type SeedCondition,
} from './catalogs'
import { makeTinyPdf } from './tinyPdf'

export type PracticeKind = 'adult' | 'pediatric'

export interface DemoDoctorProfile {
  doctorId: string
  fullName: string
  email: string
  specialization: string
  qualifications: string
  registrationNumber: string
  clinicName: string
  clinicAddress: string
  contactNumber: string
  experienceYears: number
  kind: PracticeKind
  patientCount: number
}

/** The two demo workspaces available when Clerk is not configured. */
export const DEMO_DOCTORS: DemoDoctorProfile[] = [
  {
    doctorId: 'demo_dr_ananya_mehra',
    fullName: 'Dr. Ananya Mehra',
    email: 'ananya.mehra@example.com',
    specialization: 'General Physician',
    qualifications: 'MBBS, MD (Internal Medicine)',
    registrationNumber: 'KMC-2011-48213',
    clinicName: 'Neem Tree Family Clinic',
    clinicAddress: 'Plot 21, Lakeview Avenue, Bengaluru 560034',
    contactNumber: '+91 80 4012 7788',
    experienceYears: 14,
    kind: 'adult',
    patientCount: 12,
  },
  {
    doctorId: 'demo_dr_rahul_verma',
    fullName: 'Dr. Rahul Verma',
    email: 'rahul.verma@example.com',
    specialization: 'Paediatrician',
    qualifications: 'MBBS, DCH, MD (Paediatrics)',
    registrationNumber: 'MMC-2014-22960',
    clinicName: 'Little Steps Child Clinic',
    clinicAddress: 'Plot 8, Ridge Street, Pune 411007',
    contactNumber: '+91 20 2671 4455',
    experienceYears: 11,
    kind: 'pediatric',
    patientCount: 8,
  },
]

export interface SeedBundle {
  doctor: Doctor
  medicines: Medicine[]
  patients: Patient[]
  visits: Visit[]
  diagnoses: Diagnosis[]
  prescriptions: Prescription[]
  prescriptionMedicines: PrescriptionMedicine[]
  appointments: Appointment[]
  followUps: FollowUp[]
  documents: MedicalDocument[]
  files: StoredFile[]
}

function hashString(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const SLOTS = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30', '18:00']

function plusMinutes(hhmm: string, mins: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const t = h * 60 + m + mins
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`
}

export function buildSeed(
  profile: Pick<DemoDoctorProfile, 'doctorId' | 'kind' | 'patientCount'> & Partial<DemoDoctorProfile>,
  today: Date = new Date(),
): SeedBundle {
  const rand = mulberry32(hashString(profile.doctorId))
  const int = (a: number, b: number) => a + Math.floor(rand() * (b - a + 1))
  const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length)]
  const chance = (p: number) => rand() < p
  const round1 = (n: number) => Math.round(n * 10) / 10
  const id = (kind: Parameters<typeof seededId>[0], len = 6) => seededId(kind, rand, len)

  const doctorId = profile.doctorId
  const todayIso = toIsoDate(today)
  const kids = profile.kind === 'pediatric'
  const catalog = kids ? PEDIATRIC_MEDICINES : ADULT_MEDICINES
  const conditions = kids ? PEDIATRIC_CONDITIONS : ADULT_CONDITIONS
  const names = kids ? CHILD_NAMES : ADULT_NAMES
  const city = (profile.clinicAddress ?? 'Bengaluru').split(',').pop()?.replace(/\d+/g, '').trim() || 'Bengaluru'
  const stamp = (dateIso: string, time = '09:00') => combineDateTime(dateIso, time)

  const doctor: Doctor = {
    doctorId,
    fullName: profile.fullName ?? 'Doctor',
    email: profile.email ?? '',
    avatarUrl: '',
    specialization: profile.specialization ?? '',
    qualifications: profile.qualifications ?? '',
    registrationNumber: profile.registrationNumber ?? '',
    clinicName: profile.clinicName ?? '',
    clinicAddress: profile.clinicAddress ?? '',
    contactNumber: profile.contactNumber ?? '',
    experienceYears: profile.experienceYears ?? null,
    signatureFileId: null,
    onboardingComplete: true,
    createdAt: stamp(addDaysIso(todayIso, -300)),
    updatedAt: stamp(addDaysIso(todayIso, -300)),
  }

  /* ---------- Medicine catalog ---------- */
  const medByKey = new Map<string, Medicine>()
  const medicines: Medicine[] = catalog.map((m) => {
    const created = stamp(addDaysIso(todayIso, -290))
    const med: Medicine = {
      medicineId: id('medicine'),
      doctorId,
      name: m.name,
      genericName: m.genericName,
      brandName: m.brandName,
      manufacturer: 'Demo Pharma Ltd (fictional)',
      composition: m.composition,
      strength: m.strength,
      dosageForm: m.dosageForm,
      route: m.route,
      category: m.category,
      description: m.description,
      status: 'Active',
      createdAt: created,
      updatedAt: created,
    }
    medByKey.set(m.key, med)
    return med
  })
  // One inactive entry shows the deactivate flow.
  medicines[medicines.length - 1] = { ...medicines[medicines.length - 1], status: 'Inactive' }
  const catalogByKey = new Map(catalog.map((m) => [m.key, m]))

  /* ---------- Scheduling helpers ---------- */
  const taken = new Map<string, Set<string>>()
  const takeSlot = (date: string): string => {
    const used = taken.get(date) ?? new Set<string>()
    taken.set(date, used)
    const free = SLOTS.filter((s) => !used.has(s))
    const slot = free.length ? pick(free) : SLOTS[0]
    used.add(slot)
    return slot
  }

  const patients: Patient[] = []
  const visits: Visit[] = []
  const diagnoses: Diagnosis[] = []
  const prescriptions: Prescription[] = []
  const prescriptionMedicines: PrescriptionMedicine[] = []
  const appointments: Appointment[] = []
  const followUps: FollowUp[] = []
  const documents: MedicalDocument[] = []
  const files: StoredFile[] = []

  const registrationOffsets = [2, 9, 16, 27, 41, 55, 70, 88, 104, 126, 149, 168, 190, 214].slice(0, profile.patientCount)
  // Shuffle so registration order is not alphabetical.
  for (let i = registrationOffsets.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[registrationOffsets[i], registrationOffsets[j]] = [registrationOffsets[j], registrationOffsets[i]]
  }

  const chronicPool = conditions.filter((c) => c.chronic)
  const acutePool = conditions.filter((c) => !c.chronic)
  const lastVisitByPatient: Array<{ patient: Patient; visit: Visit; condition: SeedCondition }> = []

  for (let i = 0; i < profile.patientCount; i++) {
    const [fullName, gender] = names[i % names.length] as readonly [string, Gender]
    const ageYears = kids ? int(1, 13) : int(22, 74)
    const dob = toIsoDate(new Date(today.getFullYear() - ageYears, int(0, 11), int(1, 28)))
    const regOffset = registrationOffsets[i] ?? int(5, 200)
    const registrationDate = addDaysIso(todayIso, -regOffset)
    const chronic = chronicPool.length > 0 && chance(kids ? 0.2 : 0.5) ? pick(chronicPool) : null
    const mobile = `+91 9${int(100000000, 999999999)}`
    const parentName = kids ? `${pick(['Priya', 'Rakesh', 'Sunita', 'Amit', 'Deepa', 'Manoj'])} ${fullName.split(' ')[1]}` : ''

    const patient: Patient = {
      patientId: id('patient'),
      doctorId,
      fullName,
      dob,
      gender,
      bloodGroup: pick(['A+', 'B+', 'O+', 'AB+', 'O+', 'B+', 'A-', 'O-'] as const),
      photoFileId: null,
      mobile,
      email: kids ? '' : `${fullName.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
      address: `${int(1, 220)}, ${pick(STREETS)}, ${city}`,
      emergencyContactName: kids ? parentName : `${pick(['Ravi', 'Sunita', 'Prakash', 'Asha', 'Nikhil', 'Geeta'])} ${fullName.split(' ')[1]}`,
      emergencyContactNumber: `+91 9${int(100000000, 999999999)}`,
      allergies: pick(ALLERGIES),
      existingConditions: chronic ? chronic.name : 'None',
      chronicDiseases: chronic ? chronic.name : 'None',
      previousSurgeries: kids ? 'None' : pick(SURGERIES),
      familyHistory: pick(FAMILY),
      currentMedications: chronic
        ? chronic.meds.map((k) => `${catalogByKey.get(k)?.name} ${catalogByKey.get(k)?.strength}`).join(', ')
        : 'None',
      medicalNotes: kids ? `Accompanied by parent (${parentName}). Immunisations up to date per card.` : '',
      registrationDate,
      status: 'Active',
      createdAt: stamp(registrationDate, '08:45'),
      updatedAt: stamp(registrationDate, '08:45'),
      deletedAt: null,
    }
    patients.push(patient)

    /* ---------- Visits ---------- */
    const visitDates: string[] = [registrationDate]
    const maxVisits = regOffset < 15 ? 1 : int(2, 4)
    while (visitDates.length < maxVisits) {
      const next = addDaysIso(visitDates[visitDates.length - 1], int(14, 45))
      if (next >= todayIso) break
      visitDates.push(next)
    }
    // Most patients have been seen recently, so follow-ups are a mix of upcoming and a few overdue.
    const lastSeen = visitDates[visitDates.length - 1]
    const daysSinceLast = Math.round((today.getTime() - new Date(lastSeen + 'T12:00:00').getTime()) / 86400000)
    if (daysSinceLast > 35 && chance(0.8)) visitDates.push(addDaysIso(todayIso, -int(1, 24)))

    const baseWeight = kids ? 2 * ageYears + 8 + int(-2, 2) : int(52, 88)
    const height = kids ? 6 * ageYears + 77 + int(-4, 4) : int(150, 182)
    let prevAcute: SeedCondition | null = null

    visitDates.forEach((vDate, vIdx) => {
      const isLast = vIdx === visitDates.length - 1
      const time = takeSlot(vDate)
      const acute: SeedCondition | null =
        chronic && !chance(0.35) ? null : prevAcute && vIdx > 0 && chance(0.4) ? prevAcute : pick(acutePool)
      const visitConditions = [chronic, acute].filter((c): c is SeedCondition => !!c)
      if (visitConditions.length === 0) visitConditions.push(pick(acutePool))
      const primary = visitConditions[visitConditions.length - 1]
      const visitType: VisitType = vIdx === 0 ? 'New Consultation' : chance(0.08) ? 'Emergency' : 'Follow-up'
      const fever = visitConditions.some((c) => /fever|infection|tonsil|otitis|nasopharyn|gastro/i.test(c.name))
      const hypertensive = visitConditions.some((c) => c.icd10 === 'I10')
      const asthma = visitConditions.some((c) => /asthma|wheez/i.test(c.name))

      const weight = round1(baseWeight + vIdx * (kids ? 0.4 : rand() * 1.4 - 0.7))
      const showBp = !kids || ageYears >= 6
      const sys = showBp ? (kids ? int(95, 112) : hypertensive ? int(150, 166) - vIdx * int(4, 8) : int(112, 134)) : null
      const dia = showBp && sys ? (kids ? int(58, 72) : hypertensive ? int(92, 100) - vIdx * int(2, 4) : int(72, 86)) : null
      const fuDays = isLast ? int(4, 24) : null

      const visit: Visit = {
        visitId: id('visit'),
        patientId: patient.patientId,
        doctorId,
        visitDateTime: stamp(vDate, time),
        visitType,
        chiefComplaint: vIdx > 0 && primary === chronic ? `Review of ${primary.name.toLowerCase()}` : primary.complaint,
        symptoms: primary.symptoms,
        bpSystolic: sys,
        bpDiastolic: dia,
        heartRate: kids ? int(86, 118) : int(64, 94),
        temperatureF: fever ? round1(100 + rand() * 2.4) : round1(97.6 + rand() * 1.2),
        respiratoryRate: kids ? int(20, 30) : int(14, 19),
        spo2: asthma ? int(93, 97) : int(96, 99),
        weightKg: weight,
        heightCm: height,
        bmi: calculateBmi(weight, height),
        observations: fever ? 'Febrile, throat congested, chest clear.' : asthma ? 'Mild expiratory wheeze bilaterally.' : 'General condition stable. Systemic examination unremarkable.',
        diagnosisSummary: visitConditions.map((c) => c.name).join(', '),
        treatmentPlan: visitConditions.map((c) => c.plan).join(' '),
        notes: vIdx > 0 ? 'Reviewed previous prescription; adherence good.' : '',
        followUpDate: isLast ? addDaysIso(vDate, fuDays ?? 14) : visitDates[vIdx + 1],
        appointmentId: null,
        createdAt: stamp(vDate, time),
        updatedAt: stamp(vDate, time),
        deletedAt: null,
      }

      // Completed appointment the visit came from.
      const appt: Appointment = {
        appointmentId: id('appointment'),
        patientId: patient.patientId,
        doctorId,
        date: vDate,
        startTime: time,
        endTime: plusMinutes(time, 20),
        type: vIdx === 0 ? 'Consultation' : visitType === 'Emergency' ? 'Emergency' : 'Follow-up',
        reason: visit.chiefComplaint,
        status: 'Completed',
        notes: '',
        followUpId: null,
        createdAt: stamp(addDaysIso(vDate, -int(0, 3)), '08:00'),
        updatedAt: stamp(vDate, time),
        deletedAt: null,
      }
      visit.appointmentId = appt.appointmentId
      appointments.push(appt)
      visits.push(visit)

      for (const c of visitConditions) {
        diagnoses.push({
          diagnosisId: id('diagnosis'),
          patientId: patient.patientId,
          doctorId,
          visitId: visit.visitId,
          name: c.name,
          icd10Code: c.icd10,
          description: c.chronic ? 'Long-term condition under follow-up.' : 'Acute episode.',
          symptoms: c.symptoms,
          diagnosisDate: vDate,
          severity: c.severity,
          status: c.chronic ? 'Chronic' : isLast && vIdx === visitDates.length - 1 && regOffset < 30 ? 'Active' : c.status,
          treatmentNotes: c.plan,
          createdAt: visit.createdAt,
          updatedAt: visit.createdAt,
          deletedAt: null,
        })
      }

      // Follow-up record from this visit. Earlier ones were honoured by the next visit.
      if (visit.followUpDate) {
        followUps.push({
          followUpId: id('followUp'),
          patientId: patient.patientId,
          doctorId,
          visitId: visit.visitId,
          dueDate: visit.followUpDate,
          reason: `Review: ${visit.diagnosisSummary}`,
          status: isLast ? 'Pending' : 'Completed',
          appointmentId: null,
          notes: '',
          createdAt: visit.createdAt,
          updatedAt: visit.createdAt,
        })
      }

      // Prescription for most visits.
      if (chance(0.9)) {
        const keys = [...new Set(visitConditions.flatMap((c) => c.meds))].slice(0, 4)
        const rxId = id('prescription')
        const issuedAt = stamp(vDate, plusMinutes(time, 15))
        const header: Prescription = {
          prescriptionId: rxId,
          rxNumber: id('rxNumber'),
          version: 1,
          status: 'Issued',
          supersededById: null,
          patientId: patient.patientId,
          doctorId,
          visitId: visit.visitId,
          prescriptionDate: vDate,
          diagnosis: visit.diagnosisSummary,
          instructions: visitConditions.map((c) => c.instructions).join(' '),
          followUpDate: visit.followUpDate,
          editReason: '',
          issuedAt,
          snapshot: {
            patientName: patient.fullName,
            patientAge: formatAge(patient.dob),
            patientGender: patient.gender,
            patientMobile: patient.mobile,
            patientAllergies: patient.allergies,
            doctorName: doctor.fullName,
            qualifications: doctor.qualifications,
            specialization: doctor.specialization,
            registrationNumber: doctor.registrationNumber,
            clinicName: doctor.clinicName,
            clinicAddress: doctor.clinicAddress,
            contactNumber: doctor.contactNumber,
          },
          createdAt: issuedAt,
          updatedAt: issuedAt,
        }
        prescriptions.push(header)
        keys.forEach((k, idx) => {
          const cat = catalogByKey.get(k)
          const med = medByKey.get(k)
          if (!cat || !med) return
          prescriptionMedicines.push({
            id: id('prescriptionMedicine', 8),
            prescriptionId: rxId,
            doctorId,
            medicineId: med.medicineId,
            medicineName: cat.name,
            genericName: cat.genericName,
            strength: cat.strength,
            dosage: cat.rx.dosage,
            dosageForm: cat.dosageForm,
            frequency: cat.rx.frequency,
            route: cat.route,
            duration: cat.rx.duration,
            quantity: cat.rx.quantity,
            timing: cat.rx.timing,
            instructions: cat.rx.instructions ?? '',
            sortOrder: idx,
          })
        })
      }

      prevAcute = acute
      if (isLast) lastVisitByPatient.push({ patient, visit, condition: primary })
    })
  }

  /* ---------- Revised prescriptions (versioning demo) ---------- */
  const revisable = prescriptions.filter((p) => prescriptionMedicines.some((m) => m.prescriptionId === p.prescriptionId)).slice(-4)
  for (const prev of revisable.slice(0, 2)) {
    const newId = id('prescription')
    const issuedAt = new Date(new Date(prev.issuedAt).getTime() + 2 * 3600_000).toISOString()
    prescriptions.push({
      ...prev,
      prescriptionId: newId,
      version: 2,
      status: 'Issued',
      supersededById: null,
      editReason: 'Duration extended after reviewing lab results',
      issuedAt,
      createdAt: issuedAt,
      updatedAt: issuedAt,
    })
    prev.status = 'Superseded'
    prev.supersededById = newId
    prev.updatedAt = issuedAt
    for (const line of prescriptionMedicines.filter((m) => m.prescriptionId === prev.prescriptionId)) {
      prescriptionMedicines.push({
        ...line,
        id: id('prescriptionMedicine', 8),
        prescriptionId: newId,
        duration: line.duration.replace(/(\d+)/, (n) => String(Number(n) * 2)),
      })
    }
  }

  /* ---------- Today and upcoming schedule ---------- */
  const order = [...patients].sort(() => rand() - 0.5)
  const addAppt = (patient: Patient, date: string, type: AppointmentType, status: AppointmentStatus, reason: string, followUpId: string | null = null) => {
    const start = takeSlot(date)
    const a: Appointment = {
      appointmentId: id('appointment'),
      patientId: patient.patientId,
      doctorId,
      date,
      startTime: start,
      endTime: plusMinutes(start, type === 'Procedure' ? 30 : 20),
      type,
      reason,
      status,
      notes: '',
      followUpId,
      createdAt: stamp(addDaysIso(todayIso, -int(1, 6)), '10:00'),
      updatedAt: stamp(addDaysIso(todayIso, -int(0, 1)), '10:00'),
      deletedAt: null,
    }
    appointments.push(a)
    return a
  }

  const bookedToday = new Set<string>()
  // Link a few pending follow-ups that fall in the coming two weeks to booked appointments.
  const upcomingFu = followUps.filter((f) => f.status === 'Pending' && f.dueDate >= todayIso && f.dueDate <= addDaysIso(todayIso, 14))
  for (const f of upcomingFu.slice(0, 2)) {
    const patient = patients.find((p) => p.patientId === f.patientId)!
    const a = addAppt(patient, f.dueDate, 'Follow-up', 'Scheduled', f.reason, f.followUpId)
    f.status = 'Scheduled'
    f.appointmentId = a.appointmentId
    if (f.dueDate === todayIso) bookedToday.add(f.patientId)
  }

  const todayCount = kids ? 4 : 5
  const todayStatuses: AppointmentStatus[] = ['Confirmed', 'Confirmed', 'Scheduled', 'Scheduled', 'Cancelled']
  order.filter((p) => !bookedToday.has(p.patientId)).slice(0, todayCount).forEach((p, i) => {
    const reasons = kids ? ['Growth check', 'Cough and cold', 'Vaccination review', 'Fever'] : ['BP review', 'Lab report review', 'Persistent cough', 'Knee pain', 'Annual check-up']
    addAppt(p, todayIso, i === 1 ? 'Test Review' : i === 0 ? 'Follow-up' : 'Consultation', todayStatuses[i], reasons[i % reasons.length])
  })

  order.slice(todayCount, todayCount + 6).forEach((p, i) => {
    const date = addDaysIso(todayIso, int(1, 13))
    addAppt(p, date, pick(['Consultation', 'Test Review', 'Follow-up', 'Teleconsult'] as const), i % 3 === 0 ? 'Confirmed' : 'Scheduled', kids ? pick(['Well-baby visit', 'Rash review', 'Cough']) : pick(['Sugar review', 'Thyroid report', 'Back pain review', 'General check-up']))
  })

  order.slice(0, 2).forEach((p, i) => {
    const date = addDaysIso(todayIso, -int(2, 12))
    addAppt(p, date, 'Consultation', i === 0 ? 'No Show' : 'Cancelled', 'General check-up')
  })

  /* ---------- Documents (synthetic one-page PDFs) ---------- */
  const docSpecs = kids
    ? [
        { type: 'Blood Test Report' as const, name: 'Complete blood count', lines: ['Haemoglobin: 10.4 g/dL (low)', 'WBC: 8,200 /uL', 'Platelets: 2.9 lakh /uL'] },
        { type: 'X-Ray Report' as const, name: 'Chest X-ray PA view', lines: ['Lung fields clear.', 'No consolidation.', 'Cardiac silhouette normal.'] },
      ]
    : [
        { type: 'Blood Test Report' as const, name: 'HbA1c and lipid profile', lines: ['HbA1c: 7.4 %', 'Total cholesterol: 212 mg/dL', 'LDL: 138 mg/dL', 'HDL: 42 mg/dL'] },
        { type: 'Blood Test Report' as const, name: 'Thyroid function test', lines: ['TSH: 6.8 mIU/L (high)', 'Free T4: 0.9 ng/dL'] },
        { type: 'ECG' as const, name: 'Resting 12-lead ECG', lines: ['Sinus rhythm, rate 78/min.', 'No ST-T changes.'] },
      ]
  docSpecs.forEach((spec, i) => {
    const { patient, visit } = lastVisitByPatient[i % lastVisitByPatient.length]
    const date = visit.visitDateTime.slice(0, 10)
    const bytes = makeTinyPdf(`${spec.name} (synthetic sample)`, [
      `Patient: ${patient.fullName}   ID: ${patient.patientId}`,
      `Date: ${date}`,
      '',
      ...spec.lines,
      '',
      'This report is fictional demo data generated by ClinicDesk.',
    ])
    const fileId = id('file', 10)
    const blob = new Blob([bytes as BlobPart], { type: 'application/pdf' })
    files.push({
      fileId,
      doctorId,
      fileName: `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: bytes.byteLength,
      blob,
      createdAt: visit.createdAt,
    })
    documents.push({
      documentId: id('document'),
      patientId: patient.patientId,
      doctorId,
      visitId: visit.visitId,
      name: spec.name,
      type: spec.type,
      description: 'Synthetic sample report',
      uploadDate: date,
      fileId,
      fileName: `${spec.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
      mimeType: 'application/pdf',
      sizeBytes: bytes.byteLength,
      createdAt: visit.createdAt,
      updatedAt: visit.createdAt,
      deletedAt: null,
    })
  })

  return { doctor, medicines, patients, visits, diagnoses, prescriptions, prescriptionMedicines, appointments, followUps, documents, files }
}

/** Writes a bundle into a doctor's workspace (replacing anything already there). */
export async function applySeed(repos: RepositoryRegistry, bundle: SeedBundle, opts: { keepProfile?: boolean } = {}): Promise<void> {
  const doctorId = bundle.doctor.doctorId
  await clearWorkspace(repos, doctorId, { keepProfile: opts.keepProfile })
  if (!opts.keepProfile) await repos.doctors.upsert(bundle.doctor)
  await repos.medicines.bulkUpsert(doctorId, bundle.medicines)
  await repos.patients.bulkUpsert(doctorId, bundle.patients)
  await repos.visits.bulkUpsert(doctorId, bundle.visits)
  await repos.diagnoses.bulkUpsert(doctorId, bundle.diagnoses)
  await repos.prescriptions.bulkUpsert(doctorId, bundle.prescriptions)
  await repos.prescriptionMedicines.bulkUpsert(doctorId, bundle.prescriptionMedicines)
  await repos.appointments.bulkUpsert(doctorId, bundle.appointments)
  await repos.followUps.bulkUpsert(doctorId, bundle.followUps)
  for (const f of bundle.files) await repos.files.put(f)
  await repos.documents.bulkUpsert(doctorId, bundle.documents)
  await repos.audit.append({
    auditId: `AUD-SEED-${Date.now().toString(36).toUpperCase()}`,
    doctorId,
    entity: 'Workspace',
    entityId: doctorId,
    action: 'import',
    detail: 'Synthetic sample data loaded',
    at: nowIso(),
  })
}

export async function clearWorkspace(repos: RepositoryRegistry, doctorId: string, opts: { keepProfile?: boolean } = {}): Promise<void> {
  await Promise.all([
    repos.patients.removeAllForDoctor(doctorId),
    repos.visits.removeAllForDoctor(doctorId),
    repos.diagnoses.removeAllForDoctor(doctorId),
    repos.prescriptions.removeAllForDoctor(doctorId),
    repos.prescriptionMedicines.removeAllForDoctor(doctorId),
    repos.medicines.removeAllForDoctor(doctorId),
    repos.appointments.removeAllForDoctor(doctorId),
    repos.followUps.removeAllForDoctor(doctorId),
    repos.documents.removeAllForDoctor(doctorId),
    repos.files.removeAllForDoctor(doctorId),
    repos.audit.removeAllForDoctor(doctorId),
  ])
  if (!opts.keepProfile) await repos.doctors.remove(doctorId)
}

export const SEED_VERSION = 1

/** Seeds the two demo workspaces once per browser (or after a reset). */
export async function ensureDemoData(repos: RepositoryRegistry): Promise<void> {
  const seeded = await repos.meta.get<number>('demoSeedVersion')
  if (seeded === SEED_VERSION) return
  for (const profile of DEMO_DOCTORS) await applySeed(repos, buildSeed(profile))
  await repos.meta.set('demoSeedVersion', SEED_VERSION)
  await repos.meta.set('demoSeededAt', nowIso())
}
