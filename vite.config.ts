/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const hashRouting = ['hash', 'memory'].includes(process.env.VITE_ROUTER_MODE ?? env.VITE_ROUTER_MODE ?? '')
  return {
    // Browser routing needs absolute asset URLs so deep links survive a refresh.
    // Hash routing (static hosting from any folder) can use relative URLs.
    base: hashRouting ? './' : '/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
    // In API mode the browser calls /api; locally that's `npm run dev:api` on port 8787.
    server: { port: 5173, proxy: { '/api': { target: 'http://localhost:8787', changeOrigin: false } } },
    preview: { port: 4173 },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
    },
  }
})
