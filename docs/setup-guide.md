# Setup guide

ClinicDesk runs in two modes:

| | Browser mode (default) | Server mode (`VITE_STORAGE_TYPE=API`) |
|---|---|---|
| Where records live | That browser, on that device | Supabase Postgres |
| Same records on every device | No | Yes |
| Sign-in | Clerk, or demo workspaces | Clerk (required) |
| Backend | None | One Netlify Function |
| Use for | Demos, trying the app | Real use by doctors |

## 1. Run locally (browser mode)

Requirements: Node.js 20.19 or newer (tested on Node 22) and npm.

```bash
npm install
npm run dev               # http://localhost:5173
```

Pick a demo doctor on the sign-in page, or add a Clerk key (section 2).

## 2. Clerk sign-in

1. Create an application at [dashboard.clerk.com](https://dashboard.clerk.com) with **Email**, **Google** and **Facebook** sign-in.
2. **API keys** page: copy the **Publishable key** (`pk_test_…`) and the **Secret key** (`sk_test_…`).
3. In `.env.local`:

   ```bash
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_...
   CLERK_SECRET_KEY=sk_test_...      # only read by the server; never prefix it with VITE_
   ```

In a development instance, Google and Facebook work immediately with Clerk's shared credentials. For production you need a domain you own, `pk_live_`/`sk_live_` keys, and your own Google and Facebook OAuth credentials: in Clerk's **SSO connections**, turn on **Use custom credentials** for each provider and follow the redirect-URI steps it shows.

## 3. Run locally with the server (server mode)

Add to `.env.local`:

```bash
VITE_STORAGE_TYPE=API
# DATABASE_URL=...   leave empty to use an embedded Postgres stored in ./.pglite
```

Then, in two terminals:

```bash
npm run dev:api           # API on http://localhost:8787 (same code as the Netlify Function)
npm run dev               # app on http://localhost:5173, /api is proxied to 8787
```

Sign in with Clerk. On first sign-in the app asks for the clinic profile and can load sample patients. To work against your Supabase project instead of the embedded database, set `DATABASE_URL` (section 4).

## 4. Deploy: Supabase + Netlify

### 4.1 Create the Supabase project

1. At [supabase.com](https://supabase.com), create a project and save the **database password**.
2. **Region:** pick the region closest to where your Netlify Functions run. New Netlify sites run functions in **US East (Ohio)**, so choose **East US (Ohio)** for the fastest app. Every screen makes several database queries, and each one crosses the distance between the two regions.
   If patient data must stay in India, use Supabase's **South Asia (Mumbai)** region and move your Netlify Functions to **Asia Pacific (Singapore)**, the closest Netlify region. Changing the functions region needs a Netlify Pro plan (Cloud compute → Functions → Region).
3. Use the **Pro** plan for real patient data: free projects pause after a week without activity and have no automatic backups.

### 4.2 Create the tables

Click **Connect** at the top of your Supabase project. Copy two connection strings and replace `[YOUR-PASSWORD]` (percent-encode special characters such as `#`, `&`, `?`):

- **Session pooler** (port 5432): for creating tables from your computer.
- **Transaction pooler** (port 6543): for the Netlify Function.

Then either:

```bash
# .env.local
MIGRATION_DATABASE_URL=postgresql://postgres.<project-ref>:<password>@aws-...pooler.supabase.com:5432/postgres

npm run db:migrate         # prints "Database schema created."
```

or open **SQL Editor** in Supabase, paste the contents of `supabase/migrations/20261112000000_clinicdesk_init.sql`, and run it.

The tables live in their own `clinicdesk` schema with row-level security on and no policies, so Supabase's public Data API (and its anon key) can't read them. Only the Netlify Function, connecting with the database password, can.

### 4.3 Configure and deploy on Netlify

1. Push the repo to GitHub, then in Netlify: **Add new project → Import an existing project → GitHub** → your repo. `netlify.toml` supplies the build command, the function, and `VITE_STORAGE_TYPE=API`.
2. **Site configuration → Environment variables**, add:

   | Key | Value |
   |---|---|
   | `VITE_CLERK_PUBLISHABLE_KEY` | `pk_…` |
   | `CLERK_SECRET_KEY` | `sk_…` (mark as secret) |
   | `DATABASE_URL` | Supabase **Transaction pooler** string, port 6543 (mark as secret) |

   Optional: `CLERK_AUTHORIZED_PARTIES` = your site origin, e.g. `https://your-site.netlify.app`. When unset, the function uses the site URLs Netlify provides.

3. Deploy (or **Trigger deploy** after changing variables).
4. Check the wiring: open `https://<your-site>/api/health`. You should see `{"status":"ok","database":"ok"}`.
5. Open the site, sign in, complete the clinic profile. Records saved from any device now appear on all of them.

### Troubleshooting

| Symptom | Fix |
|---|---|
| `/api/health` shows `"database":"unreachable"` | Check `DATABASE_URL` is the transaction-pooler string with the right password, then redeploy |
| Every request says "Sign in to continue" | `CLERK_SECRET_KEY` must be from the same Clerk instance as the publishable key; if you set `CLERK_AUTHORIZED_PARTIES`, it must include the exact site origin |
| "The server is missing …" | Add the named variable in Netlify and redeploy |
| Uploads fail for large files | Uploads through the function are limited to 4 MB per file |
| App is slow | Database and functions are in different regions (section 4.1) |

## 5. Commands

| Command | What it does |
|---|---|
| `npm run dev` | Frontend dev server |
| `npm run dev:api` | Local API server (embedded Postgres unless `DATABASE_URL` is set) |
| `npm run db:migrate` | Create the tables in the database at `MIGRATION_DATABASE_URL` / `DATABASE_URL` |
| `npm run build` | Type-check and build to `dist/` |
| `npm test` | 60 tests: services on memory, IndexedDB and Postgres; HTTP API end to end; Clerk token checks |
| `npm run generate:data` | Regenerate sample Excel files, schema SQL and the Supabase migration |

All environment variables are described in [`.env.example`](../.env.example).

## 6. Before handling real patient data

- Supabase **Pro** plan with backups; consider point-in-time recovery.
- A custom domain with Clerk **production** keys and your own Google/Facebook credentials.
- Restrict who can sign up in Clerk (for example, invitation-only or an allowlist of email domains), since any signed-in user gets their own doctor workspace.
- Review your obligations for health data (for example India's DPDP Act).
