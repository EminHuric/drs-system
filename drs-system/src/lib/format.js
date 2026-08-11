// ─────────────────────────────────────────────────────────────
//  Prikaz brojeva, cena i vremena — sve u srpskom formatu.
// ─────────────────────────────────────────────────────────────

const nf2 = new Intl.NumberFormat('sr-RS', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})
const nf0 = new Intl.NumberFormat('sr-RS', { maximumFractionDigits: 0 })

/** Dinari se ne pišu sa parama, ostale valute da. */
export function money(amount, currency = '€') {
  const n = Number(amount) || 0
  if (currency === 'RSD') return `${nf0.format(Math.round(n))} RSD`
  return `${nf2.format(n)} ${currency}`
}

export function num(n) {
  return nf0.format(Number(n) || 0)
}

/** Firestore Timestamp | Date | broj | ISO string → Date */
export function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  if (typeof value?.toDate === 'function') return value.toDate()
  if (typeof value === 'number') return new Date(value)
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? null : d
}

const dtTime = new Intl.DateTimeFormat('sr-RS', { hour: '2-digit', minute: '2-digit' })
const dtDate = new Intl.DateTimeFormat('sr-RS', { day: '2-digit', month: '2-digit', year: 'numeric' })

export function time(value) {
  const d = toDate(value)
  return d ? dtTime.format(d) : '—'
}

export function date(value) {
  const d = toDate(value)
  return d ? dtDate.format(d) : '—'
}

export function dateTime(value) {
  const d = toDate(value)
  return d ? `${dtDate.format(d)} u ${dtTime.format(d)}` : '—'
}

/** "pre 3 min" — koristi se na tabli uživo, osvežava se svake sekunde. */
export function ago(value, now = Date.now()) {
  const d = toDate(value)
  if (!d) return '—'
  const s = Math.max(0, Math.floor((now - d.getTime()) / 1000))
  if (s < 10) return 'upravo sad'
  if (s < 60) return `pre ${s} sek`
  const m = Math.floor(s / 60)
  if (m < 60) return `pre ${m} min`
  const h = Math.floor(m / 60)
  if (h < 24) return `pre ${h} h`
  const dd = Math.floor(h / 24)
  if (dd === 1) return 'juče'
  if (dd < 7) return `pre ${dd} dana`
  return date(d)
}

/** Koliko minuta porudžbina već čeka — boji karticu kad se odugovlači. */
export function minutesSince(value, now = Date.now()) {
  const d = toDate(value)
  if (!d) return 0
  return Math.floor((now - d.getTime()) / 60000)
}

export function initials(name = '') {
  return (
    String(name)
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase() || '?'
  )
}

/** Telefon u međunarodni oblik bez razmaka i plusa — traži ga wa.me. */
export function normalizePhone(input, defaultCountry = '382') {
  let s = String(input || '').replace(/[^\d+]/g, '')
  if (!s) return ''
  if (s.startsWith('+')) return s.slice(1)
  if (s.startsWith('00')) return s.slice(2)
  if (s.startsWith('0')) return defaultCountry + s.slice(1)
  return s
}

export function prettyPhone(digits) {
  const s = String(digits || '')
  return s ? `+${s}` : ''
}
