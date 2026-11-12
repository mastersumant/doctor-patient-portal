import type { PatientReportData, ReportData } from '@/services/analyticsService'
import { formatBp } from '@/utils/clinical'
import { formatDate, formatDateTime } from '@/utils/dates'
import { buildWorkbook, workbookToBlob, type SheetData } from './excelWorkbook'

const cols = (...keys: Array<[string, string, number?]>) => keys.map(([key, header, width]) => ({ key, header, width }))

export async function exportPracticeReport(r: ReportData, clinicName: string): Promise<Blob> {
  const sheets: SheetData[] = [
    {
      name: 'Summary',
      columns: cols(['metric', 'Metric', 34], ['value', 'Value', 16]),
      rows: [
        { metric: 'Clinic', value: clinicName },
        { metric: 'Period', value: `${formatDate(r.range.from)} to ${formatDate(r.range.to)}` },
        { metric: 'Registered patients (to end of period)', value: r.totals.registeredPatients },
        { metric: 'New patients', value: r.totals.newPatients },
        { metric: 'Visits', value: r.totals.visits },
        { metric: 'Unique patients seen', value: r.totals.uniquePatientsSeen },
        { metric: 'Prescriptions issued', value: r.totals.prescriptions },
        { metric: 'Upcoming appointments (from today)', value: r.totals.upcomingAppointments },
        { metric: 'Pending follow-ups (today)', value: r.totals.pendingFollowUps },
        { metric: 'Overdue follow-ups (today)', value: r.totals.overdueFollowUps },
      ],
    },
    {
      name: 'New patients by month',
      columns: cols(['label', 'Month', 14], ['count', 'New patients', 14]),
      rows: r.newPatientsByMonth.map((p) => ({ label: p.label, count: p.count })),
    },
    {
      name: 'Most common diagnoses',
      columns: cols(['label', 'Diagnosis', 40], ['count', 'Count', 10]),
      rows: r.topDiagnoses.map((p) => ({ label: p.label, count: p.count })),
    },
    {
      name: 'Visits',
      columns: cols(['date', 'Date and time', 22], ['patient', 'Patient', 24], ['patientId', 'Patient ID', 12], ['type', 'Type', 18], ['complaint', 'Chief complaint', 34], ['diagnosis', 'Diagnosis', 40], ['bp', 'BP', 10], ['followUp', 'Follow-up', 14]),
      rows: r.visitRows.map((v) => ({
        date: formatDateTime(v.visitDateTime),
        patient: v.patientName,
        patientId: v.patientId,
        type: v.visitType,
        complaint: v.chiefComplaint,
        diagnosis: v.diagnosisSummary,
        bp: formatBp(v.bpSystolic, v.bpDiastolic),
        followUp: v.followUpDate ? formatDate(v.followUpDate) : '',
      })),
    },
    {
      name: 'Prescriptions',
      columns: cols(['rx', 'Rx number', 12], ['version', 'Version', 9], ['date', 'Date', 14], ['patient', 'Patient', 24], ['diagnosis', 'Diagnosis', 40], ['status', 'Status', 12]),
      rows: r.prescriptionRows.map((p) => ({ rx: p.rxNumber, version: p.version, date: formatDate(p.prescriptionDate), patient: p.snapshot.patientName, diagnosis: p.diagnosis, status: p.status })),
    },
    {
      name: 'Upcoming appointments',
      columns: cols(['date', 'Date', 16], ['time', 'Time', 14], ['patient', 'Patient', 24], ['mobile', 'Mobile', 18], ['type', 'Type', 14], ['reason', 'Reason', 30], ['status', 'Status', 12]),
      rows: r.upcomingAppointments.map((a) => ({ date: formatDate(a.date), time: `${a.startTime}–${a.endTime}`, patient: a.patientName, mobile: a.patientMobile, type: a.type, reason: a.reason, status: a.status })),
    },
    {
      name: 'Pending follow-ups',
      columns: cols(['due', 'Due', 14], ['patient', 'Patient', 24], ['reason', 'Reason', 44], ['status', 'Status', 12], ['overdue', 'Overdue', 10]),
      rows: r.pendingFollowUps.map((f) => ({ due: formatDate(f.dueDate), patient: f.patientName, reason: f.reason, status: f.status, overdue: f.isOverdue ? 'Yes' : 'No' })),
    },
  ]
  return workbookToBlob(await buildWorkbook(sheets, { title: 'Practice report' }))
}

