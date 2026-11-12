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

/** Only the public methods of a service: what any transport (direct or HTTP) must provide. */
export type PublicApi<T> = { [K in keyof T]: T[K] }

/**
 * The application's business API. UI code depends on this shape only. It is
 * implemented by the services themselves (browser storage) and by an HTTP client
 * that runs the same services inside a Netlify Function (STORAGE_TYPE=API).
 */
export interface Services {
  bus: ChangeBus
  /** INDEXEDDB / MEMORY run services in the browser; API calls them on the server. */
  storageType: RepositoryRegistry['storageType'] | 'API'
  doctor: PublicApi<DoctorService>
  patients: PublicApi<PatientService>
  visits: PublicApi<VisitService>
  diagnoses: PublicApi<DiagnosisService>
  prescriptions: PublicApi<PrescriptionService>
  medicines: PublicApi<MedicineService>
  appointments: PublicApi<AppointmentService>
  followUps: PublicApi<FollowUpService>
  documents: PublicApi<DocumentService>
  analytics: PublicApi<AnalyticsService>
  audit: PublicApi<AuditService>
  data: PublicApi<DataService>
  files: PublicApi<FileService>
}

export interface ServiceOptions {
  /** Upload size cap; lower when uploads pass through a serverless function. */
  maxUploadBytes?: number
}

export function createServices(repos: RepositoryRegistry, session: Session, bus = new ChangeBus(), options: ServiceOptions = {}): Services {
  const deps: ServiceDeps = { repos, session, bus, options }
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
