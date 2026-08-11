// ─────────────────────────────────────────────────────────────
//  Ocene i utisci
//
//  Prosek se NE čuva u bazi nego se računa iz samih recenzija.
//  Razlog je pravilo: gost ne sme da piše po dokumentu lokala ni
//  po artiklima, pa bi svaki upisani brojač ostao zauvek na nuli.
//  Recenzija ionako nema toliko da bi računanje išta koštalo.
// ─────────────────────────────────────────────────────────────

export const RATING_WORDS = {
  1: 'Loše',
  2: 'Slabo',
  3: 'Solidno',
  4: 'Vrlo dobro',
  5: 'Odlično',
}

export function visibleOnly(reviews) {
  return reviews.filter((r) => r.visible !== false)
}

/** Prosek, broj ocena i raspodela po zvezdicama. */
export function summarize(reviews) {
  const list = visibleOnly(reviews)
  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let sum = 0

  for (const r of list) {
    const n = Math.round(Number(r.rating) || 0)
    if (n < 1 || n > 5) continue
    dist[n]++
    sum += n
  }

  const count = Object.values(dist).reduce((a, b) => a + b, 0)
  return {
    count,
    avg: count ? sum / count : 0,
    dist,
    withPhotos: list.filter((r) => r.photos?.length).length,
    verified: list.filter((r) => r.verified).length,
  }
}

/** Ocene po artiklu — iz `itemRatings` koje gost ostavi uz recenziju. */
export function byItem(reviews) {
  const map = {}
  for (const r of visibleOnly(reviews)) {
    for (const ir of r.itemRatings || []) {
      if (!ir.itemId) continue
      const e = (map[ir.itemId] ||= { sum: 0, count: 0, name: ir.name })
      const n = Math.round(Number(ir.rating) || 0)
      if (n < 1 || n > 5) continue
      e.sum += n
      e.count++
    }
  }
  for (const id of Object.keys(map)) {
    map[id].avg = map[id].count ? map[id].sum / map[id].count : 0
  }
  return map
}

export function fmtRating(n) {
  return (Math.round(Number(n) * 10) / 10).toFixed(1).replace('.', ',')
}

/** Inicijali ili „Gost" — recenzije se potpisuju imenom, ne nalogom. */
export function reviewerName(r) {
  return (r.guestName || '').trim() || 'Gost'
}
