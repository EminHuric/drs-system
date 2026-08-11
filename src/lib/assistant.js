// ─────────────────────────────────────────────────────────────
//  Pomoćnik za goste
//
//  Odgovara na pitanja o meniju i preporučuje jela. Radi u dva
//  nivoa, pa nikad ne ostaje nem:
//
//   1. LOKALNO (uvek radi, ništa ne košta, ništa se ne podešava)
//      Pretraga i preporuka nad samim menijem. Pokriva ono što
//      gosti stvarno pitaju: šta je posno, šta je ljuto, šta je
//      najbolje ocenjeno, šta ima do 10 evra, ima li glutena.
//
//   2. GEMINI preko Firebase AI Logic (ako ga vlasnik uključi)
//      Slobodno pitanje, pun odgovor. Ključ NE stoji u aplikaciji —
//      poziv ide kroz Firebase, pa se ne može ukrasti. Gemini
//      Developer API ima besplatan nivo i radi na Spark planu.
//
//  ⚠️ Bezbednost je rešena time ŠTA se šalje, ne samo uputstvom:
//  u kontekst ulaze isključivo jela, cene, sastojci i alergeni.
//  Email vlasnika, telefoni, promet i porudžbine se ne šalju
//  nikad — pa nema šta ni da procuri.
// ─────────────────────────────────────────────────────────────

import { money } from './format.js'
import { BADGES } from './constants.js'

