/**
 * Catches common Supabase connection-string mistakes before connecting, and turns
 * driver errors into the next thing to try. Messages never include the password.
 */

/** 'migrate' = creating tables from a computer; 'server' = the Netlify Function. */
export type DbUrlUse = 'migrate' | 'server'

interface ParsedUrl {
  host: string
  port: string
  user: string
}

function parse(url: string): ParsedUrl | null {
  try {
    const u = new URL(url.trim())
    if (u.protocol !== 'postgres:' && u.protocol !== 'postgresql:') return null
    return { host: u.hostname.toLowerCase(), port: u.port || '5432', user: decodeURIComponent(u.username) }
  } catch {
    return null
  }
}

/** `<ref>.supabase.co`: the project's API gateway (HTTPS only), not Postgres. */
const API_HOST = /^([a-z0-9]+)\.supabase\.co$/
/** `db.<ref>.supabase.co`: direct connection, IPv6-only unless the IPv4 add-on is bought. */
const DIRECT_HOST = /^db\.([a-z0-9]+)\.supabase\.co$/
const POOLER_HOST = /\.pooler\.supabase\.com$/

const poolerFor = (use: DbUrlUse) => (use === 'migrate' ? 'Session pooler' : 'Transaction pooler')

/** Where to find and paste the right string, worded for each use. */
const copyStep = (use: DbUrlUse) =>
  `In Supabase, click Connect, choose the ${poolerFor(use)} string, and replace [YOUR-PASSWORD] with your database password.`

/** Returns why the URL can't work as written, or null if it looks usable. */
export function checkDatabaseUrl(url: string, use: DbUrlUse): string | null {
  const p = parse(url)
  if (!p) {
    return (
      "It isn't a valid postgresql:// connection string. " +
      'If your password contains @ # ? & / : or a space, percent-encode those characters (for example @ becomes %40).'
    )
  }
  const api = API_HOST.exec(p.host)
  if (api) {
    return (
      `${p.host} is your Supabase project's API address, which doesn't accept database connections. ${copyStep(use)} ` +
      `That string's host ends in .pooler.supabase.com and its user is postgres.${api[1]}.`
    )
  }
  if (POOLER_HOST.test(p.host) && !p.user.includes('.')) {
    return `Supabase's pooler needs the user name postgres.<project-ref>, not "${p.user}". ${copyStep(use)}`
  }
  return null
}

const SQL_EDITOR_FALLBACK =
  'Try another network, such as a phone hotspot, or skip this command: open SQL Editor in Supabase, ' +
  'paste the contents of supabase/migrations/20261112000000_clinicdesk_init.sql, and click Run.'

const NETWORK_ERROR =/CONNECT_TIMEOUT|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN/

/** Explains a connection or query failure in terms of what to change. */
export function explainDbError(err: unknown, url: string, use: DbUrlUse): string {
  const e = (err ?? {}) as { code?: unknown; message?: unknown }
  const message = typeof e.message === 'string' ? e.message : String(err)
  const code = typeof e.code === 'string' ? e.code : ''
  const p = parse(url)
  const target = p ? `${p.host}:${p.port}` : 'the database'

  const preCheck = checkDatabaseUrl(url, use)
  if (preCheck) return preCheck

  if (NETWORK_ERROR.test(code) || NETWORK_ERROR.test(message)) {
    if (p && DIRECT_HOST.test(p.host)) {
      return (
        `Couldn't reach ${target}. Supabase's direct connection only works over IPv6 (unless you buy the IPv4 add-on), ` +
        `and most networks${use === 'server' ? ', including Netlify Functions,' : ''} are IPv4. ${copyStep(use)}`
      )
    }
    if (/ENOTFOUND|EAI_AGAIN/.test(code + message)) {
      const hint = use === 'migrate' ? ` If it matches exactly, your network may be filtering it. ${SQL_EDITOR_FALLBACK}` : ''
      return `The host ${p?.host ?? ''} wasn't found. Check for a typo, or copy the string again. ${copyStep(use)}${hint}`
    }
    if (use === 'migrate') {
      return (
        `Couldn't reach ${target}. The connection string looks right, so your network is probably blocking outgoing port ${p?.port ?? '5432'} ` +
        `(common on office networks and VPNs). ${SQL_EDITOR_FALLBACK}`
      )
    }
    return `Couldn't reach ${target}. Check DATABASE_URL is the Transaction pooler string (port 6543) and that the Supabase project isn't paused.`
  }
  if (/tenant or user not found/i.test(message)) {
    return `Supabase's pooler didn't recognise the user or project. The user must be postgres.<project-ref> and the host must be your project's pooler. ${copyStep(use)}`
  }
  if (/password authentication failed/i.test(message)) {
    return (
      'Wrong database password. Use the database password (not your Supabase login). ' +
      'If you have forgotten it, reset it in Supabase under Project Settings → Database, and percent-encode special characters in the URL.'
    )
  }
  return message
}

/** host:port for log lines, without credentials. */
export function describeDatabaseUrl(url: string): string {
  const p = parse(url)
  return p ? `${p.host}:${p.port}` : '(unparseable URL)'
}
