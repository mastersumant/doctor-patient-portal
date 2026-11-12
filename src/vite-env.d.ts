/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_NAME?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_ENABLE_DEMO_MODE?: string
  readonly VITE_STORAGE_TYPE?: string
  readonly VITE_ROUTER_MODE?: string
  readonly VITE_SANDBOX_PREVIEW?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
