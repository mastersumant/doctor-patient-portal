import { describe, expect, it } from 'vitest'
import { checkBuildEnv } from '../vite.config'

const PK = 'pk_test_ZXhhbXBsZS5jbGVyay5hY2NvdW50cy5kZXYk'

describe('build environment check', () => {
  it('passes a correct server-mode setup and browser mode without keys', () => {
    expect(checkBuildEnv({ VITE_STORAGE_TYPE: 'API', VITE_CLERK_PUBLISHABLE_KEY: PK, CLERK_SECRET_KEY: 'sk_test_abc', DATABASE_URL: 'postgresql://x' })).toEqual([])
    expect(checkBuildEnv({})).toEqual([])
    expect(checkBuildEnv({ VITE_STORAGE_TYPE: 'INDEXEDDB' })).toEqual([])
  })

  it('stops server mode without a publishable key', () => {
    expect(checkBuildEnv({ VITE_STORAGE_TYPE: 'API' })[0]).toMatch(/VITE_CLERK_PUBLISHABLE_KEY is missing/)
    expect(checkBuildEnv({ VITE_STORAGE_TYPE: 'API', VITE_CLERK_PUBLISHABLE_KEY: 'abc' })[0]).toMatch(/starts with pk_/)
  })

  it('stops any build that would publish a secret, without echoing it', () => {
    const problems = checkBuildEnv({ VITE_CLERK_PUBLISHABLE_KEY: 'sk_live_SuperSecret', VITE_DB: 'postgresql://postgres.ref:pw@host:6543/postgres' })
    expect(problems.filter((p) => p.includes('holds a secret'))).toHaveLength(2)
    expect(problems.join(' ')).not.toMatch(/SuperSecret|pw@host/)
  })
})
