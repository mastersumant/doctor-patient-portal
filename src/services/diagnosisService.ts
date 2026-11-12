import type { Diagnosis, DiagnosisStatus } from '@/domain/types'
import { nowIso } from '@/utils/dates'
import { BaseService } from './context'
import { NotFoundError } from './errors'

export interface DiagnosisWithPatient extends Diagnosis {
  patientName: string
}

export class DiagnosisService extends BaseService {
  async listForPatient(patientId: string): Promise<Diagnosis[]> {
    return this.repos.diagnoses.findAll(this.doctorId(), {
      filters: { patientId },
      sort: [{ field: 'diagnosisDate', direction: 'desc' }],
    })
  }

  async listForVisit(visitId: string): Promise<Diagnosis[]> {
    return this.repos.diagnoses.findAll(this.doctorId(), { filters: { visitId } })
  }

  /** Quick status change (e.g. mark resolved) without editing the whole visit. */
  async setStatus(diagnosisId: string, status: DiagnosisStatus): Promise<void> {
    const doctorId = this.doctorId()
    const dx = await this.repos.diagnoses.findById(doctorId, diagnosisId)
    if (!dx || dx.deletedAt) throw new NotFoundError('Diagnosis')
    await this.repos.diagnoses.update(doctorId, diagnosisId, { status, updatedAt: nowIso() })
    await this.audit('Diagnosis', diagnosisId, 'update', `status → ${status}`)
    this.changed('diagnoses')
  }

  /** Distinct diagnosis names used before, for form suggestions. */
  async knownNames(): Promise<Array<{ name: string; icd10Code: string }>> {
    const all = await this.repos.diagnoses.findAll(this.doctorId())
    const map = new Map<string, string>()
    for (const d of all) if (!map.has(d.name)) map.set(d.name, d.icd10Code)
    return [...map.entries()].map(([name, icd10Code]) => ({ name, icd10Code }))
  }
}
