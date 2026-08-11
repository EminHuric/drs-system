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

import { FALLBACK_CONFIG, FALLBACK_SUPER_ADMINS } from './firebase.config'

const env = import.meta.env

// Env varijable imaju prednost; ako ih nema (npr. hosting nije podešen),
// pada se na vrednosti iz firebase.config.js da sajt svejedno radi.
const pick = (fromEnv, fallback) => (fromEnv && String(fromEnv).trim()) || fallback || ''

export const firebaseConfig = {
  apiKey: pick(env.VITE_FIREBASE_API_KEY, FALLBACK_CONFIG.apiKey),
  authDomain: pick(env.VITE_FIREBASE_AUTH_DOMAIN, FALLBACK_CONFIG.authDomain),
  projectId: pick(env.VITE_FIREBASE_PROJECT_ID, FALLBACK_CONFIG.projectId),
  storageBucket: pick(env.VITE_FIREBASE_STORAGE_BUCKET, FALLBACK_CONFIG.storageBucket),
  messagingSenderId: pick(env.VITE_FIREBASE_MESSAGING_SENDER_ID, FALLBACK_CONFIG.messagingSenderId),
  appId: pick(env.VITE_FIREBASE_APP_ID, FALLBACK_CONFIG.appId),
}

export const firebaseReady = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.appId
)

// Email-ovi vlasnika platforme. MORA da odgovara superAdmins() u firestore.rules.
export const SUPER_ADMIN_EMAILS = String(
  pick(env.VITE_SUPER_ADMIN_EMAILS, FALLBACK_SUPER_ADMINS)
)
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
