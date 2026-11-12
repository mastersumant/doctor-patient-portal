/**
 * End to end over HTTP: the browser's HTTP client → the API handler used by the
 * Netlify Function → the same services → real PostgreSQL (PGlite).
 */
import { generateKeyPairSync, sign } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { createHttpServices } from '@/data/http/httpServices'
import { makeTinyPdf } from '@/data/seed/tinyPdf'
import type { Services } from '@/services'
import { ChangeBus, type SessionIdentity } from '@/services/context'
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '@/services/errors'
import { createApiHandler } from '@/server/apiHandler'
import { authorizedPartiesFromEnv, createClerkVerifier } from '@/server/auth'
import { createPostgresRepositories } from '@/server/postgres/pgRepositories'
import { addDaysIso, todayIso } from '@/utils/dates'
import type { PatientInput } from '@/validations/schemas'
import { startTestPg } from './support/pg'

const pg = await startTestPg(55434)
afterAll(() => pg.stop())

const USERS: Record<string, SessionIdentity> = {
  'token-a': { userId: 'user_alpha', fullName: 'Dr. Alpha Rao', email: 'alpha@example.com', imageUrl: '' },
  'token-b': { userId: 'user_beta', fullName: 'Dr. Beta Iyer', email: 'beta@example.com', imageUrl: '' },
}

const handler = createApiHandler({
  repos: createPostgresRepositories(pg.sql),
  verify: async (token) => (USERS[token] ? { userId: USERS[token].userId } : null),
  pingDatabase: async () => {
    await pg.sql`select 1`
  },
  log: () => undefined,
})

const callHandler: typeof fetch = (input, init) => handler(new Request(new URL(String(input), 'http://localhost'), init))

function clientFor(token: string | null, bus = new ChangeBus()): Services {
  return createHttpServices({
    getToken: async () => token,
    getIdentity: () => (token && USERS[token]) || null,
    fetch: callHandler,
    bus,
  })
}

const patient = (o: Partial<PatientInput> = {}): PatientInput => ({
  fullName: 'Meera Joshi',
  dob: '1988-03-02',
  gender: 'Female',
  bloodGroup: 'B+',
  mobile: '+91 98111 22233',
  email: '',
  address: '',
  emergencyContactName: '',
  emergencyContactNumber: '',
  allergies: 'None known',
  existingConditions: '',
  chronicDiseases: '',
  previousSurgeries: '',
  familyHistory: '',
  currentMedications: '',
  medicalNotes: '',
  registrationDate: todayIso(),
  status: 'Active',
  ...o,
})

