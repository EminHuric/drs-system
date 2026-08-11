// ─────────────────────────────────────────────────────────────
//  Provera Firebase podešavanja
//
//  Poveže se na tvoj projekat i redom proveri sve što sistemu
//  treba da bi radio. Umesto nagađanja "zašto se admin ne otvara",
//  ovde tačno piše koji korak fali.
//
//  Pokretanje:  node proveri-firebase.mjs
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  getAuth,
  signInAnonymously,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { collection, getDocs, getFirestore, limit, query } from 'firebase/firestore'

const OK = '  \x1b[32m✔\x1b[0m'
const NO = '  \x1b[31m✘\x1b[0m'
const HM = '  \x1b[33m!\x1b[0m'

let problems = []

function fail(what, why, fix) {
  console.log(`${NO} ${what}`)
  console.log(`      ${why}`)
  problems.push({ what, fix })
}

function pass(what, extra = '') {
  console.log(`${OK} ${what}${extra ? '  \x1b[90m' + extra + '\x1b[0m' : ''}`)
}

// ── 1. .env ──────────────────────────────────────────────────

console.log('\n\x1b[1mRDS — provera Firebase podešavanja\x1b[0m\n')

let env = {}
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
} catch {
  console.log(`${NO} Fajl .env ne postoji u ovom folderu.`)
  console.log('      Pokreni skriptu iz foldera drs-system.\n')
  process.exit(1)
}

const need = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
]
const missing = need.filter((k) => !env[k])

if (missing.length) {
  fail('.env nije popunjen', 'Nedostaje: ' + missing.join(', '), 'Popuni .env vrednostima iz Firebase konzole.')
  console.log('')
  process.exit(1)
}
pass('.env je popunjen', 'projekat: ' + env.VITE_FIREBASE_PROJECT_ID)

const adminEmail = (env.VITE_SUPER_ADMIN_EMAILS || '').split(',')[0].trim().toLowerCase()
if (!adminEmail) {
  fail('Nije upisan admin email', 'VITE_SUPER_ADMIN_EMAILS je prazan.', 'Upiši svoj email u .env.')
} else {
  pass('Admin email iz .env', adminEmail)
}

// ── 2. isti email u pravilima ────────────────────────────────

