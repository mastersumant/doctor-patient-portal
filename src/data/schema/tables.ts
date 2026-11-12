/**
 * Single source of truth for the persisted table layout. Used to
 *  - build and validate Excel workbooks (one sheet per table),
 *  - generate the PostgreSQL / MySQL DDL in docs/database-schema.md,
 *  - check referential integrity on import.
 * Column keys match the domain entity fields exactly.
 */
import {
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
} from '@/domain/constants'

export type ColumnType = 'id' | 'text' | 'longtext' | 'int' | 'decimal' | 'date' | 'datetime' | 'time' | 'bool' | 'json' | 'enum' | 'bytes'

export interface ColumnSpec {
  key: string
  type: ColumnType
  nullable?: boolean
  enumValues?: readonly string[]
  /** Foreign key target as "table.column". */
  ref?: string
  /**
   * A cross-link checked on import but not enforced as a SQL foreign key, because
   * the links are circular (visit ↔ appointment ↔ follow-up) or self-referencing.
   */
  softRef?: boolean
  maxLength?: number
}

export interface TableSpec {
  /** Table name in SQL, sheet name in Excel, store name in IndexedDB. */
  name: string
  label: string
  primaryKey: string
  columns: ColumnSpec[]
  /** Extra indexes beyond the PK and doctor_id. */
  indexes?: string[][]
}

const c = (key: string, type: ColumnType, extra: Partial<ColumnSpec> = {}): ColumnSpec => ({ key, type, ...extra })
const doctorFk = c('doctorId', 'id', { ref: 'doctors.doctorId' })
const timestamps = [c('createdAt', 'datetime'), c('updatedAt', 'datetime')]
const softDelete = c('deletedAt', 'datetime', { nullable: true })