describe('HTTP API on Postgres', () => {
  let a: Services
  let b: Services

  beforeEach(async () => {
    await pg.reset()
    a = clientFor('token-a')
    b = clientFor('token-b')
    await a.doctor.ensureProfile()
    await b.doctor.ensureProfile()
  })

  it('requires a valid session token', async () => {
    await expect(clientFor(null).patients.list()).rejects.toBeInstanceOf(UnauthorizedError)
    await expect(clientFor('forged').patients.list()).rejects.toBeInstanceOf(UnauthorizedError)
  })

  it('creates the profile from the verified user ID, using display hints only for names', async () => {
    const doc = await a.doctor.getCurrent()
    expect(doc?.doctorId).toBe('user_alpha')
    expect(doc?.fullName).toBe('Dr. Alpha Rao')
  })

  it('runs a full clinical flow and returns the same shapes as local mode', async () => {
    const p = await a.patients.create(patient())
    const v = await a.visits.create({
      patientId: p.patientId,
      visitDate: todayIso(),
      visitTime: '10:30',
      visitType: 'New Consultation',
      chiefComplaint: 'Cough',
      symptoms: '',
      bpSystolic: '124',
      bpDiastolic: '82',
      heartRate: '',
      temperatureF: '99.1',
      respiratoryRate: '',
      spo2: '',
      weightKg: '61',
      heightCm: '160',
      observations: '',
      treatmentPlan: '',
      notes: '',
      followUpDate: addDaysIso(todayIso(), 5),
      appointmentId: '',
      diagnoses: [
        { name: 'Acute bronchitis', icd10Code: 'J20.9', description: '', symptoms: '', diagnosisDate: todayIso(), severity: 'Mild', status: 'Active', treatmentNotes: '' },
      ],
    })
    expect(v.bmi).toBe(23.8)
    const detail = await a.visits.get(v.visitId)
    expect(detail.diagnoses[0].icd10Code).toBe('J20.9')
    expect(detail.visitDateTime).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    // toFormValues runs locally and round-trips through the API.
    await a.visits.update(v.visitId, a.visits.toFormValues(detail))

    const rx = await a.prescriptions.create({
      patientId: p.patientId,
      visitId: v.visitId,
      prescriptionDate: todayIso(),
      diagnosis: 'Acute bronchitis',
      instructions: 'Steam inhalation',
      followUpDate: '',
      editReason: '',
      items: [
        { medicineId: '', medicineName: 'Paracetamol', genericName: '', strength: '500 mg', dosage: '1 tablet', dosageForm: 'Tablet', frequency: 'Thrice Daily', route: 'Oral', duration: '3 days', quantity: '9', timing: 'After Food', instructions: '' },
      ],
    })
    const values = a.prescriptions.toFormValues(await a.prescriptions.get(rx.prescriptionId))
    const v2 = await a.prescriptions.revise(rx.prescriptionId, { ...values, editReason: 'Dose review' })
    expect(v2.version).toBe(2)
    expect((await a.prescriptions.get(rx.prescriptionId)).status).toBe('Superseded')

    const dash = await a.analytics.dashboard()
    expect(dash.cards.totalPatients).toBe(1)
    expect(dash.cards.pendingFollowUps).toBe(1)
    expect((await a.analytics.timeline(p.patientId)).length).toBeGreaterThan(2)
  })

  it('keeps each doctor’s records private over HTTP', async () => {
    const p = await a.patients.create(patient())
    expect((await b.patients.list()).total).toBe(0)
    await expect(b.patients.get(p.patientId)).rejects.toBeInstanceOf(NotFoundError)
    await expect(b.patients.update(p.patientId, patient({ fullName: 'Changed' }))).rejects.toBeInstanceOf(NotFoundError)
    await expect(b.appointments.create({ patientId: p.patientId, date: todayIso(), startTime: '10:00', endTime: '10:20', type: 'Consultation', reason: '', status: 'Scheduled', notes: '', followUpId: '' })).rejects.toBeInstanceOf(NotFoundError)
    expect((await a.patients.get(p.patientId)).fullName).toBe('Meera Joshi')
  })

  it('maps validation and conflict errors to the same error types the UI handles', async () => {
    const err = await a.patients.create(patient({ mobile: '12' })).catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as ValidationError).fieldErrors.mobile).toMatch(/mobile/i)

    const p = await a.patients.create(patient())
    const slot = { patientId: p.patientId, date: addDaysIso(todayIso(), 1), startTime: '11:00', endTime: '11:30', type: 'Consultation' as const, reason: '', status: 'Scheduled' as const, notes: '', followUpId: '' }
    await a.appointments.create(slot)
    await expect(a.appointments.create({ ...slot, startTime: '11:15', endTime: '11:45' })).rejects.toBeInstanceOf(ConflictError)
  })

  it('uploads and downloads documents and photos through the API', async () => {
    const p = await a.patients.create(patient())
    const bytes = makeTinyPdf('Lipid profile', ['LDL 120 mg/dL'])
    const pdf = Object.assign(new Blob([bytes as BlobPart], { type: 'application/pdf' }), { name: 'lipids.pdf' })
    const doc = await a.documents.upload({ patientId: p.patientId, name: 'Lipid profile', type: 'Blood Test Report', description: '', uploadDate: todayIso() }, pdf)
    expect(doc.fileName).toBe('lipids.pdf')
    const file = await a.documents.getFile(doc.documentId)
    expect(file.mimeType).toBe('application/pdf')
    expect(new Uint8Array(await file.blob.arrayBuffer())).toEqual(bytes)
    await expect(b.documents.getFile(doc.documentId)).rejects.toBeInstanceOf(NotFoundError)

    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4])
    await a.patients.setPhoto(p.patientId, Object.assign(new Blob([png], { type: 'image/png' }), { name: 'me.png' }))
    const photo = await a.patients.getPhoto((await a.patients.get(p.patientId)).photoFileId)
    expect(new Uint8Array(await photo!.arrayBuffer())).toEqual(png)
  })

  it('refuses uploads over the 4 MB function limit with a clear message', async () => {
    const p = await a.patients.create(patient())
    const big = new Uint8Array(4.2 * 1024 * 1024)
    big.set([0x25, 0x50, 0x44, 0x46])
    const err = await a.documents
      .upload({ patientId: p.patientId, name: 'Scan', type: 'Other', description: '', uploadDate: todayIso() }, Object.assign(new Blob([big]), { name: 'scan.pdf' }))
      .catch((e) => e)
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as Error).message).toMatch(/4 MB/)
  })

  it('exports and re-imports a workspace as Excel over HTTP', async () => {
    const bus = new ChangeBus()
    const events: string[][] = []
    bus.subscribe((e) => events.push(e))
    const c = clientFor('token-a', bus)
    await c.data.loadSampleData()
    expect(events.at(-1)).toEqual(['*'])
    const before = await c.analytics.dashboard()
    const xlsx = await c.data.exportWorkbook()
    expect(xlsx.size).toBeGreaterThan(5000)
    await c.data.clearWorkspace()
    expect((await c.patients.list()).total).toBe(0)
    const res = await c.data.importWorkbook(await xlsx.arrayBuffer())
    expect(res.counts.patients).toBe(12)
    expect((await c.analytics.dashboard()).cards).toEqual(before.cards)
  })

  it('only exposes allow-listed service methods', async () => {
    const post = (path: string) => handler(new Request(`http://localhost${path}`, { method: 'POST', headers: { authorization: 'Bearer token-a', 'content-type': 'application/json' }, body: '{"args":[]}' }))
    expect((await post('/api/rpc/followUps/createForVisit')).status).toBe(404)
    expect((await post('/api/rpc/patients/constructor')).status).toBe(404)
    expect((await post('/api/rpc/patients/__proto__')).status).toBe(404)
    expect((await post('/api/rpc/files/get')).status).toBe(404)
    expect((await post('/api/rpc/patients/list/extra')).status).toBe(404)
    expect((await handler(new Request('http://localhost/api/rpc/patients/list'))).status).toBe(405)
    const ok = await post('/api/rpc/patients/list')
    expect(ok.status).toBe(200)
    expect(ok.headers.get('cache-control')).toBe('no-store')
  })

  it('reports health without needing sign-in', async () => {
    const res = await handler(new Request('http://localhost/api/health'))
    expect(await res.json()).toEqual({ status: 'ok', database: 'ok' })
  })
})

