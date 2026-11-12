# Architecture

## Layers today (no backend)

```
React pages and components
        │  useServices(), useQuery()
        ▼
Business services            src/services/*        plain TypeScript, no React, no browser APIs*
        │  repository interfaces
        ▼
Repository contracts         src/data/repositories/interfaces.ts
        │
        ├── IndexedDB repositories   (default, persistent)        src/data/repositories/indexeddb/
        └── In-memory repositories   (tests, blocked-storage fallback)  src/data/repositories/memory/
```

\* `FileService` uses `Blob`, which exists in browsers and in Node 18+.

`src/data/repositories/factory.ts` is the only file that knows which implementation is in use, chosen by `VITE_STORAGE_TYPE`.

## Layers after adding a backend

```
React pages ──► HttpServices (same method names) ──► REST API (Express) ──► the same services ──► SQL / Excel repositories
```

The move is mechanical:

1. Copy `src/domain`, `src/validations`, `src/services` and `src/data/repositories/interfaces.ts` into the backend. They have no UI dependencies.
2. Implement the repository contracts for PostgreSQL/MySQL (Prisma or Sequelize) or ExcelJS files. Use `docs/schema.postgresql.sql` / `schema.mysql.sql` as the starting schema; they are generated from `src/data/schema/tables.ts`.
3. Expose each service method as an endpoint per [api-documentation.md](api-documentation.md). Controllers stay thin: parse the request, call the service, map `AppError` codes to HTTP statuses.
4. Build `Session` from the **verified Clerk session token** on the server (`@clerk/express` middleware) instead of the browser. Services already read the doctor ID only from `Session.getIdentity()`, never from request bodies.
5. In the frontend, implement `Services` with `fetch` calls (the TypeScript interface in `src/services/index.ts` guarantees the same shape) and register it in `ServicesProvider` when `VITE_STORAGE_TYPE=API`. Pages and components don't change.

## Doctor-level isolation

Isolation is enforced twice:

- **Repository contract.** Every clinical repository method takes `doctorId` as its first argument. `findById` returns `null` for another doctor's row, `update` throws `NotFoundError`, `insert` stamps the caller's `doctorId`, and the tenant key cannot be changed by a patch. A SQL implementation applies `WHERE doctor_id = $1` to every statement (row-level security on `doctor_id` is a sensible second guard).
- **Services.** The doctor ID comes from the auth session (`BaseService.doctorId()`), never from form input. Cross-references are checked: a visit, prescription, appointment or document can only reference a patient (and visit) in the same workspace. Missing and foreign records produce the same "not found" result, so existence isn't leaked.

Tests cover both levels (`tests/services.test.ts → isolates each doctor's records`).

**Limit of a frontend-only build:** the browser holds the data, so someone with access to the device profile can read IndexedDB with developer tools. That is acceptable only for synthetic demo data. With the backend, data never reaches a browser that isn't entitled to it.

## Clinical-record rules

| Rule | Where |
|---|---|
| Soft delete for patients, visits, diagnoses, appointments and documents (`deletedAt`) | services; queries exclude deleted rows unless `includeDeleted` |
| Issued prescriptions are immutable; revising issues version N+1 with the same Rx number, marks N `Superseded` and links them | `PrescriptionService.revise`, `PrescriptionRepository.saveVersion` (single transaction) |
| Prescriptions snapshot patient and doctor details at issue time, so reprints match what was issued | `PrescriptionSnapshot` |
| No overlapping appointments for the same doctor (cancelled and no-show don't block) | `AppointmentService.assertNoOverlap` |
| A visit's recommended follow-up date creates/updates/cancels its follow-up | `FollowUpService.createForVisit`, `syncForVisit` |
| Booking from a follow-up marks it Scheduled; completing the appointment closes it; cancelling reopens it | `AppointmentService.afterStatusChange` |
| Medicines on issued prescriptions can't be deleted, only deactivated | `MedicineService.delete` |
| Audit entries record entity, ID, action and **field names** — never clinical values | `BaseService.audit`, `changedFields` |
| Uploads are checked by file content (magic bytes), not extension; 10 MB documents, 2 MB images | `FileService.store` |
| Binary files are stored separately from records; records keep a `fileId` reference | `FileStore` contract |

## Storage notes

IndexedDB transactions are atomic and serialised per store, which gives the guarantees the original Excel design needed file locking and atomic renames for. The prescription save writes header, lines and the supersede flag in one transaction across two stores.

An Excel repository on a future Node backend should keep a per-file async mutex, write to a temp file and `rename()` atomically, and keep the same contracts.

## Front-end structure

- `useQuery(fn, deps)` runs a service call, keeps showing current data while refreshing, and re-runs whenever any service emits a change on the `ChangeBus`, so every open list stays current after edits.
- Forms use React Hook Form with the same Zod schemas the services re-validate on write; service validation errors map back onto form fields (`applyServerErrors`).
- Routes, Clerk, ExcelJS, jsPDF and the calendar are code-split, so the initial bundle carries only the shell and data layer.
- Design tokens live in `src/index.css` (`@theme`). Typeface: Atkinson Hyperlegible Next, self-hosted, chosen for unambiguous 1/l/I and 0/O in doses and IDs. Chart colours were checked with a colour-vision-deficiency validator against the white surface.
