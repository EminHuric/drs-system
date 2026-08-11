// ─────────────────────────────────────────────────────────────
//  Radnje nad porudžbinom — na jednom mestu, jer ih poziva i
//  tabla uživo, i istorija, i ekran sa porukama.
// ─────────────────────────────────────────────────────────────

import { arrayUnion, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { nextStatus } from './constants.js'

export function orderRef(restaurantId, orderId) {
  return doc(db, 'restaurants', restaurantId, 'orders', orderId)
}

export async function setStatus(restaurantId, order, status) {
  await updateDoc(orderRef(restaurantId, order.id), {
    status,
    updatedAt: serverTimestamp(),
    // Vreme svakog koraka čuvamo da bi izveštaji mogli da izračunaju
    // koliko je porudžbina stvarno čekala.
    history: arrayUnion({ status, at: Date.now() }),
  })
}

/** Sledeći korak u toku porudžbine (zavisi od toga da li je lokal ili dostava). */
export async function advance(restaurantId, order) {
  const s = nextStatus(order)
  if (!s) return null
  await setStatus(restaurantId, order, s)
  return s
}

export async function cancel(restaurantId, order, reason = '') {
  await updateDoc(orderRef(restaurantId, order.id), {
    status: 'cancelled',
    cancelReason: reason,
    updatedAt: serverTimestamp(),
    history: arrayUnion({ status: 'cancelled', at: Date.now() }),
  })
}

/** Procena vremena koju gost vidi na ekranu praćenja. */
export async function setEta(restaurantId, order, minutes) {
  await updateDoc(orderRef(restaurantId, order.id), {
    eta: Number(minutes) || null,
    updatedAt: serverTimestamp(),
  })
}

export function orderTitle(order) {
  if (order.type === 'delivery') return order.guest?.address || 'Dostava'
  if (order.type === 'takeaway') return 'Za poneti'
  return `Sto ${order.tableLabel || '—'}`
}

export function orderIcon(order) {
  return order.type === 'delivery' ? '🛵' : order.type === 'takeaway' ? '🛍️' : '🍽️'
}
