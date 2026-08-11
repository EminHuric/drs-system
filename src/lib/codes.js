// ─────────────────────────────────────────────────────────────
//  Kodovi koje ljudi prepisuju rukom ili diktiraju telefonom.
//  Zato azbuka bez 0/O i 1/I/L — najčešći izvor grešaka.
// ─────────────────────────────────────────────────────────────

const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function pick(n) {
  const bytes = new Uint8Array(n)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < n; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

/** Pozivnica za vlasnika: RDS-7K2M-9QX4 (~10^17 kombinacija). */
export function inviteCode() {
  return `RDS-${pick(4)}-${pick(4)}`
}

/** Kratka oznaka porudžbine koju gost i konobar izgovaraju: "A7F3". */
export function orderCode() {
  return pick(4)
}

/** Lozinka koju admin predaje novom administratoru. */
export function tempPassword() {
  return `${pick(4)}-${pick(4)}`
}

export function normalizeInvite(input) {
  const raw = String(input || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const body = raw.startsWith('RDS') ? raw.slice(3) : raw
  if (body.length !== 8) return raw.startsWith('RDS') ? `RDS-${body}` : body
  return `RDS-${body.slice(0, 4)}-${body.slice(4)}`
}
