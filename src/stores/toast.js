import { ref } from 'vue'

export const toasts = ref([])

let seq = 0

function push(text, kind, ms) {
  const id = ++seq
  toasts.value.push({ id, text, kind })
  if (ms > 0) setTimeout(() => dismiss(id), ms)
  return id
}

export function dismiss(id) {
  const i = toasts.value.findIndex((t) => t.id === id)
  if (i !== -1) toasts.value.splice(i, 1)
}

export const toast = {
  ok: (text, ms = 3200) => push(text, 'ok', ms),
  info: (text, ms = 3600) => push(text, 'info', ms),
  // Greške ostaju duže na ekranu — korisnik mora da ih pročita.
  error: (text, ms = 6000) => push(text, 'bad', ms),
}

/**
 * Firebase greške stižu kao kodovi tipa "auth/wrong-password".
 * Ovo ih prevodi u rečenicu koju korisnik razume.
 */
export function humanError(e) {
  const code = e?.code || ''
  const map = {
    'auth/invalid-email': 'Email adresa nije ispravna.',
    'auth/user-disabled': 'Ovaj nalog je onemogućen.',
    'auth/user-not-found': 'Ne postoji nalog sa ovom email adresom.',
    'auth/wrong-password': 'Pogrešna lozinka.',
    'auth/invalid-credential': 'Pogrešan email ili lozinka.',
    'auth/email-already-in-use': 'Već postoji nalog sa ovom email adresom.',
    'auth/weak-password': 'Lozinka mora imati najmanje 6 karaktera.',
    'auth/too-many-requests': 'Previše pokušaja. Sačekajte par minuta pa probajte ponovo.',
    'auth/network-request-failed': 'Nema veze sa internetom.',
    'auth/operation-not-allowed':
      'Način prijave nije uključen u Firebase konzoli (Authentication → Sign-in method).',
    'permission-denied': 'Nemate dozvolu za ovu radnju.',
    unavailable: 'Baza trenutno nije dostupna. Proverite internet.',
    'failed-precondition': 'Upit zahteva indeks koji još nije napravljen u Firestore-u.',
  }
  return map[code] || e?.message || 'Došlo je do greške. Pokušajte ponovo.'
}
