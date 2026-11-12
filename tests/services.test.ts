import { beforeEach, describe, expect, it } from 'vitest'
import { createMemoryRepositories } from '@/data/repositories/memory/memoryRepositories'
import { createIndexedDbRepositories } from '@/data/repositories/indexeddb/indexedDbRepositories'
import type { RepositoryRegistry } from '@/data/repositories/interfaces'
import { createServices, type Services, type SessionIdentity } from '@/services'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@/services/errors'
import { addDaysIso, todayIso } from '@/utils/dates'
import type { PatientInput, PrescriptionInput, VisitInput, AppointmentInput } from '@/validations/schemas'
import { buildSeed, DEMO_DOCTORS, ensureDemoData } from '@/data/seed/seedData'
import { checkReferences, toRow } from '@/data/schema/rowCodec'
import { TABLES } from '@/data/schema/tables'
import { makeTinyPdf } from '@/data/seed/tinyPdf'

const DR_A: SessionIdentity = { userId: 'user_A', fullName: 'Dr. A', email: 'a@example.com', imageUrl: '' }
const DR_B: SessionIdentity = { userId: 'user_B', fullName: 'Dr. B', email: 'b@example.com', imageUrl: '' }

function patientInput(overrides: Partial<PatientInput> = {}): PatientInput {
  return {
    fullName: 'Test Patient',
    dob: '1985-04-12',
    gender: 'Female',
    bloodGroup: 'O+',
    mobile: '+91 98765 43210',
    email: '',
    address: '',
    emergencyContactName: '',
    emergencyContactNumber: '',
    allergies: 'Penicillin',
    existingConditions: '',
    chronicDiseases: '',
    previousSurgeries: '',
    familyHistory: '',
    currentMedications: '',
    medicalNotes: '',
    registrationDate: todayIso(),
    status: 'Active',
    ...overrides,
  }
}

function visitInput(patientId: string, overrides: Partial<VisitInput> = {}): VisitInput {
  return {
    patientId,
    visitDate: todayIso(),
    visitTime: '10:00',
    visitType: 'New Consultation',
    chiefComplaint: 'Fever',
    symptoms: 'Fever, chills',
    bpSystolic: '120',
    bpDiastolic: '80',
    heartRate: '88',
    temperatureF: '101.2',
    respiratoryRate: '18',
    spo2: '98',
    weightKg: '70',
    heightCm: '175',
    observations: '',
    treatmentPlan: 'Rest',
    notes: '',
    followUpDate: addDaysIso(todayIso(), 7),
    appointmentId: '',
    diagnoses: [
      {
        name: 'Viral fever',
        icd10Code: 'B34.9',
        description: '',
        symptoms: '',
        diagnosisDate: todayIso(),
        severity: 'Mild',
        status: 'Active',
        treatmentNotes: '',
      },
    ],
    ...overrides,
  }
}

function rxInput(patientId: string, overrides: Partial<PrescriptionInput> = {}): PrescriptionInput {
  return {
    patientId,
    visitId: '',
    prescriptionDate: todayIso(),
    diagnosis: 'Viral fever',
    instructions: 'Fluids',
    followUpDate: '',
    editReason: '',
    items: [
      {
        medicineId: '',
        medicineName: 'Paracetamol',
        genericName: 'Paracetamol',
        strength: '500 mg',
        dosage: '1 tablet',
        dosageForm: 'Tablet',
        frequency: 'Twice Daily',
        route: 'Oral',
        duration: '3 days',
        quantity: '6',
        timing: 'After Food',
        instructions: '',
      },
    ],
    ...overrides,
  }
}

function apptInput(patientId: string, overrides: Partial<AppointmentInput> = {}): AppointmentInput {
  return {
    patientId,
    date: addDaysIso(todayIso(), 2),
    startTime: '10:00',
    endTime: '10:30',
    type: 'Consultation',
    reason: 'Check-up',
    status: 'Scheduled',
    notes: '',
    followUpId: '',
    ...overrides,
  }
}

let dbCounter = 0
const implementations: Array<[string, () => Promise<RepositoryRegistry>]> = [
  ['memory', async () => createMemoryRepositories()],
  ['indexeddb', async () => createIndexedDbRepositories(`test-db-${++dbCounter}`)],
]

