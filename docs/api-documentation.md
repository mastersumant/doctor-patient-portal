# API

When the frontend is built with `VITE_STORAGE_TYPE=API`, every read and write goes to one Netlify Function (`netlify/functions/api.mts`, served at `/api/*`). The function verifies the caller's Clerk session, then runs the **same service code** the browser runs in local mode, against Supabase Postgres.

The API is a small RPC: one URL per service method. This keeps the server and the browser running identical business rules (isolation, prescription versioning, overlap checks, audit), with no second implementation of each endpoint to drift out of sync.

## Calling a method

```
POST /api/rpc/<service>/<method>
Authorization: Bearer <Clerk session token>
Content-Type: application/json

{"args": [ ...positional arguments... ]}
```

When an argument is a file (document upload, photo, signature, Excel import), the body is `multipart/form-data` instead: a field `args` with the JSON (each file replaced by `{"$blob": n}`) and parts named `blob0`, `blob1`, ….

**Success:** `200` with `{"result": ...}`. When the result is a file (`patients.getPhoto`, `data.exportWorkbook`) or contains one (`documents.getFile`), the body is the file itself; header `x-rpc-result` says which, and `x-rpc-meta` carries the other fields as base64url JSON.

**Errors:** JSON `{"error": {"code", "message", "fieldErrors"?}}`.

| Code | HTTP | When |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Input fails the shared Zod schemas; `fieldErrors` maps field paths to messages |
| `UNAUTHORIZED` | 401 | Missing, expired, forged or wrong-origin session token |
| `NOT_FOUND` | 404 | Record doesn't exist **or belongs to another doctor** (indistinguishable on purpose); also unknown methods |
| `CONFLICT` | 409 | Overlapping appointment, revising a superseded prescription, deleting a prescribed medicine |
| `DUPLICATE_KEY` | 409 | ID collision |
| `PAYLOAD_TOO_LARGE` | 413 | Request body over the function limit |
| `INTERNAL` | 500 | Anything else; the server logs only the operation name and error type, never request data |
| `SERVER_NOT_CONFIGURED` | 500 | `DATABASE_URL` or `CLERK_SECRET_KEY` missing |

All responses carry `Cache-Control: no-store`.

## Identity and isolation

- The doctor ID for every query is the `sub` claim of the verified Clerk token. Nothing in the request body or headers can change it.
- The token's signature, expiry and issuing origin (`azp`) are checked with `@clerk/backend`. Allowed origins come from `CLERK_AUTHORIZED_PARTIES`, or default to the site URLs Netlify provides.
- Optional headers `x-user-name`, `x-user-email`, `x-user-image` (base64url) prefill a brand-new doctor profile. They are display hints only.
- Every repository statement includes `doctor_id = <verified user>`.

## Methods

Only these methods are callable (`src/services/rpcMethods.ts`); anything else returns 404. Arguments and results are exactly those of the service methods in `src/services/`.

| Service | Read | Write |
|---|---|---|
| `doctor` | getCurrent, getSignatureDataUrl | ensureProfile, updateProfile, setSignature, removeSignature |
| `patients` | list, get, getDetail, search, options, counts, getPhoto | create, update, archive, restore, setPhoto, removePhoto |
| `visits` | list, listForPatient, get, vitalsHistory, latestForPatient | create, update, archive |
| `diagnoses` | listForPatient, listForVisit, knownNames | setStatus |
| `prescriptions` | list, get, recent | create, revise, cancel |
| `medicines` | list, searchActive, get, categories | create, update, setStatus, delete |
| `appointments` | list, range, upcoming, get, findConflicts, todayCount | create, update, reschedule, setStatus, archive |
| `followUps` | list, counts, get | create, update, setStatus |
| `documents` | list, listForPatient, getFile | upload, archive |
| `analytics` | dashboard, report, patientReport, timeline, notifications | |
| `audit` | list | |
| `data` | exportWorkbook, isEmpty | importWorkbook, loadSampleData, clearWorkspace |

Example: list page 2 of active patients matching "rao".

```bash
curl -X POST https://your-site.netlify.app/api/rpc/patients/list \
  -H "Authorization: Bearer $CLERK_SESSION_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"args":[{"search":"rao","status":"Active","page":2,"pageSize":10}]}'
```

## Health check

`GET /api/health` (no sign-in) returns `{"status":"ok","database":"ok"}`, or `"database":"unreachable"` when the database can't be reached. Use it to confirm a deploy is wired up.

## Limits

- Request and response bodies: 6 MB (Netlify). Document uploads are capped at **4 MB** in API mode; photos and signatures at 2 MB.
- Functions time out after 60 seconds.
- Binary files are stored in Postgres (`clinicdesk.stored_files`) behind the `FileStore` interface, so they can move to object storage later without API changes.
