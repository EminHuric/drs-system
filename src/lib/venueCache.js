// ═══════════════════════════════════════════════════════════════
//  Kratko pamćenje dokumenta lokala
//
//  Gost sa menija prelazi na ekran praćenja porudžbine. Oba ekrana
//  traže isti dokument lokala preko upita po adresi (slug), pa je
//  gost posle „Pošalji" gledao crn ekran dok se isti podatak vuče
//  po drugi put — a taj dokument nosi i naslovnu sliku i logo.
//
//  Ovde se pamti u memoriji, dok traje poseta. Ne u localStorage:
//  vlasnik menja meni i boje uživo, a gost ne sme da vidi jučerašnje.
// ═══════════════════════════════════════════════════════════════

const cache = new Map()
const TRAJE = 5 * 60 * 1000 // pet minuta je duže nego što traje jedna poseta

export function rememberVenue(slug, venue) {
  if (!slug || !venue) return
  cache.set(String(slug), { venue, at: Date.now() })
}

export function venueFromCache(slug) {
  const hit = cache.get(String(slug))
  if (!hit) return null
  if (Date.now() - hit.at > TRAJE) {
    cache.delete(String(slug))
    return null
  }
  return hit.venue
}