export const TABLES: TableSpec[] = [
  {
    name: 'doctors',
    label: 'Doctors',
    primaryKey: 'doctorId',
    columns: [
      c('doctorId', 'id'),
      c('fullName', 'text', { maxLength: 120 }),
      c('email', 'text', { maxLength: 254 }),
      c('avatarUrl', 'longtext'),
      c('specialization', 'text', { maxLength: 120 }),
      c('qualifications', 'text', { maxLength: 200 }),
      c('registrationNumber', 'text', { maxLength: 60 }),
      c('clinicName', 'text', { maxLength: 160 }),
      c('clinicAddress', 'text', { maxLength: 400 }),
      c('contactNumber', 'text', { maxLength: 20 }),
      c('experienceYears', 'int', { nullable: true }),
      c('signatureFileId', 'id', { nullable: true }),
      c('onboardingComplete', 'bool'),
      ...timestamps,
    ],
  },
  {
    name: 'patients',
    label: 'Patients',
    primaryKey: 'patientId',
    indexes: [['doctorId', 'fullName'], ['doctorId', 'mobile']],
    columns: [
      c('patientId', 'id'),
      doctorFk,
      c('fullName', 'text', { maxLength: 120 }),
      c('dob', 'date'),
      c('gender', 'enum', { enumValues: GENDERS }),
      c('bloodGroup', 'enum', { enumValues: BLOOD_GROUPS }),
      c('photoFileId', 'id', { nullable: true }),
      c('mobile', 'text', { maxLength: 20 }),
      c('email', 'text', { maxLength: 254 }),
      c('address', 'text', { maxLength: 400 }),
      c('emergencyContactName', 'text', { maxLength: 120 }),
      c('emergencyContactNumber', 'text', { maxLength: 20 }),
      c('allergies', 'longtext'),
      c('existingConditions', 'longtext'),
      c('chronicDiseases', 'longtext'),
      c('previousSurgeries', 'longtext'),
      c('familyHistory', 'longtext'),
      c('currentMedications', 'longtext'),
      c('medicalNotes', 'longtext'),
      c('registrationDate', 'date'),
      c('status', 'enum', { enumValues: PATIENT_STATUSES }),
      ...timestamps,
      softDelete,
    ],
  },
  {
    name: 'visits',
    label: 'Visits',
    primaryKey: 'visitId',
    indexes: [['doctorId', 'patientId', 'visitDateTime']],
    columns: [
      c('visitId', 'id'),
      c('patientId', 'id', { ref: 'patients.patientId' }),
      doctorFk,
      c('visitDateTime', 'datetime'),
      c('visitType', 'enum', { enumValues: VISIT_TYPES }),
      c('chiefComplaint', 'text', { maxLength: 300 }),
      c('symptoms', 'longtext'),
      c('bpSystolic', 'int', { nullable: true }),
      c('bpDiastolic', 'int', { nullable: true }),
      c('heartRate', 'int', { nullable: true }),
      c('temperatureF', 'decimal', { nullable: true }),
      c('respiratoryRate', 'int', { nullable: true }),
      c('spo2', 'int', { nullable: true }),
      c('weightKg', 'decimal', { nullable: true }),
      c('heightCm', 'decimal', { nullable: true }),
      c('bmi', 'decimal', { nullable: true }),
      c('observations', 'longtext'),
      c('diagnosisSummary', 'longtext'),
      c('treatmentPlan', 'longtext'),
      c('notes', 'longtext'),
      c('followUpDate', 'date', { nullable: true }),
      c('appointmentId', 'id', { nullable: true, ref: 'appointments.appointmentId', softRef: true }),
      ...timestamps,
      softDelete,
    ],
  },
  {
    name: 'diagnoses',
    label: 'Diagnoses',
    primaryKey: 'diagnosisId',
    indexes: [['doctorId', 'patientId'], ['visitId']],
    columns: [
      c('diagnosisId', 'id'),
      c('patientId', 'id', { ref: 'patients.patientId' }),
      doctorFk,
      c('visitId', 'id', { ref: 'visits.visitId' }),
      c('name', 'text', { maxLength: 200 }),
      c('icd10Code', 'text', { maxLength: 10 }),
      c('description', 'longtext'),
      c('symptoms', 'longtext'),
      c('diagnosisDate', 'date'),
      c('severity', 'enum', { enumValues: SEVERITIES }),
      c('status', 'enum', { enumValues: DIAGNOSIS_STATUSES }),
      c('treatmentNotes', 'longtext'),
      ...timestamps,
      softDelete,
    ],
  },
  {
    name: 'prescriptions',
    label: 'Prescriptions',
    primaryKey: 'prescriptionId',
    indexes: [['doctorId', 'rxNumber', 'version'], ['doctorId', 'patientId']],
    columns: [
      c('prescriptionId', 'id'),
      c('rxNumber', 'text', { maxLength: 20 }),
      c('version', 'int'),
      c('status', 'enum', { enumValues: PRESCRIPTION_STATUSES }),
      c('supersededById', 'id', { nullable: true, ref: 'prescriptions.prescriptionId', softRef: true }),
      c('patientId', 'id', { ref: 'patients.patientId' }),
      doctorFk,
      c('visitId', 'id', { nullable: true, ref: 'visits.visitId' }),
      c('prescriptionDate', 'date'),
      c('diagnosis', 'longtext'),
      c('instructions', 'longtext'),
      c('followUpDate', 'date', { nullable: true }),
      c('editReason', 'text', { maxLength: 300 }),
      c('issuedAt', 'datetime'),
      c('snapshot', 'json'),
      ...timestamps,
    ],
  },
  {
    name: 'prescription_medicines',
    label: 'Prescription medicines',
    primaryKey: 'id',
    indexes: [['prescriptionId', 'sortOrder']],
    columns: [
      c('id', 'id'),
      c('prescriptionId', 'id', { ref: 'prescriptions.prescriptionId' }),
      doctorFk,
      c('medicineId', 'id', { nullable: true, ref: 'medicines.medicineId' }),
      c('medicineName', 'text', { maxLength: 160 }),
      c('genericName', 'text', { maxLength: 160 }),
      c('strength', 'text', { maxLength: 60 }),
      c('dosage', 'text', { maxLength: 60 }),
      c('dosageForm', 'enum', { enumValues: DOSAGE_FORMS }),
      c('frequency', 'enum', { enumValues: FREQUENCIES }),
      c('route', 'enum', { enumValues: ROUTES }),
      c('duration', 'text', { maxLength: 60 }),
      c('quantity', 'text', { maxLength: 60 }),
      c('timing', 'enum', { enumValues: TIMINGS }),
      c('instructions', 'text', { maxLength: 300 }),
      c('sortOrder', 'int'),
    ],
  },
  {
    name: 'medicines',
    label: 'Medicines',
    primaryKey: 'medicineId',
    indexes: [['doctorId', 'name']],
    columns: [
      c('medicineId', 'id'),
      doctorFk,
      c('name', 'text', { maxLength: 160 }),
      c('genericName', 'text', { maxLength: 160 }),
      c('brandName', 'text', { maxLength: 160 }),
      c('manufacturer', 'text', { maxLength: 160 }),
      c('composition', 'text', { maxLength: 400 }),
      c('strength', 'text', { maxLength: 60 }),
      c('dosageForm', 'enum', { enumValues: DOSAGE_FORMS }),
      c('route', 'enum', { enumValues: ROUTES }),
      c('category', 'text', { maxLength: 80 }),
      c('description', 'longtext'),
      c('status', 'enum', { enumValues: MEDICINE_STATUSES }),
      ...timestamps,
    ],
  },
  {
    name: 'appointments',
    label: 'Appointments',
    primaryKey: 'appointmentId',
    indexes: [['doctorId', 'date', 'startTime']],
    columns: [
      c('appointmentId', 'id'),
      c('patientId', 'id', { ref: 'patients.patientId' }),
      doctorFk,
      c('date', 'date'),
      c('startTime', 'time'),
      c('endTime', 'time'),
      c('type', 'enum', { enumValues: APPOINTMENT_TYPES }),
      c('reason', 'text', { maxLength: 300 }),
      c('status', 'enum', { enumValues: APPOINTMENT_STATUSES }),
      c('notes', 'longtext'),
      c('followUpId', 'id', { nullable: true, ref: 'followups.followUpId', softRef: true }),
      ...timestamps,
      softDelete,
    ],
  },
  {
    name: 'followups',
    label: 'Follow-ups',
    primaryKey: 'followUpId',
    indexes: [['doctorId', 'status', 'dueDate']],
    columns: [
      c('followUpId', 'id'),
      c('patientId', 'id', { ref: 'patients.patientId' }),
      doctorFk,
      c('visitId', 'id', { nullable: true, ref: 'visits.visitId' }),
      c('dueDate', 'date'),
      c('reason', 'text', { maxLength: 300 }),
      c('status', 'enum', { enumValues: FOLLOWUP_STATUSES }),
      c('appointmentId', 'id', { nullable: true, ref: 'appointments.appointmentId', softRef: true }),
      c('notes', 'longtext'),
      ...timestamps,
    ],
  },
  {
    name: 'medical_documents',
    label: 'Medical documents',
    primaryKey: 'documentId',
    indexes: [['doctorId', 'patientId']],
    columns: [
      c('documentId', 'id'),
      c('patientId', 'id', { ref: 'patients.patientId' }),
      doctorFk,
      c('visitId', 'id', { nullable: true, ref: 'visits.visitId' }),
      c('name', 'text', { maxLength: 160 }),
      c('type', 'enum', { enumValues: DOCUMENT_TYPES }),
      c('description', 'longtext'),
      c('uploadDate', 'date'),
      c('fileId', 'id'),
      c('fileName', 'text', { maxLength: 200 }),
      c('mimeType', 'text', { maxLength: 80 }),
      c('sizeBytes', 'int'),
      ...timestamps,
      softDelete,
    ],
  },
]

