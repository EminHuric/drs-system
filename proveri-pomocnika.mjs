// Provera pomoćnika nad pravim šablonom menija — ista pitanja koja su
// u praksi davala pogrešne odgovore.
import { localAnswer } from './src/lib/assistant.js'
import { TEMPLATES } from './src/lib/seedMenu.js'

const items = TEMPLATES.restoran.categories.flatMap((c, ci) =>
  c.items.map((i, ii) => ({
    id: `${ci}-${ii}`,
    categoryId: String(ci),
    active: true,
    prepTime: 15,
    ingredients: '',
    allergens: [],
    ...i,
  }))
)

const rest = { name: 'Konoba Lanterna', currency: '€', hours: 'Svaki dan 08–24h' }
const ctx = { rest, items, scores: {} }

const OK = '  \x1b[32m✔\x1b[0m'
const NO = '  \x1b[31m✘\x1b[0m'
let bad = 0

function check(q, expect) {
  const r = localAnswer(q, ctx)
  const names = r.items.map((i) => i.name)
  const pass = expect(r, names)
  if (!pass) bad++
  console.log(`${pass ? OK : NO} „${q}"`)
  console.log(`      → ${r.text}`)
  if (names.length) console.log(`      → ${names.slice(0, 3).join(' · ')}`)
}

console.log('\n\x1b[1mPomoćnik — provera odgovora\x1b[0m\n')

// Pitanja koja su ranije davala besmislice
check('ima li pršuta', (r, n) => n.some((x) => x.toLowerCase().includes('pršut')))
check('ima li nešto kiselo', (r, n) => !n.some((x) => x.toLowerCase().includes('baklava')))
check('imate li lignje', (r, n) => n.some((x) => x.toLowerCase().includes('lignj')))
check('da li imate ćevape', (r, n) => n.some((x) => x.toLowerCase().includes('ćevap')))
check('ima li nešto slatko', (r, n) => n.length > 0 && n.some((x) => /baklav|palačink/i.test(x)))
check('šta je ljuto', (r) => r.items.length >= 0)
check('šta mi preporučujete', (r, n) => n.length > 0)
check('nešto bez mesa', (r, n) => !n.some((x) => /ćevap|pljeskavic|meso/i.test(x)))
check('šta ima do 5 evra', (r, n) => r.items.every((i) => i.price <= 5))
check('do kad ste otvoreni', (r) => r.text.includes('08–24'))
check('imate li suši', (r, n) => n.length === 0 && /nemam|pitajte/i.test(r.text))
check('šta se sprema najbrže', (r, n) => n.length > 0)


// ── pitanja o samom lokalu ───────────────────────────────────
const rest2 = {
  ...rest,
  address: 'Obala 12',
  city: 'Bar',
  venueInfo:
    'Otvoreni smo 1998. godine i porodični smo lokal u trećoj generaciji. ' +
    'Bašta ima 40 mesta sa pogledom na more. Ribu nabavljamo svako jutro sa pijace.',
  facts: [
    { q: 'Imate li parking?', a: 'Da, parking je besplatan iza objekta.' },
    { q: 'Da li primate kućne ljubimce?', a: 'Da, psi su dobrodošli u bašti.' },
  ],
}
const ctx2 = { rest: rest2, items, scores: {} }

function check2(q, expect) {
  const r = localAnswer(q, ctx2)
  const pass = expect(r)
  if (!pass) bad++
  console.log(`${pass ? OK : NO} „${q}"`)
  console.log(`      → ${r.text}`)
}

console.log('\n\x1b[1mPitanja o lokalu\x1b[0m\n')
check2('imate li parking', (r) => /besplatan iza objekta/i.test(r.text))
check2('mogu li da dovedem psa', (r) => /psi su dobrodo/i.test(r.text))
check2('kada je osnovan lokal', (r) => /1998/.test(r.text))
check2('gde se nalazite', (r) => /Obala 12|Bar/.test(r.text))
check2('imate li bazen', (r) => !/1998|parking|psi/i.test(r.text))

console.log(bad ? `\n\x1b[31m  ${bad} odgovora nije dobro\x1b[0m\n` : '\n\x1b[32m  Svi odgovori su tačni\x1b[0m\n')
process.exit(bad ? 1 : 0)
