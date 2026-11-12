# Architecture

## Layers

```
React pages and components
        │  useServices(): the Services interface
        ├─────────────────────────────────────────────┐
        │ browser mode                                │ server mode (VITE_STORAGE_TYPE=API)
        ▼                                             ▼
Business services (src/services)              HTTP client (src/data/http)
        │                                             │  POST /api/rpc/<service>/<method> + Clerk token
        ▼                                             ▼
IndexedDB / in-memory repositories            Netlify Function (netlify/functions/api.mts)
                                                      │  verify token → same business services
                                                      ▼
                                              Postgres repositories (src/server/postgres) → Supabase
```

The business services are plain TypeScript with no React or browser dependencies, so the **same code** runs in the browser (browser mode) and inside the Netlify Function (server mode). Repository contracts (`src/data/repositories/interfaces.ts`) have three implementations: IndexedDB, in-memory and PostgreSQL. The service test suite runs against all three.

The HTTP client implements the same `Services` TypeScript interface as the services, so pages don't know which mode they're in. Write calls notify the client's change bus, so open lists refresh the same way in both modes.

### Server specifics

- `src/server/apiHandler.ts` is platform-neutral (Web `Request`/`Response`). The Netlify Function and the local `npm run dev:api` server both use it.
- Only methods listed in `src/services/rpcMethods.ts` are reachable. Internal helpers (for example creating a follow-up from a visit) can't be called directly.
- The database connection is created once per warm function instance (one pooled connection, prepared statements off for Supabase's transaction pooler).
- Tables are in a dedicated `clinicdesk` schema with row-level security enabled and no policies, so Supabase's Data API can't expose them; the function connects as the table owner.
- Files (documents, photos, signatures) are stored in `clinicdesk.stored_files` behind the `FileStore` contract.

## Doctor-level isolation

Isolation is enforced twice:

- **Repository contract.** Every clinical repository method takes `doctorId` as its first argument. `findById` returns `null` for another doctor's row, `update` throws `NotFoundError`, `insert` stamps the caller's `doctorId`, and the tenant key cannot be changed by a patch. A SQL implementation applies `WHERE doctor_id = $1` to every statement (row-level security on `doctor_id` is a sensible second guard).
- **Services.** The doctor ID comes from the auth session (`BaseService.doctorId()`), never from form input. Cross-references are checked: a visit, prescription, appointment or document can only reference a patient (and visit) in the same workspace. Missing and foreign records produce the same "not found" result, so existence isn't leaked.

Tests cover both levels (`tests/services.test.ts → isolates each doctor's records`).

In **server mode** the doctor ID comes from the verified Clerk token's `sub` claim on the server; the browser can't influence it. In **browser mode** the browser holds the data, so someone with access to the device profile can read IndexedDB with developer tools; that is acceptable only for synthetic demo data.

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

In Postgres, the prescription save is one transaction. Foreign keys enforce parent links (patient → visit → diagnosis, prescription → medicine lines); the circular cross-links between visits, appointments and follow-ups are checked by the app instead, so bulk imports can load tables in a fixed order.

## Front-end structure

- `useQuery(fn, deps)` runs a service call, keeps showing current data while refreshing, and re-runs whenever any service emits a change on the `ChangeBus`, so every open list stays current after edits.
- Forms use React Hook Form with the same Zod schemas the services re-validate on write; service validation errors map back onto form fields (`applyServerErrors`).
- Routes, Clerk, ExcelJS, jsPDF and the calendar are code-split, so the initial bundle carries only the shell and data layer.
- Design tokens live in `src/index.css` (`@theme`). Typeface: Atkinson Hyperlegible Next, self-hosted, chosen for unambiguous 1/l/I and 0/O in doses and IDs. Chart colours were checked with a colour-vision-deficiency validator against the white surface.
