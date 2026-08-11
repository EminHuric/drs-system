// ─────────────────────────────────────────────────────────────
//  Web adresa lokala:  rds.app/r/konoba-lanterna
//  Naša slova moraju da se prevedu, jer URL trpi samo ASCII.
// ─────────────────────────────────────────────────────────────

const MAP = {
  č: 'c', ć: 'c', đ: 'dj', š: 's', ž: 'z',
  Č: 'c', Ć: 'c', Đ: 'dj', Š: 's', Ž: 'z',
}

export function slugify(input) {
  return String(input || '')
    .trim()
    .replace(/[čćđšžČĆĐŠŽ]/g, (ch) => MAP[ch])
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
}

export function isValidSlug(s) {
  return /^[a-z0-9][a-z0-9-]{1,47}$/.test(String(s || ''))
}

/** Adrese koje ne smeju da završe kao slug jer se sudaraju sa rutama. */
export const RESERVED_SLUGS = [
  'admin', 'panel', 'login', 'register', 'r', 'api', 'app',
  'rds', 'about', 'help', 'kontakt', 'cenovnik', 'demo',
]