export async function exportPatientReport(r: PatientReportData): Promise<Blob> {
  const p = r.patient
  const sheets: SheetData[] = [
    {
      name: 'Patient',
      columns: cols(['field', 'Field', 28], ['value', 'Value', 60]),
      rows: [
        ['Patient ID', p.patientId],
        ['Name', p.fullName],
        ['Date of birth', formatDate(p.dob)],
        ['Age', p.age],
        ['Gender', p.gender],
        ['Blood group', p.bloodGroup],
        ['Mobile', p.mobile],
        ['Email', p.email],
        ['Address', p.address],
        ['Allergies', p.allergies],
        ['Existing conditions', p.existingConditions],
        ['Chronic diseases', p.chronicDiseases],
        ['Previous surgeries', p.previousSurgeries],
        ['Family history', p.familyHistory],
        ['Current medications', p.currentMedications],
        ['Registered', formatDate(p.registrationDate)],
        ['Status', p.deletedAt ? 'Archived' : p.status],
      ].map(([field, value]) => ({ field: String(field), value: value as string | number })),
    },
    {
      name: 'Visits',
      columns: cols(['date', 'Date and time', 22], ['type', 'Type', 18], ['complaint', 'Complaint', 30], ['bp', 'BP', 10], ['hr', 'HR', 8], ['temp', 'Temp °F', 9], ['spo2', 'SpO2', 8], ['weight', 'Weight kg', 10], ['bmi', 'BMI', 8], ['diagnosis', 'Diagnoses', 40], ['plan', 'Treatment plan', 44]),
      rows: r.visits.map((v) => ({
        date: formatDateTime(v.visitDateTime),
        type: v.visitType,
        complaint: v.chiefComplaint,
        bp: formatBp(v.bpSystolic, v.bpDiastolic),
        hr: v.heartRate,
        temp: v.temperatureF,
        spo2: v.spo2,
        weight: v.weightKg,
        bmi: v.bmi,
        diagnosis: v.diagnoses.map((d) => `${d.name}${d.icd10Code ? ` (${d.icd10Code})` : ''}`).join('; '),
        plan: v.treatmentPlan,
      })),
    },
    {
      name: 'Diagnoses',
      columns: cols(['date', 'Date', 14], ['name', 'Diagnosis', 36], ['icd', 'ICD-10', 10], ['severity', 'Severity', 12], ['status', 'Status', 12]),
      rows: r.diagnoses.map((d) => ({ date: formatDate(d.diagnosisDate), name: d.name, icd: d.icd10Code, severity: d.severity, status: d.status })),
    },
    {
      name: 'Prescriptions',
      columns: cols(['rx', 'Rx number', 12], ['version', 'Version', 9], ['date', 'Date', 14], ['status', 'Status', 12], ['medicine', 'Medicine', 30], ['dosage', 'Dosage', 16], ['frequency', 'Frequency', 16], ['timing', 'Timing', 14], ['duration', 'Duration', 12]),
      rows: r.prescriptions.flatMap((rx) =>
        rx.items.map((i) => ({
          rx: rx.rxNumber,
          version: rx.version,
          date: formatDate(rx.prescriptionDate),
          status: rx.status,
          medicine: `${i.medicineName} ${i.strength}`.trim(),
          dosage: i.dosage,
          frequency: i.frequency,
          timing: i.timing,
          duration: i.duration,
        })),
      ),
    },
    {
      name: 'Appointments',
      columns: cols(['date', 'Date', 14], ['time', 'Time', 14], ['type', 'Type', 14], ['reason', 'Reason', 30], ['status', 'Status', 12]),
      rows: r.appointments.filter((a) => !a.deletedAt).map((a) => ({ date: formatDate(a.date), time: `${a.startTime}–${a.endTime}`, type: a.type, reason: a.reason, status: a.status })),
    },
    {
      name: 'Follow-ups',
      columns: cols(['due', 'Due', 14], ['reason', 'Reason', 44], ['status', 'Status', 12]),
      rows: r.followUps.map((f) => ({ due: formatDate(f.dueDate), reason: f.reason, status: f.isOverdue ? 'Overdue' : f.status })),
    },
    {
      name: 'Documents',
      columns: cols(['date', 'Date', 14], ['name', 'Name', 34], ['type', 'Type', 20], ['file', 'File', 30]),
      rows: r.documents.filter((d) => !d.deletedAt).map((d) => ({ date: formatDate(d.uploadDate), name: d.name, type: d.type, file: d.fileName })),
    },
  ]
  return workbookToBlob(await buildWorkbook(sheets, { title: `Patient report ${p.patientId}` }))
}
