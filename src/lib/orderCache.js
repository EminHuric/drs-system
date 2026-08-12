// ═══════════════════════════════════════════════════════════════
//  Porudžbina koja je upravo poslata
//
//  Gost pritisne „Pošalji", porudžbina ode u bazu i ekran se prebaci
//  na praćenje. Tamo je do sada stajalo „Učitavanje porudžbine…" dok
//  se ista ta porudžbina ne pročita nazad sa servera — pola sekunde
//  do sekunde crnog ekrana, i to baš u trenutku kad gost najviše
//  želi da vidi da je uspelo.
//
//  A mi tu porudžbinu već imamo: sami smo je sastavili. Zato se ovde
//  ostavi u memoriji i ekran praćenja je odmah pokaže — „Poslato,
//  čeka potvrdu". Kad prava stigne sa servera, tiho je zameni i od
//  tada sve ide uživo.
// ═══════════════════════════════════════════════════════════════

const poslate = new Map()
const TRAJE = 2 * 60 * 1000 // dovoljno da se ekran otvori i podaci stignu

export function rememberOrder(id, order) {
  if (!id || !order) return
  poslate.set(String(id), { order, at: Date.now() })
}

export function orderFromCache(id) {
  const hit = poslate.get(String(id))
  if (!hit) return null
  if (Date.now() - hit.at > TRAJE) {
    poslate.delete(String(id))
    return null
  }
  return hit.order
}
