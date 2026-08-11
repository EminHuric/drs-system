// ─────────────────────────────────────────────────────────────
//  Automatsko podešavanje Firebase projekta
//
//  Radi umesto tebe sve što se inače klika po konzoli:
//    • uključuje Email/Password i Anonymous prijavu
//    • objavljuje firestore.rules i indekse
//    • na kraju proverava da sve zaista radi
//
//  Jedino što ti moraš je da jednom pustiš `firebase login`,
//  jer Google traži da se prijaviš svojim nalogom u browseru.
//
//  Pokretanje:  npm run podesi
// ─────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CONFIGSTORE = join(homedir(), '.config', 'configstore', 'firebase-tools.json')

// Javni OAuth klijent same firebase-tools alatke — isti onaj kojim se
// CLI prijavljuje. Koristi se samo da se tvoj token osveži.
const CLI_CLIENT_ID =
  '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const CLI_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

const OK = '  \x1b[32m✔\x1b[0m'
const NO = '  \x1b[31m✘\x1b[0m'

console.log('\n\x1b[1mRDS — automatsko podešavanje Firebase-a\x1b[0m\n')

// ── projekat iz .env ─────────────────────────────────────────

const env = {}
try {
  for (const line of readFileSync('.env', 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
} catch {
  console.log(`${NO} Nema .env fajla. Pokreni skriptu iz foldera drs-system.\n`)
  process.exit(1)
}

const projectId = env.VITE_FIREBASE_PROJECT_ID
if (!projectId) {
  console.log(`${NO} .env nije popunjen (nedostaje VITE_FIREBASE_PROJECT_ID).\n`)
  process.exit(1)
}
console.log(`${OK} Projekat: ${projectId}`)

// ── token ────────────────────────────────────────────────────

function needLogin(why) {
  console.log(`${NO} ${why}\n`)
  console.log('  Pusti jednom ovo, pa ponovo `npm run podesi`:\n')
  console.log('    \x1b[36mfirebase login\x1b[0m\n')
  console.log('  Otvoriće se browser — prijavi se istim Google nalogom')
  console.log('  kojim si pravio Firebase projekat.\n')
  process.exit(1)
}

let store
try {
  store = JSON.parse(readFileSync(CONFIGSTORE, 'utf8'))
} catch {
  needLogin('Firebase CLI nije prijavljen.')
}

const refresh = store?.tokens?.refresh_token
if (!refresh) needLogin('Firebase CLI nije prijavljen (nema sačuvanog naloga).')

async function accessToken() {
  // Sačuvani token važi sat vremena; ako je istekao, osvežavamo ga.
  const fresh = store.tokens.access_token && store.tokens.expires_at > Date.now() + 60000
  if (fresh) return store.tokens.access_token

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: CLI_CLIENT_ID,
      client_secret: CLI_CLIENT_SECRET,
      refresh_token: refresh,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) needLogin('Prijava je istekla.')
  const data = await res.json()
  return data.access_token
}

const token = await accessToken()
console.log(`${OK} Prijavljen kao ${store.user?.email || 'Google nalog'}`)

// ── uključivanje načina prijave ──────────────────────────────

console.log('\n  Uključujem načine prijave…')

const url =
  `https://identitytoolkit.googleapis.com/admin/v2/projects/${projectId}/config` +
  '?updateMask=signIn.anonymous.enabled,signIn.email.enabled,signIn.email.passwordRequired'

const res = await fetch(url, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    signIn: {
      anonymous: { enabled: true },
      email: { enabled: true, passwordRequired: true },
    },
  }),
})

if (res.ok) {
  const cfg = await res.json()
  console.log(`${OK} Email/Password: ${cfg.signIn?.email?.enabled ? 'uključeno' : 'ISKLJUČENO'}`)
  console.log(`${OK} Anonymous: ${cfg.signIn?.anonymous?.enabled ? 'uključeno' : 'ISKLJUČENO'}`)
} else {
  const t = await res.text()
  if (res.status === 403 || res.status === 401) {
    console.log(`${NO} Nalog nema dozvolu da menja ovaj projekat.`)
    console.log('      Prijavi se nalogom koji je vlasnik projekta: firebase login --reauth')
  } else if (/CONFIGURATION_NOT_FOUND/i.test(t)) {
    console.log(`${NO} Authentication još nije aktiviran na projektu.`)
    console.log('      Otvori jednom: Firebase Console → Build → Authentication → Get started')
  } else {
    console.log(`${NO} Nije uspelo (${res.status}): ${t.slice(0, 200)}`)
  }
}

// ── objava pravila ───────────────────────────────────────────

console.log('\n  Objavljujem sigurnosna pravila…')

const cmd = process.platform === 'win32' ? 'firebase.cmd' : 'firebase'
const out = spawnSync(
  cmd,
  ['deploy', '--only', 'firestore:rules,firestore:indexes', '--project', projectId, '--non-interactive'],
  { encoding: 'utf8', shell: process.platform === 'win32' }
)

const log = `${out.stdout || ''}${out.stderr || ''}`
if (out.status === 0) {
  console.log(`${OK} Pravila i indeksi su objavljeni`)
} else {
  console.log(`${NO} Objava pravila nije uspela`)
  console.log(
    '      ' + (log.split('\n').filter((l) => /Error|error/.test(l))[0] || log.slice(-200)).trim()
  )
  console.log('\n      Rezervni put: Firebase Console → Firestore Database → Rules')
  console.log('      → nalepi sadržaj firestore.rules → Publish\n')
}

// ── provera ──────────────────────────────────────────────────

console.log('\n  Proveravam rezultat…\n')
spawnSync(process.execPath, ['proveri-firebase.mjs'], { stdio: 'inherit' })
