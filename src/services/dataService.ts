import type { Doctor } from '@/domain/types'
import { buildWorkbook, readWorkbook, workbookToBlob, type SheetData } from '@/data/excel/excelWorkbook'
import { checkReferences, fromRows, toRow } from '@/data/schema/rowCodec'
import { TABLES, type TableSpec } from '@/data/schema/tables'
import { applySeed, buildSeed, clearWorkspace, DEMO_DOCTORS, removeWorkspaceRecords } from '@/data/seed/seedData'
import { nowIso } from '@/utils/dates'
import { BaseService } from './context'
import { ValidationError } from './errors'

type Row = Record<string, unknown>

export interface ImportSummary {
  counts: Record<string, number>
}

/** Workspace-level operations: Excel export/import, sample data, reset. */
export class DataService extends BaseService {
  private async collect(): Promise<Record<string, Row[]>> {
    const doctorId = this.doctorId()
    const r = this.repos
    const all = { includeDeleted: true }
    const doctor = await r.doctors.findById(doctorId)
    return {
      doctors: doctor ? [doctor as unknown as Row] : [],
      patients: (await r.patients.findAll(doctorId, all)) as unknown as Row[],
      visits: (await r.visits.findAll(doctorId, all)) as unknown as Row[],
      diagnoses: (await r.diagnoses.findAll(doctorId, all)) as unknown as Row[],
      prescriptions: (await r.prescriptions.findAll(doctorId, all)) as unknown as Row[],
      prescription_medicines: (await r.prescriptionMedicines.findAll(doctorId, all)) as unknown as Row[],
      medicines: (await r.medicines.findAll(doctorId, all)) as unknown as Row[],
      appointments: (await r.appointments.findAll(doctorId, all)) as unknown as Row[],
      followups: (await r.followUps.findAll(doctorId, all)) as unknown as Row[],
      medical_documents: (await r.documents.findAll(doctorId, all)) as unknown as Row[],
    }
  }

  /** One workbook, one sheet per table — the same layout as the planned Excel/SQL tables. */
  async exportWorkbook(): Promise<Blob> {
    const data = await this.collect()
    const sheets: SheetData[] = TABLES.map((t) => ({
      name: t.name,
      columns: t.columns.map((col) => ({ key: col.key })),
      rows: (data[t.name] ?? []).map((row) => toRow(t, row)),
    }))
    const blob = await workbookToBlob(await buildWorkbook(sheets, { title: 'ClinicDesk workspace export' }))
    await this.audit('Workspace', this.doctorId(), 'export', 'Excel workbook')
    return blob
  }

  /**
   * Replaces this doctor's workspace with the contents of a workbook.
   * Every row is type-checked, foreign keys are verified, and doctorId is
   * overwritten with the signed-in doctor — IDs in the file are never trusted.
   */
  async importWorkbook(data: ArrayBuffer): Promise<ImportSummary> {
    const doctorId = this.doctorId()
    let sheets: Record<string, Row[]>
    try {
      sheets = await readWorkbook(data)
    } catch {
      throw new ValidationError('This file could not be read as an Excel workbook (.xlsx).')
    }
    const missing = TABLES.filter((t) => t.name !== 'doctors' && !(t.name in sheets)).map((t) => t.name)
    if (missing.length) throw new ValidationError(`The workbook is missing these sheets: ${missing.join(', ')}`)

    const decoded: Record<string, Row[]> = {}
    const errors: string[] = []
    for (const t of TABLES) {
      if (t.name === 'doctors') continue
      const rows = (sheets[t.name] ?? []).map((r) => ({ ...r, doctorId }))
      const res = fromRows<Row>(t, rows)
      errors.push(...res.errors)
      decoded[t.name] = res.rows
    }
    errors.push(...checkReferences(TABLES.filter((t) => t.name !== 'doctors'), decoded))
    if (errors.length) {
      throw new ValidationError(`The workbook has ${errors.length} problem${errors.length === 1 ? '' : 's'}. First: ${errors[0]}`, {
        import: errors.join('\n'),
      })
    }

    // Pre-flight: IDs owned by another doctor in this store would fail mid-write, so refuse up front.
    const repoByTable = {
      patients: this.repos.patients,
      visits: this.repos.visits,
      diagnoses: this.repos.diagnoses,
      prescriptions: this.repos.prescriptions,
      prescription_medicines: this.repos.prescriptionMedicines,
      medicines: this.repos.medicines,
      appointments: this.repos.appointments,
      followups: this.repos.followUps,
      medical_documents: this.repos.documents,
    } as const
    for (const t of TABLES) {
      const repo = repoByTable[t.name as keyof typeof repoByTable]
      if (!repo) continue
      const clash = await repo.foreignIds(doctorId, (decoded[t.name] ?? []).map((r) => String(r[t.primaryKey])))
      if (clash.length) {
        throw new ValidationError(
          `This workbook’s records belong to another doctor’s workspace in this browser (for example ${t.label.toLowerCase()} ${clash[0]}). Nothing was changed.`,
        )
      }
    }

    // Files are not part of the workbook; keep binaries for documents that are re-imported.
    await this.replaceWorkspace(decoded)

    // Doctor profile fields from the file are applied, but identity fields are not.
    const docRow = (sheets.doctors ?? [])[0]
    if (docRow) {
      const docTable = TABLES.find((t) => t.name === 'doctors') as TableSpec
      const res = fromRows<Doctor>(docTable, [{ ...docRow, doctorId }])
      const current = await this.repos.doctors.findById(doctorId)
      const src = res.rows[0]
      if (src && current) {
        await this.repos.doctors.upsert({
          ...current,
          fullName: src.fullName || current.fullName,
          specialization: src.specialization,
          qualifications: src.qualifications,
          registrationNumber: src.registrationNumber,
          clinicName: src.clinicName,
          clinicAddress: src.clinicAddress,
          contactNumber: src.contactNumber,
          experienceYears: src.experienceYears,
          updatedAt: nowIso(),
        })
      }
    }
    const counts = Object.fromEntries(Object.entries(decoded).map(([k, v]) => [k, v.length]))
    await this.audit('Workspace', doctorId, 'import', `Excel workbook: ${Object.values(counts).reduce((a, b) => a + b, 0)} rows`)
    this.changed('*')
    return { counts }
  }

