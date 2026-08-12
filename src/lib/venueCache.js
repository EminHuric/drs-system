// ═══════════════════════════════════════════════════════════════
//  Dovlačenje lokala — prvo iz keša, pa tek onda sa mreže
//
//  Meni se otvara skeniranjem koda za stolom. Gost gleda u ekran i
//  čeka, a mreža u lokalu ume da bude jadna. Zato:
//
//   1. Ako je lokal već pročitan u ovoj poseti — vraća se odmah.
//   2. Ako ga Firestore ima u kešu na uređaju — vraća se odmah,
//      a svež se dovuče u pozadini i sam se ubaci.
//   3. Tek ako ničega nema — čeka se mreža.
//
//  Time druga poseta istom meniju kreće za desetak milisekundi
//  umesto za dve i po sekunde.
// ═══════════════════════════════════════════════════════════════

import {
  collection,
  getDocs,
  getDocsFromCache,
  limit,
  query,
  where,
} from 'firebase/firestore'
import { db } from '@/firebase'

const memorija = new Map()

// Isti lokal ume da se zatrazi dvaput u istom trenutku: jednom rano,
// dok se aplikacija jos podize, i jednom kad se ekran menija napravi.
// Drugi poziv se kaci na prvi umesto da salje isti upit ponovo.
const uToku = new Map()
const TRAJE = 5 * 60 * 1000 // duže nego što traje jedna poseta

export function rememberVenue(slug, venue) {
  if (!slug || !venue) return
  memorija.set(String(slug), { venue, at: Date.now() })
}

export function venueFromCache(slug) {
  const hit = memorija.get(String(slug))
  if (!hit) return null
  if (Date.now() - hit.at > TRAJE) {
    memorija.delete(String(slug))
    return null
  }
  return hit.venue
}

function upit(slug) {
  return query(collection(db, 'restaurants'), where('slug', '==', slug), limit(1))
}

function izSnimka(snap) {
  if (!snap || snap.empty) return null
  return { id: snap.docs[0].id, ...snap.docs[0].data() }
}

/**
 * Vraća lokal što je pre moguće i javlja svaku sledeću, svežiju
 * verziju kroz `onFresh`.
 *
 * @param {string} slug     adresa lokala iz putanje
 * @param {Function} onFresh  poziva se kad stigne verzija sa servera
 * @returns {Promise<object|null>}  ono što je moglo odmah
 */
export async function loadVenue(slug, onFresh) {
  const s = String(slug || '')
  if (!s) return null

  // 1. ista poseta
  const memo = venueFromCache(s)
  if (memo) {
    osveziUPozadini(s, onFresh)
    return memo
  }

  // 2. keš na uređaju
  try {
    const brzo = izSnimka(await getDocsFromCache(upit(s)))
    if (brzo) {
      rememberVenue(s, brzo)
      osveziUPozadini(s, onFresh)
      return brzo
    }
  } catch {
    // Keš nije uključen (privatni režim) — ide se pravo na mrežu.
  }

  // 3. mreža
  if (!uToku.has(s)) {
    uToku.set(
      s,
      getDocs(upit(s))
        .then((snap) => {
          const svez = izSnimka(snap)
          if (svez) rememberVenue(s, svez)
          return svez
        })
        .finally(() => uToku.delete(s))
    )
  }
  return uToku.get(s)
}

/**
 * Poziva se cim se zna adresa iz putanje, pre nego sto se ekran
 * napravi. Mreza tako radi uporedo sa podizanjem aplikacije umesto
 * da ceka na red.
 */
export function prefetchVenue(slug) {
  if (!slug) return
  loadVenue(slug).catch(() => {})
}

/**
 * Svežu verziju dovlačimo bez čekanja: gost već gleda meni, a ako je
 * vlasnik u međuvremenu promenio cenu, ona se sama ispravi pred njim.
 */
function osveziUPozadini(slug, onFresh) {
  getDocs(upit(slug))
    .then((snap) => {
      const svez = izSnimka(snap)
      if (!svez) return
      rememberVenue(slug, svez)
      if (typeof onFresh === 'function') onFresh(svez)
    })
    .catch(() => {
      // Nema mreže — gost i dalje ima meni iz keša, i to je poenta.
    })
}