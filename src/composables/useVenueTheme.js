// ═══════════════════════════════════════════════════════════════
//  Tema lokala na celom dokumentu
//
//  Boje lokala su do sada stajale na jednom <div>-u. Sve što Vue
//  teleportuje na <body> — prozor korpe, izbor stola, rezervacija,
//  pomoćnik, pregled slike, poruke — ispada iz tog <div>-a i dobija
//  podrazumevanu tamnu temu. Otud zelen meni i crn prozor preko njega.
//
//  Zato se promenljive pišu na sam koren dokumenta dok je gost na
//  stranici lokala, pa ih nasledi baš sve. Pri izlasku se sklanjaju,
//  da panel vlasnika ne ostane obojen bojama poslednjeg lokala.
// ═══════════════════════════════════════════════════════════════

import { onBeforeUnmount, watch } from 'vue'
import { GUEST_THEMES, themeStyle } from '@/lib/themes'

export function useVenueTheme(restRef) {
  const root = document.documentElement
  let applied = []

  function clear() {
    for (const name of applied) root.style.removeProperty(name)
    applied = []
    root.removeAttribute('data-venue-theme')
  }

  watch(
    restRef,
    (rest) => {
      clear()
      if (!rest) return

      const vars = themeStyle(rest)
      for (const [name, value] of Object.entries(vars)) {
        if (!name.startsWith('--')) continue
        root.style.setProperty(name, value)
        applied.push(name)
      }

      // Tamna tema lokala mora da pobedi i sistemsko podešavanje gosta,
      // inače bi svetla slova ostala na svetloj podlozi.
      const theme = GUEST_THEMES[rest.guestTheme]
      if (theme?.dark === true) root.setAttribute('data-theme', 'dark')
      else if (theme?.dark === false) root.setAttribute('data-theme', 'light')
      if (theme) root.setAttribute('data-venue-theme', rest.guestTheme || '')

      // Traka pregledača u boji lokala — telefon tako izgleda kao deo lokala.
      const bg = vars['--bg'] || (theme?.dark ? '#0b0e15' : '#f5f6f9')
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg)
    },
    { immediate: true }
  )

  onBeforeUnmount(clear)
}
