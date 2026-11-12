/**
 * Domain entities. These are storage-agnostic and SQL-friendly:
 * - every entity has a string primary key and flat scalar columns,
 * - relationships are expressed with foreign-key style `...Id` fields,
 * - every clinical record carries `doctorId` (tenant key) and
 *   `deletedAt` (soft delete), so history is never physically removed.
 * Dates are ISO strings: `YYYY-MM-DD` for calendar dates, full ISO-8601 for timestamps.
 */
import type {
  APPOINTMENT_STATUSES,
  APPOINTMENT_TYPES,
  BLOOD_GROUPS,
  DIAGNOSIS_STATUSES,
  DOCUMENT_TYPES,
  DOSAGE_FORMS,
  FOLLOWUP_STATUSES,
  FREQUENCIES,
  GENDERS,
  MEDICINE_STATUSES,
  PATIENT_STATUSES,
  PRESCRIPTION_STATUSES,
  ROUTES,
  SEVERITIES,
  TIMINGS,
  VISIT_TYPES,
} from './constants'

export type Gender = (typeof GENDERS)[number]
export type BloodGroup = (typeof BLOOD_GROUPS)[number]
export type PatientStatus = (typeof PATIENT_STATUSES)[number]
export type VisitType = (typeof VISIT_TYPES)[number]
export type Severity = (typeof SEVERITIES)[number]
export type DiagnosisStatus = (typeof DIAGNOSIS_STATUSES)[number]
export type DosageForm = (typeof DOSAGE_FORMS)[number]
export type Frequency = (typeof FREQUENCIES)[number]
export type RouteOfAdmin = (typeof ROUTES)[number]
export type Timing = (typeof TIMINGS)[number]
export type PrescriptionStatus = (typeof PRESCRIPTION_STATUSES)[number]
export type MedicineStatus = (typeof MEDICINE_STATUSES)[number]
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number]
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number]
export type FollowUpStatus = (typeof FOLLOWUP_STATUSES)[number]
export type DocumentType = (typeof DOCUMENT_TYPES)[number]

export interface Timestamps {
  createdAt: string
  updatedAt: string
}

export interface SoftDeletable {
  deletedAt: string | null
}

export interface Doctor extends Timestamps {
  /** Clerk user ID (or demo identity ID in demo mode). */
  doctorId: string
  fullName: string
  email: string
  avatarUrl: string
  specialization: string
  qualifications: string
  registrationNumber: string
  clinicName: string
  clinicAddress: string
  contactNumber: string
  experienceYears: number | null
  /** File-store key of the signature image used on prescriptions. */
  signatureFileId: string | null
  onboardingComplete: boolean
}

export interface Patient extends Timestamps, SoftDeletable {
  patientId: string
  doctorId: string
  fullName: string
  dob: string
  gender: Gender
  bloodGroup: BloodGroup
  photoFileId: string | null
  mobile: string
  email: string
  address: string
  emergencyContactName: string
  emergencyContactNumber: string
  allergies: string
  existingConditions: string
  chronicDiseases: string
  previousSurgeries: string
  familyHistory: string
  currentMedications: string
  medicalNotes: string
  registrationDate: string
  status: PatientStatus
}

export interface Visit extends Timestamps, SoftDeletable {
  visitId: string
  patientId: string
  doctorId: string
  visitDateTime: string
  visitType: VisitType
  chiefComplaint: string
  symptoms: string
  bpSystolic: number | null
  bpDiastolic: number | null
  heartRate: number | null
  /** Body temperature in °F (common in Indian clinical practice). */
  temperatureF: number | null
  respiratoryRate: number | null
  spo2: number | null
  weightKg: number | null
  heightCm: number | null
  /** Derived from weight and height on save. */
  bmi: number | null
  observations: string
  /** Denormalised, human-readable summary of linked diagnoses. */
  diagnosisSummary: string
  treatmentPlan: string
  notes: string
  followUpDate: string | null
  appointmentId: string | null
}

