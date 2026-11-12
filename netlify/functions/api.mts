/**
 * ClinicDesk API (Netlify Function). Every request under /api/* lands here.
 *
 * Environment variables (Netlify → Site configuration → Environment variables):
 *   DATABASE_URL              Supabase transaction-pooler connection string (port 6543)
 *   CLERK_SECRET_KEY          Clerk secret key (sk_…), used to verify session tokens
 *   CLERK_AUTHORIZED_PARTIES  optional, comma-separated site origins allowed to call the API
 *   CLERK_JWT_KEY             optional, Clerk JWT public key for networkless verification
 */
import type { Config } from '@netlify/functions'
import { createApiFromEnv } from '../../src/server/runtime'

// Created once per warm function instance, so the database connection is reused.
let handler: ((req: Request) => Promise<Response>) | undefined

export default async (req: Request): Promise<Response> => {
  handler ??= createApiFromEnv(process.env)
  return handler(req)
}

export const config: Config = {
  path: '/api/*',
}