try {
  const rules = readFileSync('firestore.rules', 'utf8')
  const m = rules.match(/function\s+superAdmins\s*\(\s*\)\s*\{[^}]*?\[([^\]]*)\]/s)
  const inRules = m ? m[1].replace(/['"\s]/g, '').split(',').filter(Boolean) : []
  if (inRules.map((e) => e.toLowerCase()).includes(adminEmail)) {
    pass('Isti email stoji i u firestore.rules')
  } else {
    fail(
      'Email u firestore.rules se NE poklapa sa .env',
      `u pravilima: ${inRules.join(', ') || '(prazno)'}   u .env: ${adminEmail}`,
      'Otvori firestore.rules → funkcija superAdmins() → upiši isti email kao u .env, pa ponovo Publish u Firebase konzoli.'
    )
  }
} catch {
  fail('Fajl firestore.rules nije pronađen', '', 'Pokreni skriptu iz foldera drs-system.')
}

// ── 3. veza sa projektom ─────────────────────────────────────

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const db = getFirestore(app)

// ── 4. anonimna prijava (gosti) ──────────────────────────────

let anonOk = false
try {
  await signInAnonymously(auth)
  anonOk = true
  pass('Anonymous prijava je uključena', '(gosti mogu da poručuju)')
} catch (e) {
  // Firebase vraća dva različita koda za istu stvar — isključen Anonymous.
  if (e.code === 'auth/operation-not-allowed' || e.code === 'auth/admin-restricted-operation') {
    fail(
      'Anonymous prijava NIJE uključena',
      'Bez nje gosti ne mogu da pošalju porudžbinu. (Admin panel radi i bez ovoga.)',
      'Firebase → Authentication → Sign-in method → Add new provider → Anonymous → Enable → Save'
    )
  } else if (e.code === 'auth/configuration-not-found') {
    fail(
      'Authentication uopšte nije uključen na projektu',
      'Firebase još nije aktivirao Authentication.',
      'Firebase → Build → Authentication → Get started, pa uključi Email/Password i Anonymous.'
    )
  } else {
    fail('Anonymous prijava ne radi', `${e.code || ''} ${e.message}`, 'Proveri Authentication → Sign-in method.')
  }
}

// ── 5. Firestore baza + pravila ──────────────────────────────

try {
  await getDocs(query(collection(db, 'restaurants'), limit(1)))
  pass('Firestore baza postoji i pravila su objavljena')
} catch (e) {
  if (e.code === 'permission-denied') {
    fail(
      'Pravila NISU objavljena (ili su pogrešna)',
      'Baza odbija i čitanje javnog spiska restorana.',
      'Kopiraj ceo firestore.rules → Firebase → Firestore Database → tab Rules → nalepi → Publish'
    )
  } else if (e.code === 'not-found' || /NOT_FOUND|does not exist/i.test(e.message)) {
    fail(
      'Firestore baza nije napravljena',
      'Projekat postoji, ali baze nema.',
      'Firebase → Build → Firestore Database → Create database → region eur3 → Production mode'
    )
  } else if (e.code === 'unavailable') {
    fail('Nema veze sa Firestore-om', 'Proveri internet.', 'Pokušaj ponovo.')
  } else {
    fail('Firestore ne odgovara', `${e.code || ''} ${e.message}`, 'Proveri da je baza napravljena.')
  }
}

if (anonOk) await signOut(auth).catch(() => {})

// ── 6. da li admin nalog postoji ─────────────────────────────

if (adminEmail) {
  try {
    // Namerno pogrešna lozinka: zanima nas SAMO kako Firebase odgovori.
    await signInWithEmailAndPassword(auth, adminEmail, 'namerno-pogresna-lozinka-x9f2')
    pass('Admin nalog postoji')
    await signOut(auth).catch(() => {})
  } catch (e) {
    if (e.code === 'auth/operation-not-allowed') {
      fail(
        'Email/Password prijava NIJE uključena',
        'Bez nje ne možeš da se prijaviš u admin panel.',
        'Firebase → Authentication → Sign-in method → Email/Password → Enable → Save'
      )
    } else if (e.code === 'auth/wrong-password') {
      pass('Admin nalog postoji', '(lozinka je druga — to je i očekivano)')
    } else if (e.code === 'auth/user-not-found') {
      fail(
        `Nalog ${adminEmail} ne postoji`,
        'Nema ga u Authentication → Users.',
        `Firebase → Authentication → Users → Add user → ${adminEmail} + lozinka`
      )
    } else if (e.code === 'auth/invalid-credential') {
      // Da je Email/Password isključen, dobili bismo operation-not-allowed.
      // Ovaj odgovor znači: prijava emailom radi, ali ili nalog ne postoji
      // ili je lozinka druga — a to Firebase namerno ne razlikuje.
      pass('Email/Password prijava je uključena')
      console.log(`${HM} Ne mogu da proverim da li nalog ${adminEmail} postoji`)
      console.log('      Firebase to krije (zaštita od pogađanja naloga).')
      console.log('      \x1b[90mProveri ručno: Authentication → Users → mora postojati taj email.\x1b[0m')
    } else if (e.code === 'auth/too-many-requests') {
      console.log(`${HM} Previše pokušaja prijave — proveri nalog ručno u Authentication → Users.`)
    } else {
      fail('Prijava emailom ne radi', `${e.code || ''} ${e.message}`, 'Proveri Authentication → Sign-in method.')
    }
  }
}

// ── zaključak ────────────────────────────────────────────────

console.log('')
if (!problems.length) {
  console.log('\x1b[32m\x1b[1m  Sve je podešeno.\x1b[0m')
  console.log('  Pokreni  npm run dev  i otvori  http://localhost:5173/login\n')
} else {
  console.log(`\x1b[31m\x1b[1m  ${problems.length} ${problems.length === 1 ? 'problem' : 'problema'} — evo šta treba uraditi:\x1b[0m\n`)
  problems.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.what}`)
    console.log(`     \x1b[36m→ ${p.fix}\x1b[0m\n`)
  })
}

process.exit(0)