export const AUDIT_TABLE: TableSpec = {
  name: 'audit_logs',
  label: 'Audit log',
  primaryKey: 'auditId',
  indexes: [['doctorId', 'at']],
  columns: [
    c('auditId', 'id'),
    doctorFk,
    c('entity', 'text', { maxLength: 40 }),
    c('entityId', 'id'),
    c('action', 'text', { maxLength: 20 }),
    c('detail', 'text', { maxLength: 400 }),
    c('at', 'datetime'),
  ],
}

/** Server-only tables: binary files (documents, photos, signatures) and app metadata. */
export const FILES_TABLE: TableSpec = {
  name: 'stored_files',
  label: 'Stored files',
  primaryKey: 'fileId',
  indexes: [['doctorId']],
  columns: [
    c('fileId', 'id'),
    c('doctorId', 'id'),
    c('fileName', 'text', { maxLength: 200 }),
    c('mimeType', 'text', { maxLength: 80 }),
    c('sizeBytes', 'int'),
    c('data', 'bytes'),
    c('createdAt', 'datetime'),
  ],
}

export const META_TABLE: TableSpec = {
  name: 'app_meta',
  label: 'App metadata',
  primaryKey: 'key',
  columns: [c('key', 'text', { maxLength: 100 }), c('value', 'json')],
}

export const TABLES_BY_NAME = Object.fromEntries(TABLES.map((t) => [t.name, t])) as Record<string, TableSpec>
