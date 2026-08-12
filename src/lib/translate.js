// ═══════════════════════════════════════════════════════════════
//  Prevod sadržaja koji je vlasnik uneo
//
//  Našu dugmad i poruke prevodi lib/i18n.js — one su unapred
//  napisane na šest jezika. Ali naziv jela, opis, sastojci, oznake
//  i utisci gostiju su tekst koji vlasnik kuca sam; njih niko
//  unapred ne može da prevede.
//
//  Prevod ide preko tri izvora, redom, dok jedan ne uspe:
//
//   1. Gemini (Firebase AI Logic) — najbolji za meni, jer razume da
//      prevodi hranu. Radi samo ako je u Firebase konzoli podešen
//      App Check; ako nije, vraća 401 i preskače se.
//   2. Google prevodilac — javni krajnji tačka bez ključa. Radi iz
//      pregledača i pokriva sve naše jezike.
//   3. MyMemory — poslednja mreža za hvatanje.
//
//  Pravila kojih se držimo:
//   • Prevod nikad ne sme da obori meni. Ako nijedan izvor ne radi,
//     gost vidi original i ne dobija nijednu poruku o grešci.
//   • Svaki string se prevodi jednom po jeziku i pamti u pregledaču,
//     pa drugi dolazak na meni ne troši ništa.
// ═══════════════════════════════════════════════════════════════

import { reactive } from 'vue'
import { LOCALES } from './i18n'

const STORE = 'rds.tr.'
const CHUNK = 24 // koliko stringova ide u jedan zahtev
const MAX_LEN = 900 // duži tekst od ovoga se ne prevodi (utisak-roman)

// Rečnici po lokalu i jeziku: { 'rid:en': { 'Pljeskavica': 'Beef patty' } }
const dicts = reactive({})

// Šta je već poslato, da isti string ne krene dvaput dok prvi traje.
const inFlight = new Set()

let geminiOff = false
let allOff = false
let model = null

function key(rid, locale) {
  return rid + ':' + locale
}

function read(k) {
  try {
    return JSON.parse(localStorage.getItem(STORE + k) || '{}')
  } catch {
    return {}
  }
}

function write(k, dict) {
  try {
    localStorage.setItem(STORE + k, JSON.stringify(dict))
  } catch {
    /* pun ili privatni režim — prevod i dalje radi, samo se ne pamti */
  }
}

function dict(rid, locale) {
  const k = key(rid, locale)
  if (!dicts[k]) dicts[k] = read(k)
  return dicts[k]
}

/**
 * Prevod jednog stringa. Vraća original dok prevod ne stigne — meni
 * je tako uvek čitljiv, a reči se same smenjuju kad odgovor dođe.
 */
export function tr(rid, locale, from, text) {
  const s = String(text || '')
  if (!s || !rid || !locale || locale === from) return s
  return dict(rid, locale)[s] || s
}

// ─── izvor 1: Gemini ────────────────────────────────────────────

async function getModel() {
  if (model) return model
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
  const { app } = await import('@/firebase')
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash-lite',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  })
  return model
}

function prompt(list, fromName, toName) {
  return [
    `Prevedi sa jezika "${fromName}" na jezik "${toName}".`,
    'Ovo su stavke restoranskog menija i utisci gostiju.',
    '',
    'PRAVILA:',
    '• Vrati ISKLJUČIVO JSON niz stringova, iste dužine i istog redosleda kao ulaz.',
    '• Nijedan komentar, objašnjenje ni oznaka koda — samo niz.',
    '• Zadrži brojeve, mere i cene tačno kako jesu (350g ostaje 350g).',
    '• Robne marke i vlastita imena ne prevodi (Coca-Cola, Jelen, Nutella).',
    '• Nazive jela prevodi tako da gost odmah zna šta jede; ako naziv nema',
    '  prevod u tom jeziku, ostavi original i dodaj kratko pojašnjenje u zagradi.',
    '• Ton zadrži isti — kratko ostaje kratko.',
    '',
    'ULAZ:',
    JSON.stringify(list),
  ].join('\n')
}

/** Model ume da vrati niz u omotu; ovde se izvlači ono što je zaista niz. */
function parseList(raw, expected) {
  let text = String(raw || '').trim()
  if (text.startsWith('```')) text = text.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '')

  let data
  try {
    data = JSON.parse(text)
  } catch {
    return null
  }

  if (!Array.isArray(data) && data && typeof data === 'object') {
    data = Object.values(data).find((v) => Array.isArray(v))
  }
  if (!Array.isArray(data) || data.length !== expected) return null
  return data.map((x) => (typeof x === 'string' ? x : String(x ?? '')))
}

