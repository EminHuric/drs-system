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
    .replace(/[^a-z0-9\s]/g, ' ')

// Reči koje ništa ne znače u pitanju. Bez ovoga „ima li nešto kiselo"
// hvata reč „ima" i vraća pola menija.
const STOP = new Set(
  ('ima imate imas li da ne nema sta sto nesto neka neki neko nekakvo moze mogu mi me mene ' +
    'za na od do kod sa uz po je su bi bih bismo hocu hoces zelim zelite molim vas vam ' +
    'kakav kakva kakvo koje koji koja jel jeli ovde tu tamo jedno jedan jednu malo puno ' +
    'kao ali ili pa te se sam si smo ste su bio bila jos vec samo baš bas dobro ok ').split(/\s+/)
)

/**
 * Gruba osnova reči. Srpski menja nastavke („pršuta", „pršutom"), pa
 * poređenje celih reči promašuje ono što je očigledno isto.
 */
function stem(w) {
  if (w.length > 6) return w.slice(0, w.length - 2)
  if (w.length > 4) return w.slice(0, w.length - 1)
  return w
}

function keywords(q) {
  return norm(q)
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem)
}

// Ukusi se ne pišu u meniju, pa se prepoznaju po sastojcima.
const TASTES = {
  kiselo: ['limun', 'sirce', 'kiselo', 'kupus', 'krastavac', 'jogurt', 'pavlak', 'vinegret', 'pomorandz', 'grejp', 'turs'],
  slatko: ['secer', 'med', 'cokolad', 'krem', 'tort', 'kolac', 'sladoled', 'palacink', 'baklav', 'dzem', 'vocn'],
  slano: ['slanin', 'prsut', 'masline', 'pancet', 'incun', 'kackavalj', 'feta', 'suho'],
  ljuto: ['ljut', 'cili', 'jalapeno', 'papric', 'pikant', 'ajvar'],
  lagano: ['salat', 'supa', 'corb', 'riba', 'povrc', 'grilovan'],
  jako: ['rostilj', 'mesan', 'pljeskavic', 'cevap', 'rebra', 'stek', 'burger'],
}

const HAY = (i) => norm([i.name, i.desc, i.ingredients, (i.badges || []).join(' '), (i.allergens || []).join(' ')].join(' '))

/** Pretraga sa bodovanjem: naziv vredi više od opisa. */
function search(items, words) {
  if (!words.length) return []
  return items
    .map((i) => {
      const name = norm(i.name)
      const ing = norm(i.ingredients)
      const desc = norm(i.desc)
      let score = 0
      for (const w of words) {
        if (name.includes(w)) score += 10
        else if (ing.includes(w)) score += 6
        else if (desc.includes(w)) score += 4
      }
      return { i, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.i)
}

function byTaste(items, taste) {
  const keys = TASTES[taste] || []
  return items.filter((i) => keys.some((k) => HAY(i).includes(k)))
}

/**
 * @returns {{text: string, items: object[]}} odgovor i jela za prikaz
 */
export function localAnswer(question, { rest, items, scores = {} }) {
  const cur = rest?.currency || '€'
  const live = items.filter((i) => i.active !== false)
  const q = norm(question)
  const words = keywords(question)
  const rated = (i) => scores[i.id]?.avg || 0

  // ── radno vreme ──
  if (/(radno vreme|do kad|otvoreno|zatvarate|kad radite)/.test(q)) {
    return { text: rest?.hours ? `Radno vreme: ${rest.hours}` : 'Radno vreme nije uneto — pitajte osoblje.', items: [] }
  }

  // ── ukus: kiselo, slatko, ljuto… ──
  for (const taste of Object.keys(TASTES)) {
    if (q.includes(taste) || (taste === 'jako' && /jac|zasitn|obrok/.test(q))) {
      const found = byTaste(live, taste)
      if (found.length) return { text: `Evo šta bih izdvojio kao ${taste}:`, items: found.slice(0, 6) }
      return {
        text: `Nemam ništa označeno kao ${taste} u meniju. Pitajte konobara, možda ima nešto što nije upisano.`,
        items: [],
      }
    }
  }

  // ── bez mesa ──
  if (/(posn|vegan|vegetarij|bez mesa)/.test(q)) {
    const v = live.filter(
      (i) => i.badges?.includes('vegan') || (!/(mes|pilet|junet|svinj|prsut|slanin|riba|skamp|rostilj)/.test(HAY(i)) && /(salat|povrc|sir|testenin|supa)/.test(HAY(i)))
    )
    return {
      text: v.length ? 'Ovo je bez mesa:' : 'Nemamo posebno označeno posno jelo — pitajte konobara.',
      items: v.slice(0, 6),
    }
  }

  // ── alergeni ──
  const allergen = ['gluten', 'laktoz', 'orasi', 'kikiriki', 'jaja', 'soja'].find((a) => q.includes(a))
  if (allergen) {
    const safe = live.filter((i) => !(i.allergens || []).some((x) => norm(x).includes(allergen)))
    return {
      text: `Prema podacima koje je uneo lokal, ovo ne sadrži ${allergen}. Ako je alergija ozbiljna, obavezno recite konobaru pre nego što naručite.`,
      items: safe.slice(0, 6),
    }
  }

  // ── cena ──
  const price = q.match(/(\d+)/)
  if (price && /(do|ispod|jeftin|budzet|manje od)/.test(q)) {
    const max = Number(price[1])
    const cheap = live.filter((i) => i.price <= max).sort((a, b) => a.price - b.price)
    return {
      text: cheap.length ? `Do ${money(max, cur)}:` : `Nemamo ništa do ${money(max, cur)}. Najjeftinije je ${money(Math.min(...live.map((i) => i.price)), cur)}.`,
      items: cheap.slice(0, 6),
    }
  }

  // ── brzo ──
  if (/(brzo|najbrz|zurim|na brzin|nemam vremena)/.test(q)) {
    const fast = live.filter((i) => i.prepTime).sort((a, b) => a.prepTime - b.prepTime)
    return { text: fast.length ? 'Ovo se sprema najbrže:' : 'Vreme pripreme nije uneto — pitajte konobara.', items: fast.slice(0, 5) }
  }

  // ── konkretno jelo ili sastojak (pršut, hobotnica, sir…) ──
  const found = search(live, words)
  if (found.length) {
    return {
      text: found.length === 1 ? 'Da, imamo:' : 'Da, imamo ovo:',
      items: found.slice(0, 6),
    }
  }

  // ── preporuka ──
  if (/(preporu|sta da|najbolj|sta je dobro|savet|ne znam sta|izabe)/.test(q) || !words.length) {
    const top = live
      .filter((i) => scores[i.id]?.count || i.badges?.includes('bestseller') || i.featured)
      .sort((a, b) => rated(b) - rated(a))
    const pick = (top.length ? top : live).slice(0, 4)
    return { text: pick.length ? 'Evo šta gosti najviše hvale:' : 'Meni se još popunjava.', items: pick }
  }

  // ── iskreno „ne znam" umesto pogrešnog pogotka ──
  return {
    text:
      'To nemam u meniju. Pitajte konobara — možda imaju nešto što nije upisano. ' +
      'Ja mogu da pomognem oko jela: šta da naručite, šta je bez mesa, šta je ljuto ili kiselo, ' +
      'i šta ima do određene cene.',
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
