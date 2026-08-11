// ─────────────────────────────────────────────────────────────
//  Pravljenje admin naloga
//
//  Radi isto što i Firebase konzola (Authentication → Add user),
//  samo iz terminala. Email uzima iz .env, pa ne može da promakne
//  greška u kucanju — adresa mora biti identična onoj u pravilima.
//
//  Pokretanje:  node napravi-admin.mjs
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { webcrypto } from 'node:crypto'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'

const env = {}
for (const line of readFileSync('.env', 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
  if (m) env[m[1]] = m[2].trim()
}

const email = (env.VITE_SUPER_ADMIN_EMAILS || '').split(',')[0].trim()
if (!email) {
  console.log('\n  Nije upisan VITE_SUPER_ADMIN_EMAILS u .env.\n')
  process.exit(1)
}

// Lozinka bez znakova koji se mešaju pri prepisivanju (0/O, 1/I/l).
function makePassword() {
  const A = 'abcdefghjkmnpqrstuvwxyz'
  const B = 'ABCDEFGHJKMNPQRSTUVWXYZ'
  const N = '23456789'
  const pool = A + B + N
  const bytes = new Uint8Array(14)
  webcrypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < 12; i++) out += pool[bytes[i] % pool.length]
  return `${out.slice(0, 4)}-${out.slice(4, 8)}-${out.slice(8, 12)}`
}

const app = initializeApp({
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)

const password = makePassword()

console.log('\n\x1b[1mRDS — pravljenje admin naloga\x1b[0m\n')
console.log(`  Email: ${email}`)

try {
  await createUserWithEmailAndPassword(auth, email, password)
  await signOut(auth).catch(() => {})

  console.log('\n\x1b[32m\x1b[1m  Nalog je napravljen.\x1b[0m\n')
  console.log('  ┌──────────────────────────────────────────────┐')
  console.log(`  │  Email:    ${email.padEnd(34)}│`)
  console.log(`  │  Lozinka:  ${password.padEnd(34)}│`)
  console.log('  └──────────────────────────────────────────────┘\n')
  console.log('  Prijavi se na  http://localhost:5173/login\n')
} catch (e) {
  if (e.code === 'auth/email-already-in-use') {
    console.log('\n\x1b[33m  Nalog sa ovom adresom VEĆ POSTOJI.\x1b[0m')
    console.log('  Znači da problem nije u nalogu, nego u lozinci.\n')
    console.log('  Rešenje: na stranici za prijavu klikni "Zaboravili ste?"')
    console.log('  i postavi novu lozinku preko emaila.\n')
    console.log('  Ili u Firebase konzoli: Authentication → Users → tri tačke')
    console.log('  pored naloga → Reset password.\n')
  } else if (e.code === 'auth/operation-not-allowed') {
    console.log('\n\x1b[31m  Email/Password prijava nije uključena.\x1b[0m')
    console.log('  Firebase → Authentication → Sign-in method → Email/Password → Enable\n')
  } else if (e.code === 'auth/weak-password') {
    console.log('\n  Lozinka je odbijena kao preslaba. Pokreni skriptu ponovo.\n')
  } else {
    console.log(`\n\x1b[31m  Greška: ${e.code || ''} ${e.message}\x1b[0m\n`)
  }
}

process.exit(0)
