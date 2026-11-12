// Crockford base32 without I, L, O, U: readable aloud and hard to misread.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'

function randomChars(length: number): string {
  const bytes = new Uint8Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const b of bytes) out += ALPHABET[b % 32]
  return out
}

export const ID_PREFIX = {
  patient: 'PT',
  visit: 'VS',
  diagnosis: 'DX',
  prescription: 'RXV',
  rxNumber: 'RX',
  prescriptionMedicine: 'RXM',
  medicine: 'MED',
  appointment: 'AP',
  followUp: 'FU',
  document: 'DOC',
  file: 'FILE',
  audit: 'AUD',
} as const

export type IdKind = keyof typeof ID_PREFIX

/** Short, human-friendly unique IDs, e.g. PT-7K3M9Q. Repositories reject duplicates. */
export function newId(kind: IdKind, length = 6): string {
  return `${ID_PREFIX[kind]}-${randomChars(length)}`
}

/** Deterministic variant for seed data. */
export function seededId(kind: IdKind, rand: () => number, length = 6): string {
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[Math.floor(rand() * 32)]
  return `${ID_PREFIX[kind]}-${out}`
}