  private async replaceWorkspace(d: Record<string, Row[]>) {
    const doctorId = this.doctorId()
    const r = this.repos
    const keepFiles = new Set((d.medical_documents ?? []).map((x) => String(x.fileId)))
    const existingDocs = await r.documents.findAll(doctorId, { includeDeleted: true })
    for (const doc of existingDocs) if (!keepFiles.has(doc.fileId)) await r.files.remove(doctorId, doc.fileId)
    await removeWorkspaceRecords(r, doctorId)
    const up = async <T>(repo: { bulkUpsert(doctorId: string, rows: T[]): Promise<void> }, rows: Row[] | undefined) =>
      repo.bulkUpsert(doctorId, (rows ?? []) as unknown as T[])
    await up(r.medicines, d.medicines)
    await up(r.patients, d.patients)
    await up(r.visits, d.visits)
    await up(r.diagnoses, d.diagnoses)
    await up(r.prescriptions, d.prescriptions)
    await up(r.prescriptionMedicines, d.prescription_medicines)
    await up(r.appointments, d.appointments)
    await up(r.followUps, d.followups)
    await up(r.documents, d.medical_documents)
  }

  /** Fills the signed-in doctor's workspace with synthetic data (replacing current records). */
  async loadSampleData(): Promise<void> {
    const doctorId = this.doctorId()
    const doctor = await this.repos.doctors.findById(doctorId)
    const demo = DEMO_DOCTORS.find((d) => d.doctorId === doctorId)
    const kind = demo?.kind ?? (/paed|pediat/i.test(doctor?.specialization ?? '') ? 'pediatric' : 'adult')
    const bundle = buildSeed({
      ...(demo ?? {}),
      doctorId,
      kind,
      patientCount: demo?.patientCount ?? 12,
      fullName: doctor?.fullName ?? demo?.fullName,
      clinicAddress: doctor?.clinicAddress || demo?.clinicAddress,
    })
    if (doctor) {
      // Keep the doctor's own profile; refresh snapshots so sample prescriptions show it.
      for (const rx of bundle.prescriptions) {
        rx.snapshot = {
          ...rx.snapshot,
          doctorName: doctor.fullName,
          qualifications: doctor.qualifications,
          specialization: doctor.specialization,
          registrationNumber: doctor.registrationNumber,
          clinicName: doctor.clinicName,
          clinicAddress: doctor.clinicAddress,
          contactNumber: doctor.contactNumber,
        }
      }
    }
    await applySeed(this.repos, bundle, { keepProfile: !!doctor })
    this.changed('*')
  }

  /** Removes every record in this doctor's workspace but keeps the profile. */
  async clearWorkspace(): Promise<void> {
    const doctorId = this.doctorId()
    await clearWorkspace(this.repos, doctorId, { keepProfile: true })
    await this.audit('Workspace', doctorId, 'archive', 'Workspace cleared by doctor')
    this.changed('*')
  }

  async isEmpty(): Promise<boolean> {
    return (await this.repos.patients.count(this.doctorId(), { includeDeleted: true })) === 0
  }
}
