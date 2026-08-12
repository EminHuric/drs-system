// ═══════════════════════════════════════════════════════════════
//  Provera: šta usporava otvaranje menija
//
//  Slike se čuvaju kao data URL unutar samih dokumenata, jer je
//  Firebase Storage na plaćenom planu. To radi, ali svaki bajt slike
//  gost skine pre nego što vidi meni. Ova provera meri koliko je to
//  zaista, po dokumentu i ukupno.
//
//  Pokretanje:  node proveri-brzinu.mjs
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'firebase/app'
import { collection, getDocs, getFirestore } from 'firebase/firestore'
import { FALLBACK_CONFIG } from './src/firebase.config.js'

const kb = (n) => (n / 1024).toFixed(0) + ' KB'
const zeleno = (s) => `\x1b[32m${s}\x1b[0m`
const zuto = (s) => `\x1b[33m${s}\x1b[0m`
const crveno = (s) => `\x1b[31m${s}\x1b[0m`

const boja = (n) => (n > 400 * 1024 ? crveno : n > 150 * 1024 ? zuto : zeleno)

const app = initializeApp(FALLBACK_CONFIG)
const db = getFirestore(app)

const size = (x) => new TextEncoder().encode(JSON.stringify(x ?? '')).length

console.log('\n  Šta gost skine pre nego što vidi meni\n')

const restorani = await getDocs(collection(db, 'restaurants'))

for (const r of restorani.docs) {
  const d = r.data()
  const ceo = size(d)

  console.log(`  ─── ${d.name || r.id}  (/r/${d.slug})`)
  console.log(`      dokument lokala: ${boja(ceo)(kb(ceo))}`)

  const delovi = [
    ['naslovna slika', d.coverImage],
    ['logo', d.logoImage],
    ['galerija (' + (d.gallery?.length || 0) + ')', d.gallery],
  ]
  for (const [ime, v] of delovi) {
    const s = size(v)
    if (s > 200) console.log(`        · ${ime}: ${boja(s)(kb(s))}`)
  }

  const jela = await getDocs(collection(db, 'restaurants', r.id, 'items'))
  let ukupnoJela = 0
  let sSlikom = 0
  let najveca = { n: '', s: 0 }

  for (const j of jela.docs) {
    const jd = j.data()
    const s = size(jd)
    ukupnoJela += s
    const slika = size(jd.image)
    if (slika > 200) {
      sSlikom++
      if (slika > najveca.s) najveca = { n: jd.name, s: slika }
    }
  }

  console.log(`      jela: ${jela.size} (sa slikom: ${sSlikom}) → ${boja(ukupnoJela)(kb(ukupnoJela))}`)
  if (najveca.s) console.log(`        · najveća slika: ${najveca.n} — ${boja(najveca.s)(kb(najveca.s))}`)

  const oceneSnap = await getDocs(collection(db, 'restaurants', r.id, 'reviews'))
  let ocene = 0
  for (const o of oceneSnap.docs) ocene += size(o.data())
  if (oceneSnap.size) console.log(`      utisci: ${oceneSnap.size} → ${boja(ocene)(kb(ocene))}`)

  const sve = ceo + ukupnoJela + ocene
  console.log(`      ${'UKUPNO ZA PRVO OTVARANJE:'} ${boja(sve)(kb(sve))}`)

  // Na 4G u gradu realno oko 3 MB/s; na slaboj vezi u lokalu i 10x manje.
  console.log(`      procena na sporoj vezi (300 KB/s): ${(sve / 1024 / 300).toFixed(1)} s\n`)
}

process.exit(0)
