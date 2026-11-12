import type { RepositoryRegistry } from '@/data/repositories/interfaces'
import { AnalyticsService } from './analyticsService'
import { AppointmentService } from './appointmentService'
import { AuditService } from './auditService'
import { ChangeBus, type Session, type ServiceDeps } from './context'
import { DataService } from './dataService'
import { DiagnosisService } from './diagnosisService'
import { DoctorService } from './doctorService'
import { DocumentService } from './documentService'
import { FileService } from './fileService'
import { FollowUpService } from './followUpService'
import { MedicineService } from './medicineService'
import { PatientService } from './patientService'
import { PrescriptionService } from './prescriptionService'
import { VisitService } from './visitService'

/**
 * The application's business API. UI code depends on this shape only.
 * When a backend is introduced, these classes move to the server unchanged and
 * the UI gets an HTTP client implementing the same methods.
 */
export interface Services {
  bus: ChangeBus
  storageType: RepositoryRegistry['storageType']
  doctor: DoctorService
  patients: PatientService
  visits: VisitService
  diagnoses: DiagnosisService
  prescriptions: PrescriptionService
  medicines: MedicineService
  appointments: AppointmentService
  followUps: FollowUpService
  documents: DocumentService
  analytics: AnalyticsService
  audit: AuditService
  data: DataService
  files: FileService
}

export function createServices(repos: RepositoryRegistry, session: Session, bus = new ChangeBus()): Services {
  const deps: ServiceDeps = { repos, session, bus }
  const files = new FileService(deps)
  const followUps = new FollowUpService(deps)
  const appointments = new AppointmentService(deps, followUps)
  return {
    bus,
    storageType: repos.storageType,
    files,
    doctor: new DoctorService(deps, files),
    patients: new PatientService(deps, files),
    followUps,
    appointments,
    visits: new VisitService(deps, appointments, followUps),
    diagnoses: new DiagnosisService(deps),
    prescriptions: new PrescriptionService(deps),
    medicines: new MedicineService(deps),
    documents: new DocumentService(deps, files),
    analytics: new AnalyticsService(deps),
    audit: new AuditService(deps),
    data: new DataService(deps),
  }
}

export { ChangeBus }
export type { Session, SessionIdentity } from './context'
