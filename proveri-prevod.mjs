// ═══════════════════════════════════════════════════════════════
//  Provera: da li prevod menija zaista radi
//
//  Prevod ide kroz Firebase AI Logic (Gemini). Ako u Firebase
//  konzoli ta usluga nije uključena, poziv tiho padne i gost vidi
//  original — bez ijedne poruke. Ova provera to izvlači na videlo.
//
//  Pokretanje:  node proveri-prevod.mjs
// ═══════════════════════════════════════════════════════════════

import { initializeApp } from 'firebase/app'
import { getAI, getGenerativeModel, GoogleAIBackend } from 'firebase/ai'
import { FALLBACK_CONFIG } from './src/firebase.config.js'

const zeleno = (s) => `\x1b[32m${s}\x1b[0m`
const crveno = (s) => `\x1b[31m${s}\x1b[0m`
const zuto = (s) => `\x1b[33m${s}\x1b[0m`

console.log('\n  Provera prevoda menija\n')

const app = initializeApp(FALLBACK_CONFIG)
const ai = getAI(app, { backend: new GoogleAIBackend() })
const model = getGenerativeModel(ai, {
  model: 'gemini-2.5-flash-lite',
  generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
})

const uzorak = ['Pljeskavica', 'Ljuto', 'Pršut i sir', 'Domaća limunada sa nanom']

const upit = [
  'Prevedi sa jezika "Srpski" na jezik "English".',
  'Ovo su stavke restoranskog menija.',
  '',
  'PRAVILA:',
  '• Vrati ISKLJUČIVO JSON niz stringova, iste dužine i istog redosleda kao ulaz.',
  '• Nijedan komentar, objašnjenje ni oznaka koda — samo niz.',
  '',
  'ULAZ:',
  JSON.stringify(uzorak),
].join('\n')

try {
  const res = await model.generateContent(upit)
  const tekst = res.response.text().trim()
  const prevod = JSON.parse(tekst.replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, ''))

  if (!Array.isArray(prevod) || prevod.length !== uzorak.length) {
    console.log(crveno('  ✘ Model je odgovorio, ali ne nizom koji se očekuje:'))
    console.log('    ' + tekst.slice(0, 200))
    process.exit(1)
  }

  console.log(zeleno('  ✔ Firebase AI Logic radi. Prevod stiže:\n'))
  uzorak.forEach((s, i) => console.log(`    ${s}  →  ${prevod[i]}`))
  console.log('')
} catch (e) {
  const poruka = e?.message || String(e)
  console.log(crveno('  ✘ Prevod NE radi.\n'))
  console.log('    ' + poruka + '\n')

  if (/not enabled|SERVICE_DISABLED|403|PERMISSION_DENIED|has not been used/i.test(poruka)) {
    console.log(zuto('    Usluga nije uključena u Firebase konzoli.'))
    console.log('    Firebase → Build → AI Logic → Get started → Gemini Developer API.\n')
  }
  process.exit(1)
}
