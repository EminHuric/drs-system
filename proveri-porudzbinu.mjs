// ═══════════════════════════════════════════════════════════════
//  Provera: da li promena statusa stvarno stiže gostu
//
//  Gost je prijavljivao da posle „Pošalji" zauvek stoji „čeka
//  potvrdu" iako je osoblje prihvatilo. Ovo pravi pravu porudžbinu
//  na pravoj bazi, kači se na nju kao što se kači i ekran praćenja,
//  pa proverava da li promena zaista dođe.
//
//  Napravljena porudžbina se odmah otkazuje i nosi oznaku da je
//  probna, da se ne pomeša sa pravim gostima.
//
//  Pokretanje:  node proveri-porudzbinu.mjs
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import {
  addDoc,
  collection,
  doc,
  getDocs,
  getFirestore,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { FALLBACK_CONFIG } from './src/firebase.config.js'

const zeleno = (s) => `\x1b[32m${s}\x1b[0m`
const crveno = (s) => `\x1b[31m${s}\x1b[0m`

const app = initializeApp(FALLBACK_CONFIG)
const auth = getAuth(app)
const db = getFirestore(app)

console.log('\n  Provera: stiže li promena statusa gostu\n')

const { user } = await signInAnonymously(auth)
console.log(`  ✔ anonimna sesija: ${user.uid.slice(0, 8)}…`)

const snap = await getDocs(
  query(collection(db, 'restaurants'), where('status', '==', 'active'), limit(1))
)
if (snap.empty) {
  console.log(crveno('  ✘ nema nijednog aktivnog lokala za probu\n'))
  process.exit(1)
}
const rid = snap.docs[0].id
console.log(`  ✔ lokal: ${snap.docs[0].data().name}`)

const ref_ = await addDoc(collection(db, 'restaurants', rid, 'orders'), {
  guestUid: user.uid,
  status: 'new',
  type: 'dinein',
  code: 'PROBA',
  total: 0,
  currency: 'RSD',
  lines: [{ itemId: 'proba', name: 'PROBNA PORUDŽBINA — zanemarite', price: 0, qty: 1 }],
  guest: { name: 'Provera sistema', phone: '', address: '' },
  createdAt: serverTimestamp(),
})
console.log(`  ✔ porudžbina napravljena: ${ref_.id}`)

// Ovako se kači i ekran praćenja.
const videno = []
const stop = onSnapshot(
  doc(db, 'restaurants', rid, 'orders', ref_.id),
  (s) => {
    if (s.exists()) videno.push(s.data().status)
  },
  (e) => {
    console.log(crveno('  ✘ slušalac je odbijen: ' + e.code))
    process.exit(1)
  }
)

await new Promise((r) => setTimeout(r, 1200))
await updateDoc(ref_, { status: 'cancelled', cancelReason: 'probna', updatedAt: serverTimestamp() })
await new Promise((r) => setTimeout(r, 2500))
stop()

console.log(`  ✔ slušalac je video: ${videno.join(' → ')}`)

if (videno.includes('new') && videno.includes('cancelled')) {
  console.log(zeleno('\n  Promena statusa stiže gostu uživo.\n'))
  process.exit(0)
}

console.log(crveno('\n  Promena NIJE stigla — gost bi ostao na starom statusu.\n'))
process.exit(1)
