// ═══════════════════════════════════════════════════════════════
//  Prevod sadržaja koji je vlasnik uneo
//
//  Naša dugmad i poruke prevodi lib/i18n.js — one su unapred
//  napisane na šest jezika. Ali naziv jela, opis, sastojci, oznake
//  i utisci gostiju su tekst koji vlasnik kuca sam; njih niko
//  unapred ne može da prevede.
//
//  Zato ovde ide mašinski prevod preko istog Gemini modela koji već
//  pokreće pomoćnika gostu — bez ključa u kodu i bez servera, jer
//  Firebase AI Logic radi na besplatnom planu.
//
//  Pravila kojih se držimo:
//   • Prevod nikad ne sme da obori meni. Ako AI nije dostupan,
//     gost vidi original i ne dobija nijednu poruku o grešci.
//   • Svaki string se prevodi jednom po jeziku i pamti u pregledaču,
//     pa drugi dolazak na meni ne troši ništa.
//   • Traži se JSON, ne slobodan tekst — model tako ne može da
//     „doda objašnjenje" umesto prevoda.
// ═══════════════════════════════════════════════════════════════

import { reactive } from 'vue'
import { LOCALES } from './i18n'

const STORE = 'rds.tr.'
const CHUNK = 40 // koliko stringova ide u jedan zahtev
const MAX_LEN = 900 // duži tekst od ovoga se ne prevodi (utisak-roman)

// Rečnici po lokalu i jeziku: { 'rid:en': { 'Pljeskavica': 'Beef patty' } }
const dicts = reactive({})

// Šta je već poslato, da isti string ne krene dvaput dok prvi traje.
const inFlight = new Set()

let model = null
let state = 'unknown' // unknown | ready | off

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

/**
 * Prevede sve što još nije prevedeno. Poziva se kad gost promeni jezik
 * ili kad vlasnik doda jelo dok je meni otvoren.
 *
 * Ne vraća ništa i ne baca — rezultat se sam pojavi u rečniku, a
 * pogledi koji čitaju `tr()` se osveže jer je rečnik reaktivan.
 */
export async function ensure(rid, locale, from, strings) {
  if (!rid || !locale || locale === from || state === 'off') return

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

  const fromName = LOCALES[from]?.name || 'Srpski'
  const toName = LOCALES[locale]?.name || locale

  for (let i = 0; i < missing.length; i += CHUNK) {
    const batch = missing.slice(i, i + CHUNK)
    batch.forEach((s) => inFlight.add(k + '|' + s))

    try {
      const m = await getModel()
      const res = await m.generateContent(prompt(batch, fromName, toName))
      const out = parseList(res.response.text(), batch.length)

      if (out) {
        // Novi objekat, da Vue primeti promenu i osveži meni.
        const next = { ...dicts[k] }
        batch.forEach((s, j) => {
          const v = out[j]?.trim()
          if (v) next[s] = v
        })
        dicts[k] = next
        write(k, next)
        state = 'ready'
      }
    } catch (e) {
      // Nije uključen u konzoli, nema kvote ili nema mreže. Gost i
      // dalje vidi meni, samo na izvornom jeziku.
      console.warn('[RDS] Prevod menija nije dostupan.', e?.message || e)
      state = 'off'
      batch.forEach((s) => inFlight.delete(k + '|' + s))
      return
    } finally {
      batch.forEach((s) => inFlight.delete(k + '|' + s))
    }
  }
}

/** Da li je prevod uopšte moguć — za sitnu napomenu gostu. */
export function translatorOff() {
  return state === 'off'
}
