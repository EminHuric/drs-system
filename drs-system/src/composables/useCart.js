// ─────────────────────────────────────────────────────────────
//  Korpa gosta
//
//  Odvojena po restoranu (ključ sadrži id lokala), pa gost može da
//  ima otvorenu korpu u dva lokala bez mešanja. Preživljava
//  osvežavanje stranice — bitno jer telefon lako zaključa ekran
//  usred naručivanja.
// ─────────────────────────────────────────────────────────────

import { computed, effectScope, ref, watch } from 'vue'

const carts = new Map()

export function useCart(restaurantId) {
  if (!restaurantId) restaurantId = 'none'
  if (carts.has(restaurantId)) return carts.get(restaurantId)

  // Korpa se pravi u odvojenom opsegu, pa je svejedno odakle je
  // pozvana — ne kači se na komponentu koja je slučajno prva zatražila
  // i preživljava kretanje kroz aplikaciju, kao i sama korpa u glavi gosta.
  const scope = effectScope(true)
  const api = scope.run(() => build(restaurantId))
  carts.set(restaurantId, api)
  return api
}

function build(restaurantId) {
  const KEY = `rds.cart.${restaurantId}`

  const lines = ref(load())

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '[]')
      return Array.isArray(raw) ? raw.filter((l) => l && l.itemId && l.qty > 0) : []
    } catch {
      return []
    }
  }

  watch(
    lines,
    (v) => {
      try {
        localStorage.setItem(KEY, JSON.stringify(v))
      } catch {
        /* privatni režim pregledanja — korpa tada radi samo u memoriji */
      }
    },
    { deep: true }
  )

  const count = computed(() => lines.value.reduce((s, l) => s + l.qty, 0))
  const subtotal = computed(() => lines.value.reduce((s, l) => s + l.price * l.qty, 0))
  const isEmpty = computed(() => lines.value.length === 0)

  function qtyOf(itemId) {
    return lines.value.filter((l) => l.itemId === itemId).reduce((s, l) => s + l.qty, 0)
  }

  /** Isti artikal sa istom napomenom se sabira; sa različitom stoji zasebno. */
  function add(item, qty = 1, note = '') {
    const key = `${item.id}|${note}`
    const found = lines.value.find((l) => `${l.itemId}|${l.note || ''}` === key)
    if (found) {
      found.qty += qty
    } else {
      lines.value.push({
        itemId: item.id,
        name: item.name,
        price: Number(item.price) || 0,
        emoji: item.emoji || '',
        qty,
        note,
      })
    }
  }

  function setQty(index, qty) {
    if (qty <= 0) lines.value.splice(index, 1)
    else lines.value[index].qty = qty
  }

  function inc(index) {
    lines.value[index].qty++
  }

  function dec(index) {
    setQty(index, lines.value[index].qty - 1)
  }

  /** Brzi minus sa kartice jela — skida sa poslednje stavke tog artikla. */
  function removeOne(itemId) {
    for (let i = lines.value.length - 1; i >= 0; i--) {
      if (lines.value[i].itemId === itemId) {
        setQty(i, lines.value[i].qty - 1)
        return
      }
    }
  }

  function clear() {
    lines.value = []
  }

  return { lines, count, subtotal, isEmpty, qtyOf, add, setQty, inc, dec, removeOne, clear }
}
