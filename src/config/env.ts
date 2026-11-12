
const raw = import.meta.env

const clerkPublishableKey = (raw.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim()
const demoFlag = (raw.VITE_ENABLE_DEMO_MODE ?? '').trim().toLowerCase()
const storage = (raw.VITE_STORAGE_TYPE ?? 'INDEXEDDB').trim().toUpperCase()
const storageType = (['INDEXEDDB', 'MEMORY', 'API'].includes(storage) ? storage : 'INDEXEDDB') as 'INDEXEDDB' | 'MEMORY' | 'API'

export const env = {
  appName: (raw.VITE_APP_NAME ?? '').trim() || 'ClinicDesk',
  clerkPublishableKey,
  clerkEnabled: clerkPublishableKey.startsWith('pk_'),
  /**
   * Demo mode lets you explore with the two synthetic doctor workspaces without
   * signing in. On by default only when Clerk is not configured; set
   * VITE_ENABLE_DEMO_MODE=false to disable it entirely.
   */
  // Demo workspaces live in the browser, so they are never offered when data is on the server.
  demoMode: storageType !== 'API' && (demoFlag === 'true' || (demoFlag !== 'false' && !clerkPublishableKey.startsWith('pk_'))),
  /** INDEXEDDB / MEMORY keep data in this browser; API stores it on the server (Netlify Functions + Supabase). */
  storageType,
  /** Uploads through a serverless function are capped by its request size limit. */
  maxUploadBytes: storageType === 'API' ? 4 * 1024 * 1024 : 10 * 1024 * 1024,
  routerMode: (['hash', 'memory'].includes((raw.VITE_ROUTER_MODE ?? '').trim()) ? (raw.VITE_ROUTER_MODE ?? '').trim() : 'browser') as
    | 'browser'
    | 'hash'
    | 'memory',
  /** Hosted preview sandboxes block downloads and the print dialog; the UI adapts. */
  sandboxPreview: (raw.VITE_SANDBOX_PREVIEW ?? '').trim() === 'true',
}
