/**
 * Builds the production API from environment variables: Supabase Postgres via
 * postgres.js and Clerk token verification. Shared by the Netlify Function and
 * the local dev server.
 */
import postgres, { type Sql } from 'postgres'
import { createApiHandler, DEFAULT_MAX_UPLOAD } from './apiHandler'
import { authorizedPartiesFromEnv, createClerkVerifier, type TokenVerifier } from './auth'
import { checkDatabaseUrl, explainDbError } from './databaseUrl'
import { createPostgresRepositories, PG_CLIENT_TYPES } from './postgres/pgRepositories'

export function createSql(databaseUrl: string, opts: { max?: number } = {}): Sql {
  const host = (() => {
    try {
      return new URL(databaseUrl).hostname
    } catch {
      return ''
    }
  })()
  const local = host === 'localhost' || host === '127.0.0.1'
  return postgres(databaseUrl, {
    // Supabase recommends one connection per serverless instance.
    max: opts.max ?? 1,
    // Supabase's transaction pooler (port 6543) doesn't support prepared statements.
    prepare: false,
    ssl: local ? false : 'require',
    idle_timeout: 20,
    connect_timeout: 10,
    types: PG_CLIENT_TYPES,
    onnotice: () => undefined,
  })
}

export function configError(message: string): (req: Request) => Promise<Response> {
  return async () =>
    Response.json({ error: { code: 'SERVER_NOT_CONFIGURED', message } }, { status: 500, headers: { 'cache-control': 'no-store' } })
}

export function createApiFromEnv(
  env: Record<string, string | undefined>,
  overrides: { sql?: Sql; verify?: TokenVerifier } = {},
): (req: Request) => Promise<Response> {
  const databaseUrl = env.DATABASE_URL
  const secretKey = env.CLERK_SECRET_KEY
  if (!overrides.sql && !databaseUrl) return configError('The server is missing DATABASE_URL. Add it in Netlify environment variables (or .env.local when running locally), then restart or redeploy.')
  if (!overrides.verify && !secretKey) return configError('The server is missing CLERK_SECRET_KEY. Add it in Netlify environment variables (or .env.local when running locally), then restart or redeploy.')
  if (secretKey && !secretKey.startsWith('sk_')) return configError('CLERK_SECRET_KEY must be a Clerk secret key (sk_…).')
  const urlProblem = !overrides.sql && databaseUrl ? checkDatabaseUrl(databaseUrl, 'server') : null
  if (urlProblem) return configError(`DATABASE_URL needs fixing: ${urlProblem}`)

  const sql = overrides.sql ?? createSql(databaseUrl!)
  const verify =
    overrides.verify ??
    createClerkVerifier({
      secretKey: secretKey!,
      jwtKey: env.CLERK_JWT_KEY,
      authorizedParties: authorizedPartiesFromEnv(env),
      siteUrl: env.URL,
    })

  return createApiHandler({
    repos: createPostgresRepositories(sql),
    verify,
    maxUploadBytes: DEFAULT_MAX_UPLOAD,
    pingDatabase: async () => {
      try {
        await sql`select 1`
      } catch (err) {
        // Shown in Netlify's function logs; /api/health itself only says "unreachable".
        if (databaseUrl) console.error(`[api] database check failed: ${explainDbError(err, databaseUrl, 'server')}`)
        throw err
      }
    },
  })
}