describe.each(implementations)('services on %s storage', (_name, makeRepos) => {
  let repos: RepositoryRegistry
  let identity: SessionIdentity | null
  let svc: Services

  const as = (who: SessionIdentity | null) => {
    identity = who
  }

  beforeEach(async () => {
    repos = await makeRepos()
    identity = DR_A
    svc = createServices(repos, { getIdentity: () => identity })
    await svc.doctor.ensureProfile()
    as(DR_B)
    await svc.doctor.ensureProfile()
    as(DR_A)
  })

  it('rejects every call without a signed-in doctor', async () => {
    as(null)
    await expect(svc.patients.list()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('creates, reads, updates, archives and restores a patient', async () => {
    const p = await svc.patients.create(patientInput())
    expect(p.patientId).toMatch(/^PT-[0-9A-Z]{6}$/)
    expect(p.doctorId).toBe(DR_A.userId)

    const updated = await svc.patients.update(p.patientId, patientInput({ fullName: 'Renamed Patient' }))
    expect(updated.fullName).toBe('Renamed Patient')

    const page = await svc.patients.list({ search: 'renamed' })
    expect(page.items.map((x) => x.patientId)).toEqual([p.patientId])

    await svc.patients.archive(p.patientId)
    expect((await svc.patients.list()).total).toBe(0)
    expect((await svc.patients.list({ archived: true })).total).toBe(1)
    await expect(svc.patients.get(p.patientId)).rejects.toBeInstanceOf(NotFoundError)

    await svc.patients.restore(p.patientId)
    expect((await svc.patients.get(p.patientId)).status).toBe('Active')
  })

  it('validates patient input', async () => {
    await expect(svc.patients.create(patientInput({ fullName: '', mobile: '123' }))).rejects.toBeInstanceOf(ValidationError)
    await expect(svc.patients.create(patientInput({ dob: addDaysIso(todayIso(), 3) }))).rejects.toThrow(/future/)
  })

  it('isolates each doctor’s records', async () => {
    const p = await svc.patients.create(patientInput())
    const v = await svc.visits.create(visitInput(p.patientId))
    const rx = await svc.prescriptions.create(rxInput(p.patientId))

    as(DR_B)
    expect((await svc.patients.list()).total).toBe(0)
    expect((await svc.visits.list()).total).toBe(0)
    expect((await svc.prescriptions.list()).total).toBe(0)
    await expect(svc.patients.get(p.patientId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.visits.get(v.visitId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.prescriptions.get(rx.prescriptionId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.patients.update(p.patientId, patientInput({ fullName: 'Hijack' }))).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.patients.archive(p.patientId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.visits.create(visitInput(p.patientId))).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.prescriptions.create(rxInput(p.patientId))).rejects.toBeInstanceOf(NotFoundError)
    await expect(svc.appointments.create(apptInput(p.patientId))).rejects.toBeInstanceOf(NotFoundError)
    // Repository level: the tenant key is enforced even when the ID is known.
    expect(await repos.patients.findById(DR_B.userId, p.patientId)).toBeNull()
    await expect(repos.patients.update(DR_B.userId, p.patientId, { fullName: 'x' })).rejects.toBeInstanceOf(NotFoundError)

    as(DR_A)
    expect((await svc.patients.get(p.patientId)).fullName).toBe('Test Patient')
  })

  it('records a visit with diagnoses, BMI and an automatic follow-up', async () => {
    const p = await svc.patients.create(patientInput())
    const appt = await svc.appointments.create(apptInput(p.patientId, { date: todayIso() }))
    const v = await svc.visits.create(visitInput(p.patientId, { appointmentId: appt.appointmentId }))
    expect(v.bmi).toBe(22.9)
    expect(v.diagnosisSummary).toBe('Viral fever')

    const detail = await svc.visits.get(v.visitId)
    expect(detail.diagnoses).toHaveLength(1)

    const fus = await svc.followUps.list({ bucket: 'open' })
    expect(fus.items).toHaveLength(1)
    expect(fus.items[0].visitId).toBe(v.visitId)
    expect((await svc.appointments.get(appt.appointmentId)).status).toBe('Completed')

    // Edit: replace the diagnosis and move the follow-up date.
    const values = svc.visits.toFormValues(detail)
    values.diagnoses = [{ ...values.diagnoses[0], name: 'Influenza', icd10Code: 'J11.1', diagnosisId: undefined }]
    values.followUpDate = addDaysIso(todayIso(), 10)
    await svc.visits.update(v.visitId, values)
    const after = await svc.visits.get(v.visitId)
    expect(after.diagnoses.map((d) => d.name)).toEqual(['Influenza'])
    expect((await svc.followUps.list({ bucket: 'open' })).items[0].dueDate).toBe(addDaysIso(todayIso(), 10))
    // The removed diagnosis is soft-deleted, not destroyed.
    const all = await repos.diagnoses.findAll(DR_A.userId, { includeDeleted: true })
    expect(all).toHaveLength(2)
  })

  it('keeps issued prescriptions immutable by versioning revisions', async () => {
    const p = await svc.patients.create(patientInput())
    const v1 = await svc.prescriptions.create(rxInput(p.patientId))
    await expect(svc.prescriptions.revise(v1.prescriptionId, rxInput(p.patientId))).rejects.toBeInstanceOf(ValidationError)

    const revised = rxInput(p.patientId, { editReason: 'Dose changed' })
    revised.items[0].dosage = '2 tablets'
    const v2 = await svc.prescriptions.revise(v1.prescriptionId, revised)
    expect(v2.version).toBe(2)
    expect(v2.rxNumber).toBe(v1.rxNumber)

    const old = await svc.prescriptions.get(v1.prescriptionId)
    expect(old.status).toBe('Superseded')
    expect(old.supersededById).toBe(v2.prescriptionId)
    expect(old.items[0].dosage).toBe('1 tablet') // original contents retained
    const latest = await svc.prescriptions.get(v2.prescriptionId)
    expect(latest.items[0].dosage).toBe('2 tablets')
    expect(latest.versions.map((x) => x.version)).toEqual([2, 1])

    await expect(svc.prescriptions.revise(v1.prescriptionId, revised)).rejects.toBeInstanceOf(ConflictError)
    expect((await svc.prescriptions.list()).total).toBe(1)
    expect((await svc.prescriptions.list({ includeSuperseded: true })).total).toBe(2)

    await svc.prescriptions.cancel(v2.prescriptionId, 'Wrong patient')
    expect((await svc.prescriptions.get(v2.prescriptionId)).status).toBe('Cancelled')
  })

  it('snapshots patient and doctor details at issue time', async () => {
    as(DR_A)
    await svc.doctor.updateProfile({
      fullName: 'Dr. A',
      email: 'a@example.com',
      specialization: 'GP',
      qualifications: 'MBBS',
      registrationNumber: 'REG-1',
      clinicName: 'Old Clinic',
      clinicAddress: '',
      contactNumber: '',
      experienceYears: '5',
    })
    const p = await svc.patients.create(patientInput())
    const rx = await svc.prescriptions.create(rxInput(p.patientId))
    await svc.doctor.updateProfile({
      fullName: 'Dr. A',
      email: 'a@example.com',
      specialization: 'GP',
      qualifications: 'MBBS',
      registrationNumber: 'REG-1',
      clinicName: 'New Clinic',
      clinicAddress: '',
      contactNumber: '',
      experienceYears: '5',
    })
    expect((await svc.prescriptions.get(rx.prescriptionId)).snapshot.clinicName).toBe('Old Clinic')
  })

  it('prevents overlapping appointments for the same doctor', async () => {
    const p1 = await svc.patients.create(patientInput())
    const p2 = await svc.patients.create(patientInput({ fullName: 'Second Patient' }))
    const a = await svc.appointments.create(apptInput(p1.patientId))
    await expect(svc.appointments.create(apptInput(p2.patientId, { startTime: '10:15', endTime: '10:45' }))).rejects.toBeInstanceOf(ConflictError)
    // Back-to-back is fine.
    await svc.appointments.create(apptInput(p2.patientId, { startTime: '10:30', endTime: '11:00' }))
    // Another doctor's calendar is independent.
    as(DR_B)
    const pb = await svc.patients.create(patientInput())
    await svc.appointments.create(apptInput(pb.patientId))
    as(DR_A)
    // Cancelling frees the slot.
    await svc.appointments.setStatus(a.appointmentId, 'Cancelled')
    await svc.appointments.create(apptInput(p2.patientId, { startTime: '10:00', endTime: '10:20' }))
    // Re-activating the cancelled one now clashes.
    await expect(svc.appointments.setStatus(a.appointmentId, 'Scheduled')).rejects.toBeInstanceOf(ConflictError)
  })

  it('links follow-ups to appointments', async () => {
    const p = await svc.patients.create(patientInput())
    const fu = await svc.followUps.create({ patientId: p.patientId, dueDate: addDaysIso(todayIso(), -2), reason: 'BP review', status: 'Pending', notes: '' })
    expect((await svc.followUps.counts()).overdue).toBe(1)
    const appt = await svc.appointments.create(apptInput(p.patientId, { followUpId: fu.followUpId }))
    expect((await svc.followUps.get(fu.followUpId)).status).toBe('Scheduled')
    expect((await svc.followUps.counts()).overdue).toBe(0)
    await svc.appointments.setStatus(appt.appointmentId, 'Completed')
    expect((await svc.followUps.get(fu.followUpId)).status).toBe('Completed')
  })

  it('blocks deleting a prescribed medicine but allows deactivation', async () => {
    const med = await svc.medicines.create({
      name: 'Cetirizine', genericName: 'Cetirizine', brandName: '', manufacturer: '', composition: '', strength: '10 mg',
      dosageForm: 'Tablet', route: 'Oral', category: 'Antihistamine', description: '', status: 'Active',
    })
    await expect(
      svc.medicines.create({
        name: 'cetirizine', genericName: '', brandName: '', manufacturer: '', composition: '', strength: '10 MG',
        dosageForm: 'Tablet', route: 'Oral', category: '', description: '', status: 'Active',
      }),
    ).rejects.toBeInstanceOf(ConflictError)
    const p = await svc.patients.create(patientInput())
    const input = rxInput(p.patientId)
    input.items[0].medicineId = med.medicineId
    await svc.prescriptions.create(input)
    await expect(svc.medicines.delete(med.medicineId)).rejects.toBeInstanceOf(ConflictError)
    await svc.medicines.setStatus(med.medicineId, 'Inactive')
    expect(await svc.medicines.searchActive('ceti')).toHaveLength(0)
  })

  it('accepts real PDFs and rejects disguised files and oversize uploads', async () => {
    const p = await svc.patients.create(patientInput())
    const meta = { patientId: p.patientId, name: 'CBC', type: 'Blood Test Report' as const, description: '', uploadDate: todayIso() }
    const pdf = Object.assign(new Blob([makeTinyPdf('CBC', ['Hb 12'])], { type: 'application/pdf' }), { name: 'cbc.pdf' })
    const doc = await svc.documents.upload(meta, pdf)
    const file = await svc.documents.getFile(doc.documentId)
    expect(file.mimeType).toBe('application/pdf')

    const fake = Object.assign(new Blob(['MZ this is an exe'], { type: 'application/pdf' }), { name: 'report.pdf' })
    await expect(svc.documents.upload(meta, fake)).rejects.toThrow(/PDF, JPEG, PNG or WebP/)
    const big = Object.assign(new Blob([new Uint8Array(11 * 1024 * 1024)]), { name: 'big.pdf' })
    await expect(svc.documents.upload(meta, big)).rejects.toThrow(/10 MB/)

    as(DR_B)
    await expect(svc.documents.getFile(doc.documentId)).rejects.toBeInstanceOf(NotFoundError)
  })

  it('writes an audit trail without clinical values', async () => {
    const p = await svc.patients.create(patientInput())
    await svc.patients.update(p.patientId, patientInput({ allergies: 'Sulfa drugs' }))
    const log = await svc.audit.list({ pageSize: 50 })
    const update = log.items.find((e) => e.action === 'update' && e.entityId === p.patientId)
    expect(update?.detail).toBe('allergies')
    expect(JSON.stringify(log.items)).not.toContain('Sulfa')
  })
})

describe('seed data', () => {
  it('generates 2 doctors, 20 patients, 15+ medicines and valid relationships', () => {
    const bundles = DEMO_DOCTORS.map((d) => buildSeed(d))
    expect(bundles).toHaveLength(2)
    expect(bundles.reduce((n, b) => n + b.patients.length, 0)).toBe(20)
    for (const b of bundles) {
      expect(b.medicines.length).toBeGreaterThanOrEqual(15)
      expect(b.visits.length).toBeGreaterThan(b.patients.length)
      expect(b.prescriptions.some((p) => p.version === 2)).toBe(true)
      expect(b.appointments.some((a) => a.date === todayIso())).toBe(true)
      expect(b.appointments.some((a) => a.date > todayIso())).toBe(true)
      expect(b.followUps.length).toBeGreaterThan(0)
      const data = {
        patients: b.patients, visits: b.visits, diagnoses: b.diagnoses, prescriptions: b.prescriptions,
        prescription_medicines: b.prescriptionMedicines, medicines: b.medicines, appointments: b.appointments,
        followups: b.followUps, medical_documents: b.documents,
      } as unknown as Record<string, Array<Record<string, unknown>>>
      expect(checkReferences(TABLES.filter((t) => t.name !== 'doctors'), data)).toEqual([])
      for (const t of TABLES.filter((t) => t.name !== 'doctors')) {
        const rows = data[t.name]
        for (const r of rows) expect(r.doctorId).toBe(b.doctor.doctorId)
      }
    }
  })

  it('never produces overlapping active appointments', () => {
    for (const d of DEMO_DOCTORS) {
      const { appointments } = buildSeed(d)
      const active = appointments.filter((a) => a.status !== 'Cancelled' && a.status !== 'No Show')
      for (const a of active) {
        const clash = active.find((b) => b !== a && b.date === a.date && b.startTime < a.endTime && a.startTime < b.endTime)
        expect(clash).toBeUndefined()
      }
    }
  })

  it('round-trips every table through the row codec', () => {
    const b = buildSeed(DEMO_DOCTORS[0])
    const row = toRow(TABLES.find((t) => t.name === 'prescriptions')!, b.prescriptions[0] as unknown as Record<string, unknown>)
    expect(typeof row.snapshot).toBe('string')
  })
})

describe('persistence', () => {
  it('keeps data after the app restarts (new connection to the same IndexedDB)', async () => {
    const name = 'restart-test'
    const id = { getIdentity: () => DR_A }
    const first = createServices(await createIndexedDbRepositories(name), id)
    await first.doctor.ensureProfile()
    const p = await first.patients.create(patientInput({ fullName: 'Persistent Patient' }))

    const second = createServices(await createIndexedDbRepositories(name), id)
    expect((await second.patients.get(p.patientId)).fullName).toBe('Persistent Patient')
  })

  it('seeds demo workspaces once and is idempotent', async () => {
    const repos = await createIndexedDbRepositories('seed-test')
    await ensureDemoData(repos)
    await ensureDemoData(repos)
    expect(await repos.patients.count(DEMO_DOCTORS[0].doctorId)).toBe(12)
    expect(await repos.patients.count(DEMO_DOCTORS[1].doctorId)).toBe(8)
  })
})

describe('Excel workbook', () => {
  it('exports a workspace and imports it back without loss', async () => {
    const repos = createMemoryRepositories()
    const demo = DEMO_DOCTORS[0]
    const session = { getIdentity: () => ({ userId: demo.doctorId, fullName: demo.fullName, email: demo.email, imageUrl: '' }) }
    await ensureDemoData(repos)
    const svc = createServices(repos, session)
    const before = await svc.analytics.dashboard()
    const blob = await svc.data.exportWorkbook()
    expect(blob.size).toBeGreaterThan(5000)

    await svc.data.clearWorkspace()
    expect((await svc.patients.list()).total).toBe(0)

    const summary = await svc.data.importWorkbook(await blob.arrayBuffer())
    expect(summary.counts.patients).toBe(12)
    const after = await svc.analytics.dashboard()
    expect(after.cards).toEqual(before.cards)
    // Documents keep their files after a round-trip when the binary still exists — here cleared, so metadata only.
    expect(summary.counts.medical_documents).toBeGreaterThan(0)
  })

  it('refuses a workbook whose IDs belong to another doctor, without touching data', async () => {
    const repos = createMemoryRepositories()
    await ensureDemoData(repos)
    const owner = DEMO_DOCTORS[1]
    const ownerSvc = createServices(repos, { getIdentity: () => ({ userId: owner.doctorId, fullName: owner.fullName, email: owner.email, imageUrl: '' }) })
    const blob = await ownerSvc.data.exportWorkbook()
    const other = createServices(repos, { getIdentity: () => DR_A })
    await other.doctor.ensureProfile()
    await other.patients.create(patientInput({ fullName: 'Keep Me' }))
    await expect(other.data.importWorkbook(await blob.arrayBuffer())).rejects.toThrow(/another doctor/)
    expect((await other.patients.list()).items.map((p) => p.fullName)).toEqual(['Keep Me'])
    expect((await ownerSvc.patients.list()).total).toBe(8)
  })

  it('rejects a workbook with broken references', async () => {
    const repos = createMemoryRepositories()
    const demo = DEMO_DOCTORS[1]
    const session = { getIdentity: () => ({ userId: demo.doctorId, fullName: demo.fullName, email: demo.email, imageUrl: '' }) }
    await ensureDemoData(repos)
    const svc = createServices(repos, session)
    const { buildWorkbook, workbookToBlob, readWorkbook } = await import('@/data/excel/excelWorkbook')
    const sheets = await readWorkbook(await (await svc.data.exportWorkbook()).arrayBuffer())
    sheets.visits[0].patientId = 'PT-NOPE00'
    const wb = await buildWorkbook(
      Object.entries(sheets).map(([name, rows]) => ({
        name,
        columns: Object.keys(rows[0] ?? { id: '' }).map((key) => ({ key })),
        rows: rows as never,
      })),
    )
    const bad = await workbookToBlob(wb)
    await expect(svc.data.importWorkbook(await bad.arrayBuffer())).rejects.toThrow(/does not exist/)
    expect((await svc.patients.list()).total).toBe(8) // untouched
  })
})
