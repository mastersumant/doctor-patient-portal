# REST API contract (for the future backend)

This build has no backend; the UI calls the service layer directly. This document is the contract a backend should implement so the frontend can switch to `VITE_STORAGE_TYPE=API` without page changes. Each endpoint maps 1:1 to a service method in `src/services/`, and request bodies are the Zod input types in `src/validations/schemas.ts`.

## Conventions

- Base path `/api`. JSON in and out, except file upload (multipart) and file/xlsx downloads.
- **Authentication:** every endpoint requires `Authorization: Bearer <Clerk session token>`. The server verifies it with Clerk and derives `doctorId` from the verified session. Any `doctorId` in a request body or query is ignored.
- **Isolation:** records belonging to another doctor return `404`, exactly like missing records.
- **Lists** accept `page` (1-based), `pageSize` (max 100), `search`, `sort` (`field` or `-field`), and the filters listed per endpoint.

### Responses

```json
// success, single
{ "data": { "patientId": "PT-7K3M9Q", "fullName": "…" } }

// success, list
{ "data": [ … ], "meta": { "page": 1, "pageSize": 10, "total": 42, "totalPages": 5 } }

// error
{ "error": { "code": "VALIDATION_ERROR", "message": "Mobile number is required", "fieldErrors": { "mobile": "Enter a valid mobile number (10–15 digits)" } } }
```

| `code` (from `AppError`) | HTTP |
|---|---|
| `VALIDATION_ERROR` | 400 |
| `UNAUTHORIZED` | 401 |
| `NOT_FOUND` | 404 |
| `CONFLICT` (overlap, superseded prescription, prescribed medicine) | 409 |
| `DUPLICATE_KEY` | 409 |
| anything else | 500 (generic message; details only in server logs, never patient data) |

## Doctor

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/doctors/me` | `doctor.ensureProfile` | Creates the profile on first call |
| PUT | `/api/doctors/me` | `doctor.updateProfile` | Body: `DoctorProfileInput` |
| PUT | `/api/doctors/me/signature` | `doctor.setSignature` | multipart `file` (JPEG/PNG/WebP ≤ 2 MB) |
| DELETE | `/api/doctors/me/signature` | `doctor.removeSignature` | |

## Patients

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/patients` | `patients.list` | `search` (name, ID, mobile), `status`, `gender`, `archived=true`, `sort=name\|newest\|oldest\|id`. Items include `age`, `lastVisit`, `nextFollowUp` |
| POST | `/api/patients` | `patients.create` | Body: `PatientInput` → 201 |
| GET | `/api/patients/:id` | `patients.getDetail` | |
| PUT | `/api/patients/:id` | `patients.update` | |
| DELETE | `/api/patients/:id` | `patients.archive` | Soft delete; history kept |
| POST | `/api/patients/:id/restore` | `patients.restore` | |
| PUT / DELETE | `/api/patients/:id/photo` | `patients.setPhoto` / `removePhoto` | multipart `file` |
| GET | `/api/patients/:id/timeline` | `analytics.timeline` | Chronological events |
| GET | `/api/patients/:id/visits` | `visits.listForPatient` | Includes diagnoses |
| GET | `/api/patients/:id/vitals` | `visits.vitalsHistory` | |
| GET | `/api/patients/:id/diagnoses` | `diagnoses.listForPatient` | |
| GET | `/api/patients/:id/prescriptions` | `prescriptions.list({ patientId })` | |
| GET | `/api/patients/:id/documents` | `documents.listForPatient` | |
| GET | `/api/patients/search?q=` | `patients.search` | Compact options for pickers |