async function viaGemini(list, from, to) {
  if (geminiOff) return null
  try {
    const m = await getModel()
    const res = await m.generateContent(
      prompt(list, LOCALES[from]?.name || from, LOCALES[to]?.name || to)
    )
    const out = parseList(res.response.text(), list.length)
    if (!out) return null
    return out
  } catch (e) {
    // Najčešće: App Check nije podešen u Firebase konzoli (401).
    // Ne ponavlja se — dalje idu ostali izvori.
    console.warn('[RDS] Gemini prevod nije dostupan, ide rezervni izvor.', e?.message || e)
    geminiOff = true
    return null
  }
}

// ─── izvor 2: Google prevodilac ─────────────────────────────────
//
// Javna tačka bez ključa. Prima ceo blok teksta, pa se stavke šalju
// razdvojene praznim redom i tako se vraćaju — ako se broj delova ne
// poklopi, batch se odbacuje i ide sledeći izvor. Bolje ništa nego
// pomeren prevod, gde bi cena stajala uz pogrešno jelo.

const SEP = '\n@@@\n'

async function viaGoogle(list, from, to) {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx' +
    `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&dt=t&q=` +
    encodeURIComponent(list.join(SEP))

  const res = await fetch(url)
  if (!res.ok) throw new Error('google ' + res.status)

  const data = await res.json()
  if (!Array.isArray(data?.[0])) return null

  const joined = data[0].map((seg) => seg?.[0] || '').join('')
  const parts = joined.split(/\s*@@@\s*/).map((s) => s.trim())
  if (parts.length !== list.length) return null
  return parts
}

// ─── izvor 3: MyMemory ──────────────────────────────────────────

async function viaMyMemory(list, from, to) {
  const out = []
  for (const s of list) {
    const url =
      'https://api.mymemory.translated.net/get?q=' +
      encodeURIComponent(s) +
      `&langpair=${encodeURIComponent(from)}|${encodeURIComponent(to)}`
    const res = await fetch(url)
    if (!res.ok) throw new Error('mymemory ' + res.status)
    const data = await res.json()
    out.push(String(data?.responseData?.translatedText || s))
  }
  return out
}

async function translateBatch(list, from, to) {
  for (const source of [viaGemini, viaGoogle, viaMyMemory]) {
    try {
      const out = await source(list, from, to)
      if (out && out.length === list.length) return out
    } catch (e) {
      console.warn('[RDS] Izvor prevoda nije uspeo, ide sledeći.', e?.message || e)
    }
  }
  return null
}

/**
 * Prevede sve što još nije prevedeno. Poziva se kad gost promeni jezik
 * ili kad vlasnik doda jelo dok je meni otvoren.
 *
 * Ne vraća ništa i ne baca — rezultat se sam pojavi u rečniku, a
 * pogledi koji čitaju `tr()` se osveže jer je rečnik reaktivan.
 */
export async function ensure(rid, locale, from, strings) {
  if (!rid || !locale || locale === from || allOff) return

  const d = dict(rid, locale)
  const k = key(rid, locale)

  const missing = []
  const seen = new Set()
  for (const raw of strings) {
    const s = String(raw || '').trim()
    if (!s || s.length > MAX_LEN) continue
    if (d[s] || seen.has(s) || inFlight.has(k + '|' + s)) continue
    seen.add(s)
    missing.push(s)
  }
  if (!missing.length) return

  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK)
    batch.forEach((s) => inFlight.add(k + '|' + s))

    const out = await translateBatch(batch, from, locale)

    if (out) {
      // Novi objekat, da Vue primeti promenu i osveži meni.
      const next = { ...dicts[k] }
      batch.forEach((s, j) => {
        const v = out[j]?.trim()
        if (v) next[s] = v
      })
      dicts[k] = next
      write(k, next)
    }

    batch.forEach((s) => inFlight.delete(k + '|' + s))

    // Nijedan izvor ne radi — nema svrhe daviti mrežu ostatkom menija.
    if (!out) {
      allOff = true
      return
    }
  }
}

/** Da li je prevod uopšte moguć — za sitnu napomenu gostu. */
export function translatorOff() {
  return allOff
}
