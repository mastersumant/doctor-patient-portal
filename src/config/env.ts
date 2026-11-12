import type { StorageType } from '@/data/repositories/interfaces'

const raw = import.meta.env

const clerkPublishableKey = (raw.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim()
const demoFlag = (raw.VITE_ENABLE_DEMO_MODE ?? '').trim().toLowerCase()
const storage = (raw.VITE_STORAGE_TYPE ?? 'INDEXEDDB').trim().toUpperCase()

export const env = {
  appName: (raw.VITE_APP_NAME ?? '').trim() || 'ClinicDesk',
  clerkPublishableKey,
  clerkEnabled: clerkPublishableKey.startsWith('pk_'),
  /**
   * Demo mode lets you explore with the two synthetic doctor workspaces without
   * signing in. On by default only when Clerk is not configured; set
   * VITE_ENABLE_DEMO_MODE=false to disable it entirely.
   */
  demoMode: demoFlag === 'true' || (demoFlag !== 'false' && !clerkPublishableKey.startsWith('pk_')),
  storageType: (['INDEXEDDB', 'MEMORY'].includes(storage) ? storage : 'INDEXEDDB') as StorageType,
  routerMode: (['hash', 'memory'].includes((raw.VITE_ROUTER_MODE ?? '').trim()) ? (raw.VITE_ROUTER_MODE ?? '').trim() : 'browser') as
    | 'browser'
    | 'hash'
    | 'memory',
  /** Hosted preview sandboxes block downloads and the print dialog; the UI adapts. */
  sandboxPreview: (raw.VITE_SANDBOX_PREVIEW ?? '').trim() === 'true',
}
