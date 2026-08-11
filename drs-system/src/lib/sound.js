// ─────────────────────────────────────────────────────────────
//  Zvučni signal za novu porudžbinu
//
//  Bez zvučnog fajla — ton se pravi u browseru. Tako nema šta da
//  se učita, ne postoji kašnjenje, i radi i van mreže.
//
//  Browseri ne daju zvuk dok korisnik nešto ne klikne na stranici,
//  pa se audio budi na prvi dodir bilo gde u panelu.
// ─────────────────────────────────────────────────────────────

import { ref } from 'vue'

const KEY = 'rds.sound'

export const soundOn = ref(localStorage.getItem(KEY) !== 'off')

export function toggleSound() {
  soundOn.value = !soundOn.value
  localStorage.setItem(KEY, soundOn.value ? 'on' : 'off')
  if (soundOn.value) chime()
}

let ctx = null

function context() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

function tone(freq, startAt, duration, gainPeak) {
  const c = context()
  if (!c) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = 'sine'
  osc.frequency.value = freq
  osc.connect(gain)
  gain.connect(c.destination)

  const t = c.currentTime + startAt
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(gainPeak, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration)

  osc.start(t)
  osc.stop(t + duration + 0.05)
}

/** Prijatna dvotonska zvonjava — čuje se, a ne para uši. */
export function chime() {
  if (!soundOn.value) return
  tone(880, 0, 0.28, 0.13)
  tone(1318.5, 0.14, 0.34, 0.11)
}

/** Diskretniji signal za novu poruku u ćaskanju. */
export function blip() {
  if (!soundOn.value) return
  tone(660, 0, 0.14, 0.07)
}

// ─────────────────────────────────────────────────────────────
//  Dozivanje konobara
//
//  Konobar ne gleda u ekran — nosi tanjire. Zato ovaj signal nije
//  jedno „ding" nego uporan zvuk koji se ponavlja SVE dok ga neko
//  ne prihvati. Namerno je dosadan; to mu je posao.
// ─────────────────────────────────────────────────────────────

let alarmTimer = null
let alarmKind = null

/** Tri oštra tona — probija se kroz žamor lokala. */
function alarmBurst() {
  tone(1046, 0, 0.16, 0.2)
  tone(1318, 0.18, 0.16, 0.2)
  tone(1568, 0.36, 0.3, 0.22)
}

/** Blaži, ali i dalje uporan — za novu porudžbinu. */
function orderBurst() {
  tone(784, 0, 0.2, 0.15)
  tone(1046, 0.22, 0.28, 0.16)
}

/**
 * @param {'call'|'order'} kind  doziv konobara je hitniji od porudžbine,
 *   pa zvuči oštrije i ponavlja se češće.
 */
export function startAlarm(kind = 'call') {
  // Doziv konobara preuzima prednost nad zvonom za porudžbine.
  if (alarmTimer && alarmKind === 'call' && kind === 'order') return
  if (alarmTimer && alarmKind === kind) return

  stopAlarm()
  alarmKind = kind

  const urgent = kind === 'call'
  const fire = () => {
    if (soundOn.value) (urgent ? alarmBurst : orderBurst)()
    // Vibracija ide i kad je zvuk isključen — telefon u džepu se oseti.
    navigator.vibrate?.(urgent ? [220, 120, 220, 120, 380] : [180, 120, 260])
  }

  fire()
  alarmTimer = setInterval(fire, urgent ? 3200 : 6000)
}

export function stopAlarm() {
  if (!alarmTimer) return
  clearInterval(alarmTimer)
  alarmTimer = null
  alarmKind = null
  navigator.vibrate?.(0)
}

export function alarmRunning() {
  return alarmTimer !== null
}

/** Vibracija na telefonu — konobar često ne gleda u ekran. */
export function buzz(pattern = [60, 40, 60]) {
  navigator.vibrate?.(pattern)
}

export function unlockAudio() {
  context()
}