## Visits and diagnoses

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/visits` | `visits.list` | `search`, `patientId`, `visitType`, `from`, `to` |
| POST | `/api/visits` | `visits.create` | Body: `VisitInput` with `diagnoses[]`. Creates the follow-up and completes `appointmentId` if given |
| GET | `/api/visits/:id` | `visits.get` | |
| PUT | `/api/visits/:id` | `visits.update` | Diagnoses synced: kept, added, removed (soft) |
| DELETE | `/api/visits/:id` | `visits.archive` | Soft delete |
| PATCH | `/api/diagnoses/:id` | `diagnoses.setStatus` | Body: `{ "status": "Resolved" }` |

## Prescriptions

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/prescriptions` | `prescriptions.list` | `search`, `patientId`, `from`, `to`, `includeSuperseded=true` |
| POST | `/api/prescriptions` | `prescriptions.create` | Body: `PrescriptionInput` (`items[]` ≥ 1) → version 1 |
| GET | `/api/prescriptions/:id` | `prescriptions.get` | Includes `items` and `versions[]` |
| PUT | `/api/prescriptions/:id` | `prescriptions.revise` | **Does not overwrite.** Issues version N+1 (new ID, same `rxNumber`) and marks `:id` Superseded. `editReason` required. 409 if `:id` is not the current issued version. Returns the new version |
| POST | `/api/prescriptions/:id/cancel` | `prescriptions.cancel` | Body: `{ "reason": "…" }` |
| GET | `/api/prescriptions/:id/pdf` | (server-side render of the same layout) | `application/pdf` |

## Medicines

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/medicines` | `medicines.list` | `search`, `status`, `category` |
| GET | `/api/medicines/search?q=` | `medicines.searchActive` | Active only, for the prescription picker |
| POST | `/api/medicines` | `medicines.create` | 409 if name + strength already exists |
| PUT | `/api/medicines/:id` | `medicines.update` | |
| PATCH | `/api/medicines/:id/status` | `medicines.setStatus` | Body: `{ "status": "Inactive" }` |
| DELETE | `/api/medicines/:id` | `medicines.delete` | 409 if it appears on any prescription |

## Appointments

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/appointments` | `appointments.list` | `from`, `to`, `status`, `patientId`, `search`, `order` |
| GET | `/api/appointments/conflicts` | `appointments.findConflicts` | `date`, `startTime`, `endTime`, `excludeId` |
| POST | `/api/appointments` | `appointments.create` | 409 on overlap. `followUpId` marks that follow-up Scheduled |
| PUT | `/api/appointments/:id` | `appointments.update` | Reschedule or edit; 409 on overlap |
| PATCH | `/api/appointments/:id/status` | `appointments.setStatus` | Confirmed, Completed, Cancelled, No Show |
| DELETE | `/api/appointments/:id` | `appointments.archive` | Soft delete |

## Follow-ups

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/followups` | `followUps.list` | `bucket=open\|overdue\|upcoming\|completed\|all`, `search`, `patientId` |
| GET | `/api/followups/counts` | `followUps.counts` | `{ overdue, dueThisWeek, open }` |
| POST | `/api/followups` | `followUps.create` | |
| PUT | `/api/followups/:id` | `followUps.update` | |
| PATCH | `/api/followups/:id/status` | `followUps.setStatus` | |

## Documents

| Method | Path | Service | Notes |
|---|---|---|---|
| GET | `/api/documents` | `documents.list` | `search`, `type`, `patientId` |
| POST | `/api/documents` | `documents.upload` | multipart: `file` + `DocumentInput` fields. PDF/JPEG/PNG/WebP by content, ≤ 10 MB |
| GET | `/api/documents/:id/file` | `documents.getFile` | Streams the file with its stored MIME type; `Content-Disposition: attachment` |
| DELETE | `/api/documents/:id` | `documents.archive` | Soft delete |

## Dashboard, reports, workspace

| Method | Path | Service |
|---|---|---|
| GET | `/api/dashboard` | `analytics.dashboard` |
| GET | `/api/notifications` | `analytics.notifications` |
| GET | `/api/reports/practice?from=&to=` | `analytics.report` |
| GET | `/api/reports/patients/:id` | `analytics.patientReport` |
| GET | `/api/workspace/export` | `data.exportWorkbook` (xlsx) |
| POST | `/api/workspace/import` | `data.importWorkbook` (multipart xlsx; all-or-nothing) |
| POST | `/api/workspace/sample-data` | `data.loadSampleData` |
| GET | `/api/audit-logs` | `audit.list` |
