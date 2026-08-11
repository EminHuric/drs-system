// ─────────────────────────────────────────────────────────────
//  Rezervna Firebase konfiguracija
//
//  Prvo se gleda .env (lokalno) odnosno Environment Variables (na
//  Vercel-u). Ako ih nema, koriste se vrednosti odavde — pa sajt
//  radi i bez ijednog podešavanja na hostingu.
//
//  Zašto je bezbedno da ovo stoji u kodu:
//  Firebase web ključevi su JAVNI po dizajnu. Vite ih ionako ugrađuje
//  u JavaScript koji se šalje svakom posetiocu — svako ko otvori
//  „Inspect element" vidi ih i bez ovog fajla. Oni ne daju pristup
//  podacima; oni samo kažu KOJI je projekat u pitanju.
//
//  Podatke stvarno čuvaju:
//    • firestore.rules — ko šta sme da čita i piše
//    • Firebase → Authentication → Authorized domains — sa kojih
//      adresa prijava uopšte radi
//
//  Ako ipak želite da ovo ne stoji u repozitorijumu: unesite iste
//  vrednosti u Vercel → Settings → Environment Variables i obrišite
//  sadržaj ovog objekta. Env varijable uvek imaju prednost.
// ─────────────────────────────────────────────────────────────

export const FALLBACK_CONFIG = {
  apiKey: 'AIzaSyB6q2AwPjz0fYpJf-Tc4ecMajS0xF0BYUA',
  authDomain: 'restaurant-system-8ba71.firebaseapp.com',
  projectId: 'restaurant-system-8ba71',
  storageBucket: 'restaurant-system-8ba71.firebasestorage.app',
  messagingSenderId: '868024740844',
  appId: '1:868024740844:web:b552d9ec4fe747071faec9',
}

/** Email adrese vlasnika platforme. MORA da odgovara superAdmins() u firestore.rules. */
export const FALLBACK_SUPER_ADMINS = 'emynbusiness@gmail.com'