describe('Clerk token verification', () => {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
  const pem = publicKey.export({ type: 'spki', format: 'pem' }).toString()
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const token = (claims: Record<string, unknown>, key = privateKey) => {
    const now = Math.floor(Date.now() / 1000)
    const body = `${b64({ alg: 'RS256', typ: 'JWT', kid: 'ins_test' })}.${b64({ iss: 'https://clerk.example.com', sid: 'sess_1', iat: now, nbf: now - 5, exp: now + 60, ...claims })}`
    return `${body}.${sign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`
  }
  const verify = createClerkVerifier({ secretKey: 'sk_test_unused', jwtKey: pem, authorizedParties: ['https://clinic.netlify.app'] })

  it('accepts a valid token and returns its subject', async () => {
    expect(await verify(token({ sub: 'user_123', azp: 'https://clinic.netlify.app' }))).toEqual({ userId: 'user_123' })
  })

  it('rejects tokens from other origins, expired, or signed with another key', async () => {
    expect(await verify(token({ sub: 'user_123', azp: 'https://evil.example' }))).toBeNull()
    const now = Math.floor(Date.now() / 1000)
    expect(await verify(token({ sub: 'user_123', azp: 'https://clinic.netlify.app', exp: now - 120, iat: now - 300, nbf: now - 300 }))).toBeNull()
    const other = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey
    expect(await verify(token({ sub: 'user_123', azp: 'https://clinic.netlify.app' }, other))).toBeNull()
    expect(await verify('not.a.jwt')).toBeNull()
  })

  it('derives allowed origins from Netlify’s site URLs', () => {
    expect(authorizedPartiesFromEnv({ URL: 'https://clinic.netlify.app', CONTEXT: 'production' })).toEqual(['https://clinic.netlify.app'])
    expect(authorizedPartiesFromEnv({ CLERK_AUTHORIZED_PARTIES: 'https://a.com/, https://b.com' })).toEqual(['https://a.com', 'https://b.com'])
    expect(authorizedPartiesFromEnv({ URL: 'https://x.netlify.app', CONTEXT: 'deploy-preview' })).toContain('http://localhost:5173')
  })
})

describe('migration', () => {
  it('is idempotent and recognises tables created by pasting the SQL manually', async () => {
    const { migrate, DB_SCHEMA } = await import('@/server/postgres/migration')
    expect(await migrate(pg.sql)).toBe('already-applied')
    await pg.sql.unsafe(`DELETE FROM "${DB_SCHEMA}"."schema_migrations"`)
    expect(await migrate(pg.sql)).toBe('already-applied')
    expect((await pg.sql.unsafe(`SELECT count(*)::int AS n FROM "${DB_SCHEMA}"."schema_migrations"`))[0].n).toBe(1)
  })
})
