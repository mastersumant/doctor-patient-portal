import { verifyToken } from '@clerk/backend'

export interface VerifiedUser {
  userId: string
}

export type TokenVerifier = (token: string) => Promise<VerifiedUser | null>

export interface ClerkVerifierOptions {
  secretKey: string
  /** Optional PEM public key for networkless verification (Clerk Dashboard → API keys → JWT public key). */
  jwtKey?: string
  /** Origins allowed to have issued the token (the `azp` claim), e.g. https://your-site.netlify.app */
  authorizedParties?: string[]
}

/**
 * Verifies a Clerk session token (signature, expiry, issuer and origin).
 * The doctor ID used for every query is the token's `sub` claim — nothing the
 * browser sends in the request body is trusted for identity.
 */
export function createClerkVerifier(opts: ClerkVerifierOptions): TokenVerifier {
  return async (token) => {
    try {
      const payload = await verifyToken(token, {
        secretKey: opts.secretKey,
        jwtKey: opts.jwtKey || undefined,
        authorizedParties: opts.authorizedParties?.length ? opts.authorizedParties : undefined,
      })
      return typeof payload.sub === 'string' && payload.sub ? { userId: payload.sub } : null
    } catch {
      return null
    }
  }
}

/**
 * Allowed origins: CLERK_AUTHORIZED_PARTIES (comma-separated) when set; otherwise the
 * site URLs Netlify provides, plus local dev origins outside production.
 */
export function authorizedPartiesFromEnv(env: Record<string, string | undefined>): string[] {
  const explicit = (env.CLERK_AUTHORIZED_PARTIES ?? '')
    .split(',')
    .map((s) => s.trim().replace(/\/$/, ''))
    .filter(Boolean)
  if (explicit.length) return explicit
  const origins = [env.URL, env.DEPLOY_PRIME_URL, env.DEPLOY_URL].filter((v): v is string => !!v).map((v) => v.replace(/\/$/, ''))
  if (env.CONTEXT !== 'production') origins.push('http://localhost:5173', 'http://localhost:8888', 'http://localhost:4173')
  return [...new Set(origins)]
}