export interface Diagnosis extends Timestamps, SoftDeletable {
  diagnosisId: string
  patientId: string
  doctorId: string
  visitId: string
  name: string
  icd10Code: string
  description: string
  symptoms: string
  diagnosisDate: string
  severity: Severity
  status: DiagnosisStatus
  treatmentNotes: string
}

/** Patient and doctor details frozen at the moment a prescription is issued. */
export interface PrescriptionSnapshot {
  patientName: string
  patientAge: string
  patientGender: string
  patientMobile: string
  patientAllergies: string
  doctorName: string
  qualifications: string
  specialization: string
  registrationNumber: string
  clinicName: string
  clinicAddress: string
  contactNumber: string
}

export interface Prescription extends Timestamps {
  prescriptionId: string
  /** Stable, human-facing number shared by all versions (e.g. RX-24A7KD). */
  rxNumber: string
  version: number
  status: PrescriptionStatus
  /** Set when a newer version replaces this one. */
  supersededById: string | null
  patientId: string
  doctorId: string
  visitId: string | null
  prescriptionDate: string
  diagnosis: string
  instructions: string
  followUpDate: string | null
  editReason: string
  issuedAt: string
  snapshot: PrescriptionSnapshot
}

export interface PrescriptionMedicine {
  id: string
  prescriptionId: string
  doctorId: string
  medicineId: string | null
  medicineName: string
  genericName: string
  strength: string
  dosage: string
  dosageForm: DosageForm
  frequency: Frequency
  route: RouteOfAdmin
  duration: string
  quantity: string
  timing: Timing
  instructions: string
  sortOrder: number
}

export interface Medicine extends Timestamps {
  medicineId: string
  doctorId: string
  name: string
  genericName: string
  brandName: string
  manufacturer: string
  composition: string
  strength: string
  dosageForm: DosageForm
  route: RouteOfAdmin
  category: string
  description: string
  status: MedicineStatus
}

export interface Appointment extends Timestamps, SoftDeletable {
  appointmentId: string
  patientId: string
  doctorId: string
  date: string
  startTime: string
  endTime: string
  type: AppointmentType
  reason: string
  status: AppointmentStatus
  notes: string
  followUpId: string | null
}

export interface FollowUp extends Timestamps {
  followUpId: string
  patientId: string
  doctorId: string
  visitId: string | null
  dueDate: string
  reason: string
  status: FollowUpStatus
  appointmentId: string | null
  notes: string
}

export interface MedicalDocument extends Timestamps, SoftDeletable {
  documentId: string
  patientId: string
  doctorId: string
  visitId: string | null
  name: string
  type: DocumentType
  description: string
  uploadDate: string
  /** Key in the file store; binaries are never stored in the record itself. */
  fileId: string
  fileName: string
  mimeType: string
  sizeBytes: number
}

export type AuditAction = 'create' | 'update' | 'archive' | 'restore' | 'issue' | 'revise' | 'cancel' | 'import' | 'export'

export interface AuditLog {
  auditId: string
  doctorId: string
  entity: string
  entityId: string
  action: AuditAction
  /** Field names or a short description only; never patient-identifying values. */
  detail: string
  at: string
}

export interface StoredFile {
  fileId: string
  doctorId: string
  fileName: string
  mimeType: string
  sizeBytes: number
  blob: Blob
  createdAt: string
}

/* ---------- Read models returned by services ---------- */

export interface PatientListItem extends Patient {
  age: number
  lastVisit: string | null
  nextFollowUp: string | null
}

export interface PrescriptionWithItems extends Prescription {
  items: PrescriptionMedicine[]
}

export interface VisitWithDiagnoses extends Visit {
  diagnoses: Diagnosis[]
}

export interface FollowUpView extends FollowUp {
  patientName: string
  isOverdue: boolean
  daysFromToday: number
}

export interface AppointmentView extends Appointment {
  patientName: string
  patientMobile: string
}
