// ═══════════════════════════════════════════════════════════════
//  Prvo čitanje menija — običnim HTTPS pozivom
//
//  Firestore SDK pre prvog podatka odradi svoje rukovanje sa serverom:
//  otvaranje kanala, proveru da li WebChannel prolazi, pa tek onda
//  upit. Izmereno na sagrađenoj verziji: oko dve sekunde do naziva
//  lokala, i to na dobroj vezi. Gost za stolom toliko gleda u prazno.
//
//  Meni je javan (`allow get, list: if true`), pa se prvo čitanje može
//  odraditi jednim običnim POST-om na Firestore REST — jedan odlazak i
//  povratak, bez rukovanja. SDK i dalje radi svoj posao: odmah zatim
//  se kači na iste podatke i od tada sve ide uživo.
//
//  Ako REST ne uspe iz bilo kog razloga, ništa se ne kvari — ekran
//  jednostavno sačeka SDK, kao i pre.
// ═══════════════════════════════════════════════════════════════

import { firebaseConfig } from '@/firebase'

const BASE =
  firebaseConfig?.projectId &&
  `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`

/** Firestore vraća vrednosti obeležene tipom; ovde se vraćaju u obične. */
function vrednost(v) {
  if (!v || typeof v !== 'object') return null
  if ('stringValue' in v) return v.stringValue
  if ('booleanValue' in v) return v.booleanValue
  if ('integerValue' in v) return Number(v.integerValue)
  if ('doubleValue' in v) return Number(v.doubleValue)
  if ('nullValue' in v) return null
  if ('timestampValue' in v) return new Date(v.timestampValue)
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(vrednost)
  if ('mapValue' in v) return polja(v.mapValue.fields)
  if ('referenceValue' in v) return v.referenceValue
  return null
}

function polja(fields) {
  const out = {}
  for (const [k, v] of Object.entries(fields || {})) out[k] = vrednost(v)
  return out
}

function dokument(d) {
  if (!d) return null
  return { id: String(d.name || '').split('/').pop(), ...polja(d.fields) }
}

async function upit(putanja, structuredQuery, signal) {
  const res = await fetch(`${BASE}${putanja}:runQuery?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery }),
    signal,
  })
  if (!res.ok) throw new Error('REST ' + res.status)

  const data = await res.json()
  if (!Array.isArray(data)) return []
  return data.map((red) => dokument(red.document)).filter(Boolean)
}

function poRedosledu(collectionId) {
  return {
    from: [{ collectionId }],
    orderBy: [{ field: { fieldPath: 'sort' }, direction: 'ASCENDING' }],
  }
}

const KLJUC = (slug) => 'rds.rid.' + slug

/** Broj lokala se pamti da se drugi put ne bi trazio posebnim odlaskom. */
function zapamtiBroj(slug, id) {
  try {
    localStorage.setItem(KLJUC(slug), id)
  } catch {
    /* privatni rezim */
  }
}

function poznatBroj(slug) {
  try {
    return localStorage.getItem(KLJUC(slug)) || null
  } catch {
    return null
  }
}

/**
 * Dovlači lokal, kategorije i jela — dovoljno da se meni nacrta.
 *
 * Prvi put su to dva odlaska do servera: jedan da se po adresi nađe
 * lokal, drugi po njegov meni. Broj lokala se posle pamti, pa svaki
 * sledeći put ide u jednom odlasku.
 *
 * @returns {Promise<{venue: object, categories: array, items: array}|null>}
 */
export async function fastMenu(slug, signal, idIzKoda) {
  if (!BASE || !slug) return null
  if (idIzKoda) zapamtiBroj(slug, idIzKoda)

  // Ako se broj lokala već zna, sve tri stvari idu uporedo. Na vezi gde
  // jedan odlazak traje pola sekunde, to je pola sekunde manje čekanja.
  const znan = poznatBroj(slug)
  if (znan) {
    const [lokal, categories, items] = await Promise.all([
      upit('', {
        from: [{ collectionId: 'restaurants' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'slug' },
            op: 'EQUAL',
            value: { stringValue: String(slug) },
          },
        },
        limit: 1,
      }, signal),
      upit(`/restaurants/${znan}`, poRedosledu('categories'), signal).catch(() => []),
      upit(`/restaurants/${znan}`, poRedosledu('items'), signal).catch(() => []),
    ])

    const venue = lokal[0]
    if (venue && venue.id === znan) return { venue, categories, items }
    // Lokal je dobio novi broj — dalje se ide obicnim putem.
  }

  const nadjen = await upit(
    '',
    {
      from: [{ collectionId: 'restaurants' }],
      where: {
        fieldFilter: {
          field: { fieldPath: 'slug' },
          op: 'EQUAL',
          value: { stringValue: String(slug) },
        },
      },
      limit: 1,
    },
    signal
  )

  const venue = nadjen[0]
  if (!venue) return null
  zapamtiBroj(slug, venue.id)

  const [categories, items] = await Promise.all([
    upit(`/restaurants/${venue.id}`, poRedosledu('categories'), signal).catch(() => []),
    upit(`/restaurants/${venue.id}`, poRedosledu('items'), signal).catch(() => []),
  ])

  return { venue, categories, items }
}
