// ─────────────────────────────────────────────────────────────
//  Radnje platforme nad nalogom restorana
//
//  Izdvojeno jer se isto brisanje poziva sa spiska restorana i sa
//  stranice pojedinog lokala — a brisanje je poslednja stvar koja
//  sme da se razlikuje između dva mesta u aplikaciji.
// ─────────────────────────────────────────────────────────────

import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  serverTimestamp,
  updateDoc,
  where,
  query,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase'

/** Podkolekcije lokala — Firestore ih ne briše sam uz roditelja. */
const SUBS = ['items', 'categories', 'tables', 'reviews', 'orders']

/**
 * Briše lokal sa svim sadržajem, rezervisanom adresom i pozivnicama.
 *
 * @param {{id:string, slug?:string}} rest
 * @param {(text:string)=>void} [onStep] javlja dokle je stiglo
 */
export async function deleteRestaurant(rest, onStep = () => {}) {
  for (const sub of SUBS) {
    onStep(`Brišem: ${sub}`)
    const snap = await getDocs(collection(db, 'restaurants', rest.id, sub))

    // Poruke žive ispod porudžbina, pa idu pre njih.
    if (sub === 'orders') {
      for (const d of snap.docs) {
        const msgs = await getDocs(collection(d.ref, 'messages'))
        for (let i = 0; i < msgs.docs.length; i += 400) {
          const b = writeBatch(db)
          msgs.docs.slice(i, i + 400).forEach((m) => b.delete(m.ref))
          await b.commit()
        }
      }
    }

    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(db)
      snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref))
      await batch.commit()
    }
  }

  onStep('Brišem pozivnice')
  const invites = await getDocs(
    query(collection(db, 'invites'), where('restaurantId', '==', rest.id))
  )
  for (const d of invites.docs) await deleteDoc(d.ref).catch(() => {})

  onStep('Brišem nalog')
  await deleteDoc(doc(db, 'restaurants', rest.id))
  if (rest.slug) await deleteDoc(doc(db, 'slugs', rest.slug)).catch(() => {})
}

/** Blokira ili odblokira lokal, pamteći prethodni status. */
export async function setBlocked(rest, blocked) {
  await updateDoc(doc(db, 'restaurants', rest.id), {
    status: blocked ? 'blocked' : rest.prevStatus || 'active',
    prevStatus: blocked ? rest.status : null,
    blockedAt: blocked ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Odvezuje vlasnika od lokala — nalog za prijavu ostaje, ali gubi
 * pristup panelu. Koristi se kad lokal menja vlasnika.
 */
export async function detachOwner(rest) {
  await updateDoc(doc(db, 'restaurants', rest.id), {
    ownerUid: null,
    ownerEmail: '',
    ownerName: '',
    status: 'pending',
    updatedAt: serverTimestamp(),
  })
}
