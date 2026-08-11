// ─────────────────────────────────────────────────────────────
//  Provera koda
//
//  Učitava SVAKI modul aplikacije kroz pravi Vite resolver (isti
//  alias @, isti plugin za .vue). Hvata ono što build ne vidi:
//  pogrešno imenovane izvoze, kružne uvoze i pucanje koda koji se
//  izvršava već pri samom uvozu modula.
//
//  Pokretanje:  node proveri-kod.mjs
// ─────────────────────────────────────────────────────────────

import { createServer } from 'vite'
import { readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { webcrypto } from 'node:crypto'

const ROOT = process.cwd()

// ── minimalni browser, jer Node ga nema ──────────────────────
// Moduli poput theme.js diraju localStorage već pri uvozu.

const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
}
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} })

const el = () => ({
  setAttribute() {}, getAttribute: () => null, querySelector: () => null,
  querySelectorAll: () => [], addEventListener() {}, removeEventListener() {},
  appendChild() {}, style: {}, classList: { add() {}, remove() {} },
})

globalThis.document = {
  documentElement: el(), body: el(), head: el(),
  createElement: () => el(),
  querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {}, hidden: false,
}

globalThis.window = {
  location: { origin: 'https://rds.test', href: 'https://rds.test/', pathname: '/' },
  addEventListener() {}, removeEventListener() {},
  matchMedia: globalThis.matchMedia,
  history: { pushState() {}, replaceState() {}, state: null, go() {}, scrollRestoration: 'auto' },
  innerWidth: 1280, innerHeight: 800,
  scrollTo() {},
}
globalThis.location = globalThis.window.location
globalThis.history = globalThis.window.history
globalThis.crypto ??= webcrypto
globalThis.requestAnimationFrame = (fn) => setTimeout(fn, 0)

if (!globalThis.navigator?.vibrate) {
  try {
    Object.defineProperty(globalThis.navigator, 'vibrate', { value: () => {}, configurable: true })
  } catch {
    /* dovoljno je da navigator postoji */
  }
}

// ── obilazak ─────────────────────────────────────────────────

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(vue|js)$/.test(name)) out.push(p)
  }
  return out
}

const server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.js'),
  server: { middlewareMode: true, hmr: false },
  appType: 'custom',
  logLevel: 'silent',
})

const files = walk(join(ROOT, 'src')).sort()
const broken = []

console.log(`\n\x1b[1mRDS — provera koda\x1b[0m  (${files.length} modula)\n`)

for (const file of files) {
  const rel = '/' + relative(ROOT, file).replace(/\\/g, '/')
  try {
    await server.ssrLoadModule(rel)
  } catch (e) {
    broken.push({ rel, msg: String(e.message).split('\n')[0] })
  }
}

await server.close()

if (!broken.length) {
  console.log(`\x1b[32m\x1b[1m  Svih ${files.length} modula se uredno učitava.\x1b[0m\n`)
  process.exit(0)
}

console.log(`\x1b[31m\x1b[1m  ${broken.length} modula ne radi:\x1b[0m\n`)
for (const b of broken) {
  console.log(`  \x1b[31m✘\x1b[0m ${b.rel}`)
  console.log(`      ${b.msg}\n`)
}
process.exit(1)
