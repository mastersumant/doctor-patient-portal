# ClinicDesk: Doctor–Patient Management Portal

A React + TypeScript portal for doctors to manage patients, visits and vitals, diagnoses, versioned prescriptions with PDF output, a medicine catalog, appointments, follow-ups, documents, dashboards and reports.

It runs in two modes, chosen by `VITE_STORAGE_TYPE`:

- **Browser mode** (default): records are stored in the browser on one device. Good for demos; no backend needed.
- **Server mode** (`API`): records are stored in **Supabase Postgres** through one **Netlify Function** that verifies each request's Clerk session. Records saved on any device appear on all of them. This is what `netlify.toml` deploys.

Both modes run the same plain-TypeScript service layer (all business rules) over storage-specific repositories, so behaviour is identical. See [docs/architecture.md](docs/architecture.md).

> Browser mode is for synthetic data only. For real patients, use server mode on Supabase's Pro plan and read section 6 of the setup guide.

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

Step-by-step Clerk, Supabase and Netlify setup: [docs/setup-guide.md](docs/setup-guide.md).

### Server mode locally

```bash
# .env.local: VITE_STORAGE_TYPE=API, VITE_CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY
npm run dev:api        # API on :8787 with an embedded Postgres (or your Supabase via DATABASE_URL)
npm run dev            # app on :5173, /api proxied to the API
```

### Deploy

Create a Supabase project, run `npm run db:migrate`, set `VITE_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` and `DATABASE_URL` in Netlify, and deploy. `/api/health` confirms the database connection.

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
| `npm run dev:api` | Local API server (same code as the Netlify Function) |
| `npm run db:migrate` | Create the tables in Supabase / Postgres |
| `npm run generate:data` | Regenerate `data/*.xlsx`, `docs/schema.*.sql` and the Supabase migration from the seed and table specs |

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
│   │   ├── http/          Services over HTTP for server mode
│   │   └── seed/          deterministic synthetic demo data
│   ├── server/            API handler, Clerk verification, Postgres repositories, migration
│   ├── auth/              Clerk integration (lazy-loaded), demo mode, route guard
│   ├── context/           services/workspace providers, toasts and confirmations
│   ├── hooks/             useQuery (re-runs on any write), useDebounced
│   ├── components/        ui/ kit, charts, patient/visit/document widgets
│   ├── layouts/           app shell: sidebar, header, notifications
│   ├── pages/             one folder per module
│   └── utils/             dates, clinical maths, IDs, PDF builder
├── netlify/functions/     api.mts: the one serverless function (/api/*)
├── supabase/migrations/   generated SQL for the clinicdesk schema
├── tests/                 Vitest suites (+ PGlite-backed Postgres)
├── scripts/               data and schema generator
├── data/                  sample Excel files (one per table + importable workbooks)
└── docs/                  architecture, schema (+ .sql), API contract, setup guide
```

## Sample data

`data/` holds the original Excel layout, one file per table (`patients.xlsx`, `visits.xlsx`, `prescriptions.xlsx`, `prescription_medicines.xlsx`, …) covering both demo doctors: 2 doctors, 20 patients, 44 visits, 51 diagnoses, 45 prescriptions (two revised to version 2), 35 catalog medicines, 71 appointments, 44 follow-ups and 5 documents. All names, clinics and brands are fictional and doses are illustrative only.

`clinicdesk-sample-workspace-*.xlsx` are single workbooks in the exact layout of **Settings → Data and storage → Import**. Dates are relative to the day the files were generated; run `npm run generate:data` to refresh them.

## Testing

`npm test` runs 60 tests. The service suite runs against in-memory, IndexedDB **and real PostgreSQL** (PGlite, Postgres compiled to WebAssembly), covering CRUD, validation, doctor isolation at service and repository level, visit → follow-up → appointment links, prescription versioning and issue-time snapshots, appointment overlap rules, upload sniffing, the audit trail, seed integrity (all foreign keys valid, no overlapping slots), persistence across a new database connection, and Excel export → import round-trips including rejection of broken or foreign workbooks. The API suite drives the browser's HTTP client through the API handler into Postgres (auth, isolation, error mapping, file upload and download, Excel, method allow-list), and checks Clerk token verification with real signed tokens. The Netlify-bundled function was also executed end to end.

The UI was also exercised end to end in Chrome (registration, visits, prescriptions and PDF, revisions, booking and overlap blocking, reports and Excel export, import, uploads, reload persistence, switching doctors, phone layout) with no console errors.

## Known limitations

- In **browser mode**, anyone with access to the browser profile can read IndexedDB directly, and data stays on one device. Server mode removes both limits.
- **Not yet run against live Clerk, Supabase or Netlify accounts** (none were available while building). The server was tested with real Postgres (PGlite), real Clerk token verification using locally signed tokens, and Netlify's own bundler. Check `/api/health` after your first deploy.
- In server mode, document uploads are limited to 4 MB (Netlify's function request limit), and files are stored in Postgres.
- The downloadable PDF uses jsPDF's built-in Latin fonts; for names in other scripts, use **Print** (browser print-to-PDF renders any script).
- Temperature is recorded in °F.
- The ICD-10 list is a small offline quick-pick, not a coding service.
