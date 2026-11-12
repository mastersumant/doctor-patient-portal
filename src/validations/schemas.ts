/**
 * Input schemas shared by forms (via react-hook-form) and by the service layer,
 * which re-validates every write. Form values stay as strings for numeric inputs;
 * services convert them to numbers/nulls, so the schemas have no transforms and
 * input type === output type.
 */
import { z } from 'zod'
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
  ROUTES,
  SEVERITIES,
  TIMINGS,
  VISIT_TYPES,
} from '@/domain/constants'

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
const PHONE = /^\+?[0-9][0-9\s-]{8,16}[0-9]$/

const text = (max = 2000) => z.string().trim().max(max, `Keep this under ${max} characters`)
const requiredText = (label: string, max = 200) =>
  z.string().trim().min(1, `${label} is required`).max(max, `Keep this under ${max} characters`)

const isoDate = (label: string) =>
  z
    .string()
    .regex(ISO_DATE, `Enter a valid ${label.toLowerCase()}`)
    .refine((v) => !Number.isNaN(new Date(v + 'T00:00:00').getTime()), `Enter a valid ${label.toLowerCase()}`)

const optionalIsoDate = (label: string) => z.union([z.literal(''), isoDate(label)])

const phone = (label: string) => z.string().trim().regex(PHONE, `Enter a valid ${label.toLowerCase()} (10–15 digits)`)
const optionalPhone = (label: string) => z.union([z.literal(''), phone(label)])

const optionalEmail = z.union([z.literal(''), z.string().trim().email('Enter a valid email address')])

/** Optional numeric field captured as a string from an <input>. */
export const optionalNumber = (label: string, min: number, max: number) =>
  z
    .string()
    .trim()
    .refine(
      (v) => v === '' || (/^-?\d+(\.\d+)?$/.test(v) && Number(v) >= min && Number(v) <= max),
      `${label} must be between ${min} and ${max}`,
    )

const todayIso = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/* ---------------- Doctor ---------------- */

export const doctorProfileSchema = z.object({
  fullName: requiredText('Full name', 120),
  email: z.string().trim().email('Enter a valid email address'),
  specialization: requiredText('Specialization', 120),
  qualifications: requiredText('Qualifications', 200),
  registrationNumber: requiredText('Registration number', 60),
  clinicName: requiredText('Clinic name', 160),
  clinicAddress: text(400),
  contactNumber: optionalPhone('Contact number'),
  experienceYears: optionalNumber('Experience', 0, 70),
})
export type DoctorProfileInput = z.infer<typeof doctorProfileSchema>

/* ---------------- Patient ---------------- */

export const patientSchema = z.object({
  fullName: requiredText('Full name', 120),
  dob: isoDate('Date of birth')
    .refine((v) => v <= todayIso(), 'Date of birth cannot be in the future')
    .refine((v) => Number(v.slice(0, 4)) >= new Date().getFullYear() - 130, 'Check the year of birth'),
  gender: z.enum(GENDERS, { message: 'Choose a gender' }),
  bloodGroup: z.enum(BLOOD_GROUPS),
  mobile: phone('Mobile number'),
  email: optionalEmail,
  address: text(400),
  emergencyContactName: text(120),
  emergencyContactNumber: optionalPhone('Emergency contact number'),
  allergies: text(),
  existingConditions: text(),
  chronicDiseases: text(),
  previousSurgeries: text(),
  familyHistory: text(),
  currentMedications: text(),
  medicalNotes: text(4000),
  registrationDate: isoDate('Registration date'),
  status: z.enum(PATIENT_STATUSES),
})
export type PatientInput = z.infer<typeof patientSchema>

/* ---------------- Diagnosis ---------------- */

export const diagnosisSchema = z.object({
  diagnosisId: z.string().optional(),
  name: requiredText('Diagnosis', 200),
  icd10Code: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === '' || /^[A-Z][0-9][0-9A-Z](\.[0-9A-Z]{1,4})?$/.test(v), 'Use ICD-10 format, e.g. J06.9'),
  description: text(),
  symptoms: text(),
  diagnosisDate: isoDate('Diagnosis date'),
  severity: z.enum(SEVERITIES),
  status: z.enum(DIAGNOSIS_STATUSES),
  treatmentNotes: text(),
})
export type DiagnosisInput = z.infer<typeof diagnosisSchema>

/* ---------------- Visit ---------------- */

