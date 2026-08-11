// ─────────────────────────────────────────────────────────────
//  Da panel ne zaspi
//
//  Restoran drži tablet ili telefon na šanku ceo dan. Ako ekran
//  zaspi, zvono za porudžbinu se ne čuje jer browser uspava i zvuk.
//  Zato panel traži od uređaja da ne gasi ekran dok je otvoren.
//
//  Uz to, sistemsko obaveštenje probija i kad je panel u pozadini
//  (drugi tab, druga aplikacija) — dokle god browser radi.
//
//  ⚠️ Granica koju treba znati: dok je browser POTPUNO zatvoren,
//  nijedna web aplikacija ne može da zazvoni. Za to je potreban
//  push preko servera (FCM + Cloud Functions = plaćeni Blaze plan).
//  Rešenje bez toga: panel ostaje otvoren, a ekran ne gasne.
// ─────────────────────────────────────────────────────────────

import { onBeforeUnmount, onMounted, ref } from 'vue'

export const wakeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator
export const wakeActive = ref(false)

let sentinel = null

async function acquire() {
  if (!wakeSupported || sentinel) return
  try {
    sentinel = await navigator.wakeLock.request('screen')
    wakeActive.value = true
    sentinel.addEventListener('release', () => {
      sentinel = null
      wakeActive.value = false
    })
  } catch {
    // Uređaj je odbio (npr. ušteda baterije) — panel radi i bez toga.
    wakeActive.value = false
  }
}

async function release() {
  try {
    await sentinel?.release()
  } catch {
    /* svejedno */
  }
  sentinel = null
  wakeActive.value = false
}

/**
 * Drži ekran budnim dok je komponenta na ekranu.
 * Sistem otpušta zaključavanje kad korisnik pređe u drugi tab, pa se
 * ono ponovo traži čim se panel vrati u prvi plan.
 */
export function useKeepAwake() {
  function onVisible() {
    if (document.visibilityState === 'visible') acquire()
  }

  onMounted(() => {
    acquire()
    document.addEventListener('visibilitychange', onVisible)
  })

  onBeforeUnmount(() => {
    document.removeEventListener('visibilitychange', onVisible)
    release()
  })

  return { wakeActive, wakeSupported }
}

// ─── sistemska obaveštenja ───────────────────────────────────

export const notifySupported = typeof window !== 'undefined' && 'Notification' in window

export const notifyState = ref(notifySupported ? Notification.permission : 'unsupported')

export async function askNotifyPermission() {
  if (!notifySupported) return 'unsupported'
  try {
    notifyState.value = await Notification.requestPermission()
  } catch {
    /* korisnik je zatvorio prozor */
  }
  return notifyState.value
}

/**
 * Obaveštenje van prozora aplikacije. Prikazuje se samo kad panel nije
 * u prvom planu — inače bi se dupliralo sa onim što se već vidi.
 */
export function notify(title, body, tag = 'rds') {
  if (!notifySupported || Notification.permission !== 'granted') return
  if (document.visibilityState === 'visible') return

  try {
    const n = new Notification(title, {
      body,
      tag,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      renotify: true,
      requireInteraction: true,
      vibrate: [200, 100, 200],
    })
    n.onclick = () => {
      window.focus()
      n.close()
    }
  } catch {
    /* neki browseri traže service worker — tiho preskačemo */
  }
}
