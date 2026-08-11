// ─────────────────────────────────────────────────────────────
//  Sesija i uloge
//
//  Firebase kaže SAMO ko je prijavljen. Šta taj neko sme, čita se
//  iz baze pri svakoj prijavi:
//
//    super    → email je u SUPER_ADMIN_EMAILS
//    platform → postoji /platform_admins/{uid}
//    owner    → postoji restoran sa ownerUid == uid
//    anon     → anonimna prijava (gost)
//    none     → prijavljen, ali mu niko ništa nije dodelio
//
//  Restoran vlasnika se prati UŽIVO — čim ga admin blokira, panel
//  se sam zaključa, bez osvežavanja stranice.
// ─────────────────────────────────────────────────────────────

import { ref, computed } from 'vue'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInAnonymously,
  sendPasswordResetEmail,
  updateProfile,
  signOut as fbSignOut,
} from 'firebase/auth'
import {
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { auth, db, firebaseReady, isSuperEmail } from '@/firebase'

export const user = ref(null)
export const role = ref('loading') // loading | none | anon | platform | owner
export const isSuper = ref(false)
export const adminDoc = ref(null)
export const restaurant = ref(null) // živi dokument restorana vlasnika
export const authReady = ref(false)

export const isPlatform = computed(() => role.value === 'platform')
export const isOwner = computed(() => role.value === 'owner')
export const isBlocked = computed(() => restaurant.value?.status === 'blocked')
export const needsOnboarding = computed(
  () => role.value === 'owner' && restaurant.value?.status === 'onboarding'
)

export const displayName = computed(
  () => adminDoc.value?.name || user.value?.displayName || user.value?.email || 'Korisnik'
)

let unsubRestaurant = null
let resolveToken = 0

function stopRestaurantWatch() {
  if (unsubRestaurant) {
    unsubRestaurant()
    unsubRestaurant = null
  }
  restaurant.value = null
}

function watchRestaurant(id, initial = null) {
  stopRestaurantWatch()
  // Prvi podatak postavljamo odmah, iz upita kojim smo restoran i našli.
  // Bez toga bi uloga na tren bila „vlasnik“ sa praznim restoranom, pa bi
  // guard u ruteru pogrešno zaključio da onboarding nije potreban.
  if (initial) restaurant.value = initial
  unsubRestaurant = onSnapshot(
    doc(db, 'restaurants', id),
    (snap) => {
      restaurant.value = snap.exists() ? { id: snap.id, ...snap.data() } : null
    },
    () => {
      restaurant.value = null
    }
  )
}

async function resolveRole(u) {
  const token = ++resolveToken
  const stale = () => token !== resolveToken

  if (!u) {
    stopRestaurantWatch()
    isSuper.value = false
    adminDoc.value = null
    role.value = 'none'
    return
  }

  if (u.isAnonymous) {
    stopRestaurantWatch()
    isSuper.value = false
    adminDoc.value = null
    role.value = 'anon'
    return
  }

  // 1) Vlasnik platforme — prepoznaje se po email adresi iz .env-a,
  //    pa isti taj uslov stoji i u firestore.rules.
  if (isSuperEmail(u.email)) {
    isSuper.value = true
    const ref_ = doc(db, 'platform_admins', u.uid)
    try {
      const snap = await getDoc(ref_)
      if (!snap.exists()) {
        // Prvi ulazak: sam sebi upisuje karton (pravila to dozvoljavaju).
        await setDoc(ref_, {
          email: u.email,
          name: u.displayName || 'Vlasnik platforme',
          level: 'super',
          createdAt: serverTimestamp(),
          lastLoginAt: serverTimestamp(),
        })
        adminDoc.value = { id: u.uid, email: u.email, level: 'super' }
      } else {
        adminDoc.value = { id: snap.id, ...snap.data() }
        updateDoc(ref_, { lastLoginAt: serverTimestamp() }).catch(() => {})
      }
    } catch {
      adminDoc.value = { id: u.uid, email: u.email, level: 'super' }
    }
    if (stale()) return
    stopRestaurantWatch()
    role.value = 'platform'
    return
  }

  isSuper.value = false

  // 2) Platformski administrator.
  try {
    const snap = await getDoc(doc(db, 'platform_admins', u.uid))
    if (stale()) return
    if (snap.exists()) {
      adminDoc.value = { id: snap.id, ...snap.data() }
      updateDoc(snap.ref, { lastLoginAt: serverTimestamp() }).catch(() => {})
      stopRestaurantWatch()
      role.value = 'platform'
      return
    }
  } catch {
    /* nije admin — idemo dalje */
  }

  adminDoc.value = null

  // 3) Vlasnik lokala.
  try {
    const q = query(collection(db, 'restaurants'), where('ownerUid', '==', u.uid), limit(1))
    const res = await getDocs(q)
    if (stale()) return
    if (!res.empty) {
      const d = res.docs[0]
      watchRestaurant(d.id, { id: d.id, ...d.data() })
      role.value = 'owner'
      return
    }
  } catch {
    /* pravila su odbila upit — tretiramo kao "bez uloge" */
  }

  if (stale()) return
  stopRestaurantWatch()
  role.value = 'none'
}

/** Poziva se jednom, iz main.js, pre nego što se aplikacija montira. */
export function initAuth() {
  return new Promise((resolve) => {
    if (!firebaseReady) {
      role.value = 'none'
      authReady.value = true
      resolve()
      return
    }

    let first = true
    onAuthStateChanged(auth, async (u) => {
      user.value = u
      await resolveRole(u)
      if (first) {
        first = false
        authReady.value = true
        resolve()
      }
    })
  })
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email.trim(), password)
  user.value = cred.user
  await resolveRole(cred.user)
  return role.value
}

export async function registerOwner(email, password, name) {
  const cred = await createUserWithEmailAndPassword(auth, email.trim(), password)
  if (name) await updateProfile(cred.user, { displayName: name }).catch(() => {})
  user.value = cred.user
  return cred.user
}

export async function resetPassword(email) {
  await sendPasswordResetEmail(auth, email.trim())
}

export async function signOut() {
  stopRestaurantWatch()
  await fbSignOut(auth)
  user.value = null
  role.value = 'none'
  adminDoc.value = null
  isSuper.value = false
}

/**
 * Gost dobija anonimni nalog. Bez njega Firestore pravila ne mogu da
 * kažu "ova porudžbina je tvoja" — a to je jedino što gosta drži
 * podalje od tuđih podataka.
 *
 * Ako je neko već prijavljen (vlasnik gleda svoju gost aplikaciju),
 * njegova sesija se ne dira.
 */
export async function ensureGuestSession() {
  if (!firebaseReady) throw new Error('Firebase nije podešen.')
  if (auth.currentUser) return auth.currentUser
  const cred = await signInAnonymously(auth)
  user.value = cred.user
  return cred.user
}

/** Posle registracije vlasnika treba ponovo pročitati ulogu. */
export async function refreshRole() {
  await resolveRole(auth.currentUser)
}
