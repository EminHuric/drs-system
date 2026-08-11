// ─────────────────────────────────────────────────────────────
//  Podaci vlasničkog panela — jedna pretplata za ceo panel.
//
//  Da svaki ekran otvara svoje listenere, isti dokumenti bi se
//  čitali po pet puta i besplatna kvota bi nestala do podneva.
//  Zato se pretplate prave jednom po restoranu, u odvojenom
//  opsegu koji preživljava prelaz sa ekrana na ekran.
// ─────────────────────────────────────────────────────────────

import { computed, effectScope } from 'vue'
import { collection, limit, orderBy, query } from 'firebase/firestore'
import { db } from '@/firebase'
import { restaurant } from '@/stores/auth'
import { useLiveCollection } from './useLive.js'
import { CLOSED_STATUSES, LIVE_STATUSES } from '@/lib/constants'
import { toDate } from '@/lib/format'

const EMPTY = {
  orders: computed(() => []),
  liveOrders: computed(() => []),
  doneOrders: computed(() => []),
  chats: computed(() => []),
  categories: computed(() => []),
  items: computed(() => []),
  tables: computed(() => []),
  reviews: computed(() => []),
  reviewsError: computed(() => null),
  loading: computed(() => true),
}

let scope = null
let current = null
let boundId = null

function build(id) {
  const base = ['restaurants', id]

  const orders = useLiveCollection(
    query(collection(db, ...base, 'orders'), orderBy('createdAt', 'desc'), limit(150))
  )
  const categories = useLiveCollection(
    query(collection(db, ...base, 'categories'), orderBy('sort', 'asc'))
  )
  const items = useLiveCollection(query(collection(db, ...base, 'items'), orderBy('sort', 'asc')))
  const tables = useLiveCollection(query(collection(db, ...base, 'tables'), orderBy('sort', 'asc')))
  const reviews = useLiveCollection(
    query(collection(db, ...base, 'reviews'), orderBy('createdAt', 'desc'), limit(200))
  )

  const liveOrders = computed(() =>
    // Najstarija gore: ono što najduže čeka mora prvo da upadne u oko.
    orders.items.value
      .filter((o) => LIVE_STATUSES.includes(o.status))
      .slice()
      .reverse()
  )

  const doneOrders = computed(() =>
    orders.items.value.filter((o) => CLOSED_STATUSES.includes(o.status))
  )

  // Za ekran poruka: samo porudžbine u kojima je neko nešto napisao,
  // sortirane po poslednjoj poruci.
  const chats = computed(() =>
    orders.items.value
      .filter((o) => o.lastMsgAt)
      .slice()
      .sort((a, b) => (toDate(b.lastMsgAt)?.getTime() || 0) - (toDate(a.lastMsgAt)?.getTime() || 0))
  )

  return {
    orders: orders.items,
    liveOrders,
    doneOrders,
    chats,
    categories: categories.items,
    items: items.items,
    tables: tables.items,
    reviews: reviews.items,
    // Ako pravila za ocene još nisu objavljena, panel to kaže mirno
    // umesto da prikaže prazan ekran bez objašnjenja.
    reviewsError: reviews.error,
    loading: computed(
      () => orders.loading.value || categories.loading.value || items.loading.value
    ),
  }
}

export function usePanelData() {
  const id = restaurant.value?.id
  if (!id) return EMPTY

  if (id !== boundId) {
    scope?.stop()
    boundId = id
    scope = effectScope(true)
    current = scope.run(() => build(id))
  }

  return current || EMPTY
}

/** Poziva se pri odjavi — inače bi listeneri prethodnog naloga ostali živi. */
export function disposePanelData() {
  scope?.stop()
  scope = null
  current = null
  boundId = null
}
