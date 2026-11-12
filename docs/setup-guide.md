# Setup guide

## 1. Run locally

Requirements: Node.js 20.19 or newer (tested on Node 22) and npm.

```bash
npm install
npm run dev               # http://localhost:5173
```

Open the app and choose a demo workspace, or set up Clerk (below) to sign in.

Other commands:

```bash
npm test                  # 32 tests, both storage implementations
npm run build             # type-check + production build → dist/
npm run preview           # serve dist/ at http://localhost:4173
npm run generate:data     # refresh data/*.xlsx and docs/schema.*.sql
```

### Where the data is

Data is stored in the browser's IndexedDB database `clinicdesk` on the current device and browser profile. It survives reloads, closing the browser and restarting the computer. Each browser profile is a separate store.

- Move a workspace: **Settings → Data and storage → Export to Excel**, then **Import from Excel** elsewhere.
- Start over: **Settings → Data and storage → Delete all records**, or clear site data for the app's address in the browser. Demo workspaces are re-created the next time the app opens if they were removed with site data.

## 2. Set up Clerk sign-in (Google, Facebook, email)

### 2.1 Create the Clerk application

1. Sign up at [clerk.com](https://clerk.com) and create an application.
2. In the sign-in options, keep **Email** (with password or code, as you prefer) and add **Google** and **Facebook**. You can change these later.
3. Open **API keys** in the Clerk Dashboard and copy the **Publishable key** (`pk_test_…` for development).
4. Create `.env.local` in the project root:

   ```bash
   VITE_CLERK_PUBLISHABLE_KEY=pk_test_xxxxxxxxxxxxxxxxxxxx
   ```

5. Restart `npm run dev`. The sign-in page now shows Clerk's sign-in form. With a key set, demo workspaces are hidden unless `VITE_ENABLE_DEMO_MODE=true`.

The publishable key is designed to be public. **Never** put the secret key (`sk_…`) in any `VITE_` variable; it belongs only on the future backend.

### 2.2 Google and Facebook in development

In a Clerk **development** instance, Google and Facebook work immediately with Clerk's shared OAuth credentials. Enable them in **SSO connections → Add connection → For all users → Google / Facebook**. No Google or Meta setup is needed to try them on `localhost`.

### 2.3 Google for production

1. Clerk Dashboard → **SSO connections** → Google. Turn on **Enable for sign-up and sign-in** and **Use custom credentials**. Copy the **Authorized Redirect URI** shown.
2. [Google Cloud Console](https://console.cloud.google.com/) → select or create a project → **APIs & Services → Credentials → Create Credentials → OAuth client ID** (configure the OAuth consent screen first if asked).
3. Application type **Web application**. Add your site under **Authorized JavaScript origins**. Paste Clerk's URI under **Authorized redirect URIs**. Create, then copy the **Client ID** and **Client Secret**.
4. Paste both into the Google connection in Clerk and save.
5. New Google OAuth apps start in **Testing** (limited to test users). Move the app to **In production** on the Google Auth Platform **Audience** page before launch; Google may require verification.

### 2.4 Facebook for production

1. Clerk Dashboard → **SSO connections** → Facebook. Turn on **Enable for sign-up and sign-in** and **Use custom credentials**. Copy the **Redirect URI**.
2. [Meta for Developers](https://developers.facebook.com/) → **My Apps → Create app**. Under **Use cases**, add *Authenticate and request data from users with Facebook Login*, and add the **email** permission.
3. **Facebook Login → Settings**: paste Clerk's URI into **Valid OAuth Redirect URIs** and save.
4. **App settings → Basic**: copy the **App ID** and **App Secret**, paste them into the Facebook connection in Clerk and save.

### 2.5 Test sign-in

Sign in through the app (or the Account Portal sign-in page in the Clerk Dashboard). On first sign-in the app asks for the clinic profile and can load sample patients. If an SSO sign-in fails, check **Application Logs** in the Clerk Dashboard for an `oauth_callback.failed` event.

The Clerk integration in this build has not been run against a live Clerk instance, because no key was available while building it. Steps 2.1–2.2 are the quickest way to confirm it in your environment.

## 3. Deploy (static hosting)

The production build is static files in `dist/`.

- **With clean URLs** (`VITE_ROUTER_MODE=browser`, default): configure the host to serve `index.html` for unknown paths (Netlify `_redirects`: `/* /index.html 200`; Vercel rewrites; nginx `try_files $uri /index.html;`). Use this mode with Clerk and add the production domain in Clerk.
- **From any folder** (no rewrites possible): `npm run build:static` builds with hash URLs (`/#/patients/…`) and relative asset paths. Best for demo mode.

Serve over HTTPS. Remember that this frontend-only build keeps data in each visitor's browser and is meant for synthetic data.

## 4. Configuration reference

See [`.env.example`](../.env.example).

| Variable | Default | Purpose |
|---|---|---|
| `VITE_APP_NAME` | ClinicDesk | Product name in the UI |
| `VITE_CLERK_PUBLISHABLE_KEY` | empty | Turns on Clerk sign-in |
| `VITE_ENABLE_DEMO_MODE` | on without Clerk, off with it | Offer the two synthetic demo workspaces |
| `VITE_STORAGE_TYPE` | `INDEXEDDB` | `INDEXEDDB` or `MEMORY` |
| `VITE_ROUTER_MODE` | `browser` | `browser`, `hash` or `memory` (embedded previews) |
| `VITE_SANDBOX_PREVIEW` | `false` | Hide Print and explain blocked downloads inside sandboxed preview frames |

## 5. Before handling real patient data

Required, in this order: build the backend per [api-documentation.md](api-documentation.md) with server-side Clerk token verification on every endpoint; move to PostgreSQL or MySQL using the generated schema; encrypt data at rest and in transit; set up backups and retention; restrict file storage; review against the healthcare-data rules that apply to you (for example India's DPDP Act, HIPAA in the US, GDPR in the EU).
