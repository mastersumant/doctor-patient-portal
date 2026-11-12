/// <reference types="vitest/config" />
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { connect } from 'node:net'
import { fileURLToPath, URL } from 'node:url'

/**
 * Stops a production build that would ship a broken or unsafe bundle.
 * Returns problems by variable name; values are never printed.
 */
export function checkBuildEnv(env: Record<string, string | undefined>): string[] {
  const problems: string[] = []
  for (const [key, raw] of Object.entries(env)) {
    const value = raw?.trim()
    if (!key.startsWith('VITE_') || !value) continue
    if (/^sk_(test|live)_/.test(value) || /^postgres(ql)?:\/\//i.test(value)) {
      problems.push(
        `${key} holds a secret (a Clerk secret key or a database URL). VITE_ variables are published in the browser bundle, ` +
          'where anyone can read them. Remove it, keep the value only in a variable without the VITE_ prefix ' +
          '(CLERK_SECRET_KEY, DATABASE_URL), and rotate the secret if this was ever deployed.',
      )
    }
  }
  if ((env.VITE_STORAGE_TYPE ?? '').trim().toUpperCase() === 'API') {
    const key = (env.VITE_CLERK_PUBLISHABLE_KEY ?? '').trim()
    if (!key) {
      problems.push(
        'VITE_CLERK_PUBLISHABLE_KEY is missing. Server mode needs Clerk sign-in: add your pk_… key in ' +
          'Netlify → Site configuration → Environment variables (or .env.local), then build again.',
      )
    } else if (!key.startsWith('pk_')) {
      problems.push('VITE_CLERK_PUBLISHABLE_KEY must be a Clerk publishable key (it starts with pk_).')
    }
  }
  return problems
}

const isApiMode = (env: Record<string, string | undefined>) => (env.VITE_STORAGE_TYPE ?? '').trim().toUpperCase() === 'API'

function portInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = connect({ port, host: '127.0.0.1' })
    socket.once('connect', () => (socket.destroy(), resolve(true)))
    socket.once('error', () => resolve(false))
    socket.setTimeout(500, () => (socket.destroy(), resolve(false)))
  })
}

/** Shape of scripts/localApi.ts, loaded through Vite so its `@/` imports resolve. */
interface LocalApiModule {
  createLocalApi(
    env: Record<string, string | undefined>,
    opts: { pglitePort: number },
  ): Promise<{ database: string; handle(req: IncomingMessage, res: ServerResponse, path: string): Promise<void> }>
}

/**
 * In server mode (VITE_STORAGE_TYPE=API), `npm run dev` serves /api itself with the same
 * handler as the Netlify Function, so one terminal is enough. If `npm run dev:api` is
 * already running, /api is forwarded to it instead. Browser mode says where records go.
 */
function localApi(env: Record<string, string | undefined>): Plugin {
  return {
    name: 'clinicdesk-local-api',
    apply: 'serve',
    async configureServer(server) {
      if (process.env.VITEST) return
      const log = server.config.logger
      if (!isApiMode(env)) {
        log.info(
          '\n  Storage: this browser only (IndexedDB). Records will not reach Supabase.\n' +
            '  For the server database, add VITE_STORAGE_TYPE=API to .env.local and restart.\n',
        )
        return
      }
      const port = Number(env.API_PORT || 8787)
      if (await portInUse(port)) {
        log.info(`\n  Storage: server. Using the separate API on http://localhost:${port} (npm run dev:api).\n`)
        return
      }

      let api: Awaited<ReturnType<LocalApiModule['createLocalApi']>> | undefined
      let failure = ''
      try {
        const mod = (await server.ssrLoadModule('/scripts/localApi.ts')) as unknown as LocalApiModule
        api = await mod.createLocalApi(env, { pglitePort: port + 1 })
        log.info(`\n  Storage: server. The API runs inside this dev server.\n  Database: ${api.database}\n`)
      } catch (err) {
        failure = (err as Error).message
        log.error(`\n  The local API couldn't start: ${failure}\n`)
      }

      // Added here (not in a returned hook) so it runs before Vite's proxy.
      server.middlewares.use((req, res, next) => {
        const path = req.url ?? ''
        if (path !== '/api' && !path.startsWith('/api/')) return next()
        if (!api) {
          res.writeHead(500, { 'content-type': 'application/json' })
          res.end(JSON.stringify({ error: { code: 'SERVER_NOT_CONFIGURED', message: `The local API couldn't start: ${failure}` } }))
          return
        }
        void api.handle(req, res, path)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build') {
    const problems = checkBuildEnv(env)
    if (problems.length) throw new Error(`Build stopped:\n  - ${problems.join('\n  - ')}`)
  }
  const hashRouting = ['hash', 'memory'].includes(process.env.VITE_ROUTER_MODE ?? env.VITE_ROUTER_MODE ?? '')
  return {
    // Browser routing needs absolute asset URLs so deep links survive a refresh.
    // Hash routing (static hosting from any folder) can use relative URLs.
    base: hashRouting ? './' : '/',
    plugins: [react(), tailwindcss(), localApi(env)],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    build: {
      chunkSizeWarningLimit: 1000,
    },
    server: {
      port: 5173,
      // Used only when `npm run dev:api` was already running at startup (see localApi above).
      proxy: {
        '/api': {
          target: `http://localhost:${env.API_PORT || 8787}`,
          changeOrigin: false,
          configure: (proxy) => {
            proxy.on('error', (_err, _req, res) => {
              if (!('writeHead' in res) || res.headersSent) return
              res.writeHead(502, { 'content-type': 'application/json' })
              res.end(
                JSON.stringify({
                  error: {
                    code: 'API_NOT_RUNNING',
                    message: 'The local API server stopped. Start `npm run dev:api` again, or restart `npm run dev` to run the API inside it.',
                  },
                }),
              )
            })
          },
        },
      },
    },
    preview: { port: 4173 },
    test: {
      environment: 'node',
      include: ['tests/**/*.test.ts'],
      setupFiles: ['tests/setup.ts'],
    },
  }
})
