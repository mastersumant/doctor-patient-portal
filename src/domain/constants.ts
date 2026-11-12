/**
 * Enumerations used across the domain. Kept as readonly tuples so they work
 * as Zod enums, TypeScript unions and SQL CHECK constraints alike.
 */

export const GENDERS = ['Male', 'Female', 'Other'] as const
export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] as const
export const PATIENT_STATUSES = ['Active', 'Inactive'] as const

export const VISIT_TYPES = ['New Consultation', 'Follow-up', 'Emergency'] as const

export const SEVERITIES = ['Mild', 'Moderate', 'Severe'] as const
export const DIAGNOSIS_STATUSES = ['Active', 'Resolved', 'Chronic'] as const

export const DOSAGE_FORMS = [
  'Tablet',
  'Capsule',
  'Syrup',
  'Injection',
  'Drops',
  'Cream',
  'Inhaler',
  'Sachet',
  'Other',
] as const
export const FREQUENCIES = [
  'Once Daily',
  'Twice Daily',
  'Thrice Daily',
  'Four Times Daily',
  'At Bedtime',
  'As Required',
  'Stat (once)',
] as const
export const ROUTES = [
  'Oral',
  'Topical',
  'Inhalation',
  'Intravenous',
  'Intramuscular',
  'Subcutaneous',
  'Ophthalmic',
  'Otic',
  'Nasal',
  'Other',
] as const
export const TIMINGS = ['Before Food', 'After Food', 'With Food', 'Empty Stomach', 'Any Time'] as const

export const PRESCRIPTION_STATUSES = ['Issued', 'Superseded', 'Cancelled'] as const

export const MEDICINE_STATUSES = ['Active', 'Inactive'] as const
export const MEDICINE_CATEGORIES = [
  'Analgesic / Antipyretic',
  'Antibiotic',
  'Antihistamine',
  'Antidiabetic',
  'Antihypertensive',
  'Lipid-lowering',
  'Gastrointestinal',
  'Respiratory',
  'Thyroid',
  'Supplement',
  'Dermatological',
  'Ophthalmic',
  'Other',
] as const

export const APPOINTMENT_TYPES = ['Consultation', 'Follow-up', 'Procedure', 'Test Review', 'Emergency', 'Teleconsult'] as const
export const APPOINTMENT_STATUSES = ['Scheduled', 'Confirmed', 'Completed', 'Cancelled', 'No Show'] as const

export const FOLLOWUP_STATUSES = ['Pending', 'Scheduled', 'Completed', 'Cancelled'] as const

export const DOCUMENT_TYPES = [
  'Blood Test Report',
  'X-Ray Report',
  'MRI Report',
  'CT Scan Report',
  'Ultrasound Report',
  'ECG',
  'Discharge Summary',
  'Other',
] as const

export const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'image/jpeg': 'JPEG',
  'image/png': 'PNG',
  'image/webp': 'WebP',
}
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024 // 10 MB
export const MAX_IMAGE_BYTES = 2 * 1024 * 1024 // 2 MB (photos, signatures)

/** Clinic working hours used by the calendar views. */
export const CLINIC_DAY_START_HOUR = 8
export const CLINIC_DAY_END_HOUR = 20
export const DEFAULT_SLOT_MINUTES = 15
