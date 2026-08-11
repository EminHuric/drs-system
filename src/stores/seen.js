// ─────────────────────────────────────────────────────────────
//  "Pročitano" za ćaskanja
//
//  Namerno lokalno, a ne u bazi: brojka nepročitanih je stvar
//  uređaja za kojim osoblje radi, i ovako ne troši ni jedan upis
//  po svakoj otvorenoj poruci.
// ─────────────────────────────────────────────────────────────

import { ref, watch } from 'vue'
import { restaurant } from './auth.js'

export const seen = ref({})

let key = null

watch(
  () => restaurant.value?.id,
  (id) => {
    key = id ? `rds.seen.${id}` : null
    try {
      seen.value = key ? JSON.parse(localStorage.getItem(key) || '{}') : {}
    } catch {
      seen.value = {}
    }
  },
  { immediate: true }
)

export function markSeen(orderId, millis = Date.now()) {
  if (!orderId) return
  seen.value = { ...seen.value, [orderId]: millis }
  if (key) {
    try {
      localStorage.setItem(key, JSON.stringify(seen.value))
    } catch {
      /* privatni režim — brojka tada važi samo dok traje sesija */
    }
  }
}

export function isUnread(order) {
  if (!order?.lastMsgAt || order.lastMsgFrom !== 'guest') return false
  const at = order.lastMsgAt?.toMillis?.() ?? 0
  return at > (seen.value[order.id] || 0)
}
