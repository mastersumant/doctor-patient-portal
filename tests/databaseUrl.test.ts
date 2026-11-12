import { describe, expect, it } from 'vitest'
import { checkDatabaseUrl, describeDatabaseUrl, explainDbError } from '@/server/databaseUrl'

const REF = 'abcdefghijklmnopqrst'
const SESSION = `postgresql://postgres.${REF}:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`
const TRANSACTION = `postgresql://postgres.${REF}:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres`

describe('checkDatabaseUrl', () => {
  it('accepts pooler, direct and local strings', () => {
    expect(checkDatabaseUrl(SESSION, 'migrate')).toBeNull()
    expect(checkDatabaseUrl(TRANSACTION, 'server')).toBeNull()
    expect(checkDatabaseUrl(`postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`, 'migrate')).toBeNull()
    expect(checkDatabaseUrl('postgres://postgres:postgres@localhost:5432/postgres', 'migrate')).toBeNull()
  })

  it("rejects the project's API address and points to the right pooler", () => {
    const migrate = checkDatabaseUrl(`postgresql://postgres:pw@${REF}.supabase.co:5432/postgres`, 'migrate')
    expect(migrate).toMatch(/API address/)
    expect(migrate).toMatch(/Session pooler/)
    expect(migrate).toContain(`postgres.${REF}`)
    expect(checkDatabaseUrl(`postgresql://postgres:pw@${REF}.supabase.co:5432/postgres`, 'server')).toMatch(/Transaction pooler/)
  })

  it('rejects a pooler string without the project in the user name', () => {
    expect(checkDatabaseUrl('postgresql://postgres:pw@aws-0-ap-south-1.pooler.supabase.com:5432/postgres', 'migrate')).toMatch(
      /postgres\.<project-ref>/,
    )
  })

  it('rejects non-URLs, https URLs and unencoded passwords', () => {
    expect(checkDatabaseUrl('not a url', 'migrate')).toMatch(/percent-encode/)
    expect(checkDatabaseUrl(`https://${REF}.supabase.co`, 'migrate')).toMatch(/postgresql:\/\//)
    expect(checkDatabaseUrl(`postgresql://postgres.${REF}:p#ss@aws-0-x.pooler.supabase.com:5432/postgres`, 'migrate')).toMatch(
      /percent-encode/,
    )
  })

  it('never echoes the password', () => {
    const url = `postgresql://postgres:SuperSecret123@${REF}.supabase.co:5432/postgres`
    expect(checkDatabaseUrl(url, 'migrate')).not.toContain('SuperSecret123')
    expect(explainDbError(Object.assign(new Error('x'), { code: 'CONNECT_TIMEOUT' }), url, 'migrate')).not.toContain('SuperSecret123')
    expect(describeDatabaseUrl(url)).toBe(`${REF}.supabase.co:5432`)
  })
})

describe('explainDbError', () => {
  const timeout = Object.assign(new Error('write CONNECT_TIMEOUT host:5432'), { code: 'CONNECT_TIMEOUT' })

  it('blames a blocked port when a correct pooler string times out, and offers the SQL editor', () => {
    const msg = explainDbError(timeout, SESSION, 'migrate')
    expect(msg).toMatch(/blocking outgoing port 5432/)
    expect(msg).toMatch(/SQL Editor/)
  })

  it('explains IPv6-only direct connections', () => {
    const direct = `postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`
    expect(explainDbError(timeout, direct, 'migrate')).toMatch(/IPv6/)
    expect(explainDbError(Object.assign(new Error('getaddrinfo ENOTFOUND'), { code: 'ENOTFOUND' }), direct, 'server')).toMatch(
      /IPv6.*Transaction pooler/,
    )
  })

  it('maps pooler and password errors', () => {
    expect(explainDbError(new Error('Tenant or user not found'), SESSION, 'migrate')).toMatch(/postgres\.<project-ref>/)
    expect(explainDbError(new Error('password authentication failed for user "postgres"'), SESSION, 'migrate')).toMatch(
      /Wrong database password/,
    )
    expect(explainDbError(new Error('something else'), SESSION, 'migrate')).toBe('something else')
  })

  it('server-side timeouts point at DATABASE_URL and paused projects', () => {
    expect(explainDbError(timeout, TRANSACTION, 'server')).toMatch(/DATABASE_URL.*paused/)
  })
})