/** Sažetak menija koji se sme podeliti — bez ijednog privatnog podatka. */
export function buildMenuContext(rest, categories, items, scores = {}) {
  const cur = rest?.currency || '€'
  const byCat = new Map(categories.map((c) => [c.id, c.name]))

  const lines = items
    .filter((i) => i.active !== false)
    .map((i) => {
      const bits = [`${i.name} — ${money(i.price, cur)}`]
      const cat = byCat.get(i.categoryId)
      if (cat) bits.push(`kategorija: ${cat}`)
      if (i.desc) bits.push(i.desc)
      if (i.ingredients) bits.push(`sastojci: ${i.ingredients}`)
      if (i.portion) bits.push(`količina: ${i.portion}`)
      if (i.prepTime) bits.push(`priprema: ${i.prepTime} min`)
      if (i.allergens?.length) bits.push(`alergeni: ${i.allergens.join(', ')}`)
      if (i.badges?.length) bits.push(i.badges.map((b) => BADGES[b]?.label).filter(Boolean).join(', '))
      const s = scores[i.id]
      if (s?.count) bits.push(`ocena gostiju: ${s.avg.toFixed(1)} (${s.count})`)
      return '• ' + bits.join(' · ')
    })

  return [
    `Restoran: ${rest?.name || ''}`,
    rest?.tagline ? `Opis: ${rest.tagline}` : '',
    rest?.about ? `O lokalu: ${rest.about}` : '',
    rest?.hours ? `Radno vreme: ${rest.hours}` : '',
    '',
    'MENI:',
    ...lines,
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── lokalni odgovori ────────────────────────────────────────

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')

const has = (q, ...words) => words.some((w) => norm(q).includes(norm(w)))

/**
 * @returns {{text: string, items: object[]}} odgovor i jela za prikaz
 */
export function localAnswer(question, { rest, items, scores = {} }) {
  const cur = rest?.currency || '€'
  const live = items.filter((i) => i.active !== false)
  const q = norm(question)

  const rated = (i) => scores[i.id]?.avg || 0
  const byRating = (a, b) => rated(b) - rated(a)

  // preporuka
  if (has(q, 'preporu', 'sta da', 'najbolj', 'sta je dobro', 'sta mi savet', 'ne znam sta')) {
    const top = live
      .filter((i) => scores[i.id]?.count || i.badges?.includes('bestseller') || i.featured)
      .sort(byRating)
      .slice(0, 4)
    const pick = top.length ? top : live.slice(0, 4)
    return {
      text: pick.length
        ? 'Evo šta gosti najviše hvale kod nas:'
        : 'Meni se još popunjava — pitajte osoblje za preporuku.',
      items: pick,
    }
  }

  // posno / vegetarijansko
  if (has(q, 'posn', 'vegan', 'vegetarij', 'bez mesa')) {
    const v = live.filter(
      (i) => i.badges?.includes('vegan') || has(i.desc + ' ' + i.ingredients, 'povrc', 'salat', 'sir')
    )
    return {
      text: v.length ? 'Ovo je bez mesa:' : 'Nemamo posebno označena posna jela — pitajte osoblje.',
      items: v.slice(0, 6),
    }
  }

  // ljuto
  if (has(q, 'ljut', 'pikant')) {
    const v = live.filter((i) => i.badges?.includes('spicy') || has(i.desc, 'ljut', 'cili', 'jalapeno'))
    return { text: v.length ? 'Ovo je ljuto:' : 'Nemamo označeno ljuto jelo.', items: v.slice(0, 6) }
  }

  // alergeni i gluten
  if (has(q, 'gluten', 'alerg', 'laktoz', 'orasi', 'kikiriki')) {
    const bad = ['gluten', 'laktoza', 'orašasti plodovi', 'kikiriki'].find((a) => q.includes(norm(a)))
    const safe = live.filter((i) => !i.allergens?.some((a) => norm(a) === norm(bad || '')))
    return {
      text: bad
        ? `Ovo ne sadrži ${bad} prema podacima koje je uneo lokal. Ako je alergija ozbiljna, obavezno recite konobaru.`
        : 'Alergeni su naznačeni kod svakog jela. Otvorite jelo da ih vidite.',
      items: bad ? safe.slice(0, 6) : [],
    }
  }

  // cena
  const priceMatch = q.match(/(\d+)\s*(e|eur|evr|din|rsd|km)?/)
  if (has(q, 'jeftin', 'do ', 'ispod', 'budzet') && priceMatch) {
    const max = Number(priceMatch[1])
    const cheap = live.filter((i) => i.price <= max).sort((a, b) => a.price - b.price)
    return {
      text: cheap.length ? `Do ${money(max, cur)}:` : `Nemamo ništa do ${money(max, cur)}.`,
      items: cheap.slice(0, 6),
    }
  }

  // brzo
  if (has(q, 'brzo', 'najbrz', 'zurim', 'na brzin')) {
    const fast = live.filter((i) => i.prepTime).sort((a, b) => a.prepTime - b.prepTime)
    return {
      text: fast.length ? 'Ovo se sprema najbrže:' : 'Vreme pripreme nije uneto — pitajte osoblje.',
      items: fast.slice(0, 5),
    }
  }

  // radno vreme
  if (has(q, 'radno vreme', 'do kad', 'otvoreno', 'zatvarate')) {
    return { text: rest?.hours ? `Radno vreme: ${rest.hours}` : 'Radno vreme nije uneto.', items: [] }
  }

  // pretraga po nazivu ili sastojku
  const words = q.split(/\s+/).filter((w) => w.length > 2)
  if (words.length) {
    const found = live.filter((i) =>
      words.some((w) => norm(`${i.name} ${i.desc} ${i.ingredients}`).includes(w))
    )
    if (found.length) return { text: 'Pronašao sam ovo:', items: found.slice(0, 6) }
  }

  return {
    text:
      'Na to vam bolje odgovara osoblje. Mogu da pomognem oko jela: pitajte me šta da naručite, ' +
      'šta je bez mesa, šta je ljuto, šta je najbolje ocenjeno ili šta ima do određene cene.',
    items: [],
  }
}

// ─── Gemini preko Firebase (ako je uključen) ─────────────────

const SYSTEM = `Ti si ljubazan konobar u restoranu. Odgovaraš gostima ISKLJUČIVO na osnovu menija koji ti je dat.

PRAVILA — bez izuzetka:
• Govoriš samo o jelima, pićima, cenama, sastojcima, alergenima i preporukama iz datog menija.
• Ako te pitaju bilo šta o vlasniku, zaposlenima, prometu, drugim gostima, poslovanju ili bilo čemu van menija — ljubazno odbij i vrati razgovor na hranu.
• Ako podatka nema u meniju, reci da ne znaš i uputi gosta da pita konobara. Nikad ne izmišljaj jelo, cenu ili sastojak.
• Kod alergija uvek dodaj da provere sa konobarom.
• Odgovaraj kratko, najviše tri rečenice, toplo i bez uštogljenosti.
• Odgovaraj na jeziku na kojem te gost pita.`

let model = null
let aiState = 'unknown' // unknown | ready | off

export async function aiReady() {
  return aiState
}

async function getModel() {
  if (model) return model
  const { getAI, getGenerativeModel, GoogleAIBackend } = await import('firebase/ai')
  const { app } = await import('@/firebase')
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash-lite',
    systemInstruction: SYSTEM,
  })
  return model
}

/**
 * Slobodno pitanje preko Gemini-ja. Vraća null ako AI nije uključen —
 * pozivalac tada koristi lokalni odgovor i gost ne primeti razliku.
 */
export async function aiAnswer(question, context) {
  if (aiState === 'off') return null
  try {
    const m = await getModel()
    const res = await m.generateContent(
      `${context}\n\nPitanje gosta: ${question}\n\nOdgovori po pravilima.`
    )
    aiState = 'ready'
    return res.response.text().trim()
  } catch (e) {
    // Nije uključen u Firebase konzoli, nema kvote ili nema mreže —
    // svejedno, dalje se koristi lokalni odgovor.
    console.warn('[RDS] AI pomoćnik nije dostupan, koristi se lokalni odgovor.', e?.message || e)
    aiState = 'off'
    return null
  }
}