export const visitSchema = z
  .object({
    patientId: z.string().min(1, 'Choose a patient'),
    visitDate: isoDate('Visit date'),
    visitTime: z.string().regex(TIME, 'Enter a valid time'),
    visitType: z.enum(VISIT_TYPES),
    chiefComplaint: requiredText('Chief complaint', 300),
    symptoms: text(),
    bpSystolic: optionalNumber('Systolic BP', 50, 260),
    bpDiastolic: optionalNumber('Diastolic BP', 30, 160),
    heartRate: optionalNumber('Heart rate', 20, 250),
    temperatureF: optionalNumber('Temperature', 90, 110),
    respiratoryRate: optionalNumber('Respiratory rate', 4, 80),
    spo2: optionalNumber('SpO₂', 50, 100),
    weightKg: optionalNumber('Weight', 0.5, 400),
    heightCm: optionalNumber('Height', 30, 250),
    observations: text(4000),
    treatmentPlan: text(4000),
    notes: text(4000),
    followUpDate: optionalIsoDate('Follow-up date'),
    appointmentId: z.string().optional(),
    diagnoses: z.array(diagnosisSchema),
  })
  .refine((v) => (v.bpSystolic === '') === (v.bpDiastolic === ''), {
    message: 'Enter both systolic and diastolic values',
    path: ['bpDiastolic'],
  })
  .refine((v) => v.bpSystolic === '' || Number(v.bpSystolic) > Number(v.bpDiastolic), {
    message: 'Systolic must be higher than diastolic',
    path: ['bpSystolic'],
  })
  .refine((v) => v.followUpDate === '' || v.followUpDate >= v.visitDate, {
    message: 'Follow-up must be on or after the visit date',
    path: ['followUpDate'],
  })
export type VisitInput = z.infer<typeof visitSchema>

/* ---------------- Medicine catalog ---------------- */

export const medicineSchema = z.object({
  name: requiredText('Medicine name', 160),
  genericName: text(160),
  brandName: text(160),
  manufacturer: text(160),
  composition: text(400),
  strength: text(60),
  dosageForm: z.enum(DOSAGE_FORMS),
  route: z.enum(ROUTES),
  category: text(80),
  description: text(1000),
  status: z.enum(MEDICINE_STATUSES),
})
export type MedicineInput = z.infer<typeof medicineSchema>

/* ---------------- Prescription ---------------- */

export const prescriptionItemSchema = z.object({
  medicineId: z.string().optional(),
  medicineName: requiredText('Medicine name', 160),
  genericName: text(160),
  strength: text(60),
  dosage: requiredText('Dosage', 60),
  dosageForm: z.enum(DOSAGE_FORMS),
  frequency: z.enum(FREQUENCIES),
  route: z.enum(ROUTES),
  duration: requiredText('Duration', 60),
  quantity: text(60),
  timing: z.enum(TIMINGS),
  instructions: text(300),
})
export type PrescriptionItemInput = z.infer<typeof prescriptionItemSchema>

export const prescriptionSchema = z
  .object({
    patientId: z.string().min(1, 'Choose a patient'),
    visitId: z.string().optional(),
    prescriptionDate: isoDate('Prescription date'),
    diagnosis: text(400),
    instructions: text(2000),
    followUpDate: optionalIsoDate('Follow-up date'),
    editReason: text(300),
    items: z.array(prescriptionItemSchema).min(1, 'Add at least one medicine'),
  })
  .refine((v) => v.followUpDate === '' || v.followUpDate >= v.prescriptionDate, {
    message: 'Follow-up must be on or after the prescription date',
    path: ['followUpDate'],
  })
export type PrescriptionInput = z.infer<typeof prescriptionSchema>

/* ---------------- Appointment ---------------- */

export const appointmentSchema = z
  .object({
    patientId: z.string().min(1, 'Choose a patient'),
    date: isoDate('Date'),
    startTime: z.string().regex(TIME, 'Enter a valid start time'),
    endTime: z.string().regex(TIME, 'Enter a valid end time'),
    type: z.enum(APPOINTMENT_TYPES),
    reason: text(300),
    status: z.enum(APPOINTMENT_STATUSES),
    notes: text(1000),
    followUpId: z.string().optional(),
  })
  .refine((v) => v.endTime > v.startTime, { message: 'End time must be after start time', path: ['endTime'] })
export type AppointmentInput = z.infer<typeof appointmentSchema>

/* ---------------- Follow-up ---------------- */

export const followUpSchema = z.object({
  patientId: z.string().min(1, 'Choose a patient'),
  visitId: z.string().optional(),
  dueDate: isoDate('Due date'),
  reason: requiredText('Reason', 300),
  status: z.enum(FOLLOWUP_STATUSES),
  notes: text(1000),
})
export type FollowUpInput = z.infer<typeof followUpSchema>

/* ---------------- Document ---------------- */

export const documentSchema = z.object({
  patientId: z.string().min(1, 'Choose a patient'),
  visitId: z.string().optional(),
  name: requiredText('Document name', 160),
  type: z.enum(DOCUMENT_TYPES),
  description: text(1000),
  uploadDate: isoDate('Upload date'),
})
export type DocumentInput = z.infer<typeof documentSchema>
