# ClinicDesk: Doctor–Patient Management Portal

A React + TypeScript portal for doctors to manage patients, visits and vitals, diagnoses, versioned prescriptions with PDF output, a medicine catalog, appointments, follow-ups, documents, dashboards and reports.

This build is **frontend-only** (no backend service). All business rules live in a plain-TypeScript service layer that talks to storage through repository interfaces. Today the repositories persist to the browser's IndexedDB; workspaces export to and import from Excel. When a backend is added, the services and repository contracts move to the server unchanged and the UI swaps to an HTTP client — see [docs/architecture.md](docs/architecture.md).

> **Prototype for synthetic data only.** Data lives in the browser on one device. Do not enter real patient information until the app runs against a secured backend database with server-side Clerk verification.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

With no Clerk key, the sign-in page offers two **demo workspaces** (Dr. Ananya Mehra, general physician, 12 adult patients; Dr. Rahul Verma, paediatrician, 8 children). Demo mode is clearly labelled and is not authentication.

To turn on Google, Facebook and email sign-in, add a Clerk publishable key:

```bash
cp .env.example .env.local
# set VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
npm run dev
```

Step-by-step Clerk and SSO setup: [docs/setup-guide.md](docs/setup-guide.md).

## What's included

| Module | Highlights |
|---|---|
| Dashboard | Six headline numbers in one strip, today's appointments with "Start visit", follow-ups due (overdue first), registrations and monthly visits charts, common diagnoses, appointment statuses, recent patients and prescriptions, quick actions |
| Patients | Register/edit with full personal and medical history, age from DOB, optional photo; searchable (name, ID, mobile), filterable, paginated list; archive and restore (soft delete) |
| Patient profile | Overview with latest vitals and a chronological medical-journey timeline; tabs for medical history, visits (vitals trend charts), prescriptions, diagnoses (quick status change), appointments, reports and attachments |
| Visits | Vitals with live BMI, multiple diagnoses per visit with offline ICD-10 suggestions, treatment plan, recommended follow-up (creates a follow-up automatically), links to the originating appointment |
| Prescriptions | Multiple medicines from the catalog or typed in, allergy warning, letterhead Rx sheet, browser print and downloadable PDF with signature; **revisions issue a new version and keep the original unchanged**; cancel with reason |
| Medicines | Catalog CRUD, search, category filter, deactivate; delete only if never prescribed |
| Appointments | Day, week and month calendars plus a list view; click a slot to book; live overlap warning and service-level overlap prevention; confirm, complete, no-show, cancel, reschedule |
| Follow-ups | Open, overdue, upcoming and closed views; book an appointment from a follow-up; completing that appointment closes the follow-up |
| Reports | Practice report for any period (totals, visits over time, new patients, diagnoses, visit types, appointment statuses, upcoming, pending) and a per-patient report; export to Excel; print |
| Settings | Doctor profile and clinic letterhead, signature image, Excel export/import of the whole workspace, sample data, clear workspace, activity (audit) log |

Cross-cutting: doctor-level data isolation enforced in every repository call, soft deletion of clinical records, audit log without clinical values, content-sniffed upload validation (type and size), responsive layout down to 390 px, keyboard-accessible dialogs and comboboxes.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Type-check and production build to `dist/` |
| `npm run build:static` | Build with hash routing for hosting from any static folder |
| `npm run preview` | Serve the production build locally |
| `npm test` | Unit and integration tests (Vitest; services on both in-memory and IndexedDB storage) |
| `npm run typecheck` | TypeScript only |
| `npm run lint` | oxlint |
| `npm run generate:data` | Regenerate `data/*.xlsx` sample files and `docs/schema.*.sql` from the seed and table specs |

## Project structure

```
doctor-patient-portal/
├── src/
│   ├── domain/            entities, enums, ICD-10 quick list (no framework code)
│   ├── validations/       Zod schemas shared by forms and services
│   ├── services/          business rules: isolation, versioning, overlaps, audit
│   ├── data/
│   │   ├── repositories/  interfaces.ts, queryEngine.ts, indexeddb/, memory/, factory.ts
│   │   ├── schema/        table specs (→ Excel sheets, SQL DDL) and row codec
│   │   ├── excel/         workbook read/write (ExcelJS, lazy-loaded), report exports
│   │   └── seed/          deterministic synthetic demo data
│   ├── auth/              Clerk integration (lazy-loaded), demo mode, route guard
│   ├── context/           services/workspace providers, toasts and confirmations
│   ├── hooks/             useQuery (re-runs on any write), useDebounced
│   ├── components/        ui/ kit, charts, patient/visit/document widgets
│   ├── layouts/           app shell: sidebar, header, notifications
│   ├── pages/             one folder per module
│   └── utils/             dates, clinical maths, IDs, PDF builder
├── tests/                 Vitest suites
├── scripts/               data and schema generator
├── data/                  sample Excel files (one per table + importable workbooks)
└── docs/                  architecture, schema (+ .sql), API contract, setup guide
```

## Sample data

`data/` holds the original Excel layout, one file per table (`patients.xlsx`, `visits.xlsx`, `prescriptions.xlsx`, `prescription_medicines.xlsx`, …) covering both demo doctors: 2 doctors, 20 patients, 44 visits, 51 diagnoses, 45 prescriptions (two revised to version 2), 35 catalog medicines, 71 appointments, 44 follow-ups and 5 documents. All names, clinics and brands are fictional and doses are illustrative only.

`clinicdesk-sample-workspace-*.xlsx` are single workbooks in the exact layout of **Settings → Data and storage → Import**. Dates are relative to the day the files were generated; run `npm run generate:data` to refresh them.

## Testing

`npm test` runs 32 tests against both the in-memory and IndexedDB repositories, covering CRUD, validation, doctor isolation at service and repository level, visit → follow-up → appointment links, prescription versioning and issue-time snapshots, appointment overlap rules, upload sniffing, the audit trail, seed integrity (all foreign keys valid, no overlapping slots), persistence across a new database connection, and Excel export → import round-trips including rejection of broken or foreign workbooks.

The UI was also exercised end to end in Chrome (registration, visits, prescriptions and PDF, revisions, booking and overlap blocking, reports and Excel export, import, uploads, reload persistence, switching doctors, phone layout) with no console errors.

## Known limitations

- **No server-side enforcement yet.** Isolation is enforced in the service and repository layer and covered by tests, but anyone with access to the browser profile can read IndexedDB directly. Real enforcement needs the backend verifying Clerk session tokens, as described in the architecture doc.
- **Clerk is wired but untested against a live instance** in this build because no key was available. Without a key the app runs in demo mode only.
- Data is per browser and device. Use Excel export/import to move a workspace.
- The downloadable PDF uses jsPDF's built-in Latin fonts; for names in other scripts, use **Print** (browser print-to-PDF renders any script).
- Temperature is recorded in °F.
- The ICD-10 list is a small offline quick-pick, not a coding service.
