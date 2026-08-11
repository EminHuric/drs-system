// ─────────────────────────────────────────────────────────────
//  Živi podaci iz Firestore-a
//
//  onSnapshot vezan za životni ciklus komponente: pretplata se
//  otkazuje sama kad se komponenta ukloni, a menja se automatski
//  kad se upit promeni (npr. vlasnik prebaci na drugi dan).
// ─────────────────────────────────────────────────────────────

import { ref, shallowRef, watch, onScopeDispose, isRef } from 'vue'
import { onSnapshot } from 'firebase/firestore'

function withId(snap) {
  return { id: snap.id, ...snap.data() }
}

/**
 * @param {import('firebase/firestore').Query | Ref} source  upit (ili ref na upit; null pauzira)
 */
export function useLiveCollection(source) {
  const items = shallowRef([])
  const loading = ref(true)
  const error = ref(null)
  let unsub = null

  function stop() {
    if (unsub) {
      unsub()
      unsub = null
    }
  }

  function start(q) {
    stop()
    if (!q) {
      items.value = []
      loading.value = false
      return
    }
    loading.value = true
    error.value = null
    unsub = onSnapshot(
      q,
      (snap) => {
        items.value = snap.docs.map(withId)
        loading.value = false
      },
      (e) => {
        error.value = e
        loading.value = false
        console.error('[RDS] snapshot greška:', e)
      }
    )
  }

  if (isRef(source)) {
    watch(source, (q) => start(q), { immediate: true })
  } else {
    start(source)
  }

  onScopeDispose(stop)
  return { items, loading, error, stop }
}

/** Isto, ali za jedan dokument. */
export function useLiveDoc(source) {
  const data = ref(null)
  const loading = ref(true)
  const error = ref(null)
  let unsub = null

  function stop() {
    if (unsub) {
      unsub()
      unsub = null
    }
  }

  function start(ref_) {
    stop()
    if (!ref_) {
      data.value = null
      loading.value = false
      return
    }
    loading.value = true
    error.value = null
    unsub = onSnapshot(
      ref_,
      (snap) => {
        data.value = snap.exists() ? withId(snap) : null
        loading.value = false
      },
      (e) => {
        error.value = e
        loading.value = false
      }
    )
  }

  if (isRef(source)) {
    watch(source, (r) => start(r), { immediate: true })
  } else {
    start(source)
  }

  onScopeDispose(stop)
  return { data, loading, error, stop }
}

/**
 * Sat koji otkucava svake sekunde — da bi "pre 3 min" na tabli uživo
 * zaista bilo tačno bez ručnog osvežavanja.
 */
export function useTicker(intervalMs = 1000) {
  const now = ref(Date.now())
  const id = setInterval(() => (now.value = Date.now()), intervalMs)
  onScopeDispose(() => clearInterval(id))
  return now
}
