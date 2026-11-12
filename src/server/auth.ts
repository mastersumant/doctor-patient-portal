import { verifyToken } from '@clerk/backend'

export interface VerifiedUser {
  userId: string
}

/** The request the token arrived with; its origin is the site the browser was on. */
export interface RequestContext {
  origin: string
}

export type TokenVerifier = (token: string, request?: RequestContext) => Promise<VerifiedUser | null>

export interface ClerkVerifierOptions {
  secretKey: string
  /** Optional PEM public key for networkless verification (Clerk Dashboard → API keys → JWT public key). */
  jwtKey?: string
  /**
   * Fixed list of origins allowed to have issued the token (the `azp` claim), from
   * CLERK_AUTHORIZED_PARTIES. When empty, the origin the request arrived on is allowed
   * (plus `siteUrl`), which covers the main URL, branch deploys and deploy previews.
   */
  authorizedParties?: string[]
  /** Netlify's main site URL (`URL`, available to functions at runtime). */
  siteUrl?: string
}

const trimOrigin = (s: string) => s.trim().replace(/\/+$/, '')

/** Origins whose tokens are accepted for a request that arrived on `requestOrigin`. */
export function allowedOrigins(opts: Pick<ClerkVerifierOptions, 'authorizedParties' | 'siteUrl'>, requestOrigin?: string): string[] {
  if (opts.authorizedParties?.length) return opts.authorizedParties.map(trimOrigin)
  return [...new Set([requestOrigin, opts.siteUrl].filter((v): v is string => !!v).map(trimOrigin))]
}

/**
 * Verifies a Clerk session token (signature, expiry, issuer and origin).
 * The doctor ID used for every query is the token's `sub` claim — nothing the
 * browser sends in the request body is trusted for identity.
 *
 * The browser calls /api on the same site it is showing, so a token minted on that
 * site carries `azp` = the request's origin. A token minted on any other site is refused.
 */
export function createClerkVerifier(opts: ClerkVerifierOptions): TokenVerifier {
  return async (token, request) => {
    try {
      const parties = allowedOrigins(opts, request?.origin)
      const payload = await verifyToken(token, {
        secretKey: opts.secretKey,
        jwtKey: opts.jwtKey || undefined,
        authorizedParties: parties.length ? parties : undefined,
      })
      return typeof payload.sub === 'string' && payload.sub ? { userId: payload.sub } : null
    } catch {
      return null
    }
  }
}

/** CLERK_AUTHORIZED_PARTIES (comma-separated origins), or an empty list to use the request's origin. */
export function authorizedPartiesFromEnv(env: Record<string, string | undefined>): string[] {
  return (env.CLERK_AUTHORIZED_PARTIES ?? '').split(',').map(trimOrigin).filter(Boolean)
}
