// ─────────────────────────────────────────────────────────────
//  Firebase — jedna instanca za celu aplikaciju.
//
//  Podešavanja stižu iz .env fajla (vidi .env.example). Ako fajl
//  nije popunjen, aplikacija se NE ruši — `firebaseReady` ostaje
//  false i korisnik dobija ekran sa uputstvom.
// ─────────────────────────────────────────────────────────────

import { initializeApp, deleteApp } from 'firebase/app'
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

const env = import.meta.env

export const firebaseConfig = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
}

export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
)

// Email-ovi vlasnika platforme. MORA da odgovara superAdmins() u firestore.rules.
export const SUPER_ADMIN_EMAILS = String(env.VITE_SUPER_ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

export function isSuperEmail(email) {
  return Boolean(email) && SUPER_ADMIN_EMAILS.includes(String(email).toLowerCase())
}

let _app = null
let _auth = null
let _db = null

if (firebaseReady) {
  _app = initializeApp(firebaseConfig)
  _auth = getAuth(_app)
  _db = getFirestore(_app)
  // Sesija preživljava osvežavanje stranice i zatvaranje taba.
  setPersistence(_auth, browserLocalPersistence).catch(() => {})
} else {
  console.warn(
    '[RDS] Firebase nije podešen. Kopiraj .env.example u .env i popuni vrednosti ' +
      'iz Firebase Console → Project settings → Your apps.'
  )
}

export const app = _app
export const auth = _auth
export const db = _db

/**
 * Pravljenje naloga za nekog drugog (admin pravi nalog administratoru).
 *
 * Firebase klijent SDK automatski prijavljuje svaki novonapravljeni
 * nalog — što bi izbacilo admina iz njegove sesije. Zato se koristi
 * druga, privremena instanca aplikacije: ona napravi nalog, vrati uid
 * i odmah se ugasi. Glavna sesija ostaje netaknuta.
 *
 * Ovo je i razlog zašto sistem ne traži Cloud Functions (Blaze plan).
 */
export async function createUserInSecondaryApp(email, password) {
  if (!firebaseReady) throw new Error('Firebase nije podešen.')

  const { getAuth: getAuth2, createUserWithEmailAndPassword, signOut } = await import(
    'firebase/auth'
  )

  const secondary = initializeApp(firebaseConfig, `rds-secondary-${Date.now()}`)
  try {
    const secondaryAuth = getAuth2(secondary)
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password)
    const uid = cred.user.uid
    await signOut(secondaryAuth)
    return uid
  } finally {
    await deleteApp(secondary).catch(() => {})
  }
}
