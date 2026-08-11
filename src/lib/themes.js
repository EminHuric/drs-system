// ─────────────────────────────────────────────────────────────
//  Teme gost aplikacije
//
//  Restoran ne bira „svetlo ili tamno" — bira SVOJ izgled. Zato
//  tema nije prekidač nego deo brenda: kad je vlasnik izabere,
//  gost je vidi isto na svakom telefonu, bez obzira na to kako mu
//  je uređaj podešen. Isto kao što svaki lokal ima svoje osvetljenje.
//
//  Svaka tema popunjava iste promenljive koje koristi ceo sistem,
//  pa se primenjuje jednim `style` na koren gost aplikacije.
// ─────────────────────────────────────────────────────────────

const shadowLight = {
  '--shadow-sm': '0 1px 2px rgba(20, 22, 30, .06)',
  '--shadow': '0 6px 20px -8px rgba(20, 22, 30, .18)',
  '--shadow-lg': '0 30px 70px -24px rgba(20, 22, 30, .3)',
}

const shadowDark = {
  '--shadow-sm': '0 1px 2px rgba(0, 0, 0, .5)',
  '--shadow': '0 8px 26px -10px rgba(0, 0, 0, .7)',
  '--shadow-lg': '0 34px 80px -26px rgba(0, 0, 0, .9)',
}

export const GUEST_THEMES = {
  auto: {
    name: 'Kao na uređaju gosta',
    desc: 'Prati podešavanje telefona — svetlo danju, tamno noću.',
    swatch: ['#ffffff', '#8a94a6', '#12141d'],
    dark: null,
    vars: null,
  },

  light: {
    name: 'Svetlo i čisto',
    desc: 'Bela podloga, mnogo vazduha. Najbolje za dnevne lokale i kafiće.',
    swatch: ['#ffffff', '#f2f4f8', '#151922'],
    dark: false,
    vars: {
      '--bg': '#f5f6f9',
      '--bg-deep': '#eceef4',
      '--surface': '#ffffff',
      '--surface-2': '#f7f8fb',
      '--surface-3': '#eef0f5',
      '--hover': 'rgba(18, 22, 34, .04)',
      '--active': 'rgba(18, 22, 34, .07)',
      '--line': 'rgba(18, 22, 34, .09)',
      '--line-strong': 'rgba(18, 22, 34, .17)',
      '--ink': '#151922',
      '--ink-2': '#414a5b',
      '--muted': '#68728a',
      '--faint': '#98a1b3',
      '--glass': 'rgba(255, 255, 255, .85)',
      '--scrim': 'rgba(20, 24, 36, .45)',
      ...shadowLight,
    },
  },

  dark: {
    name: 'Moderno tamno',
    desc: 'Duboko plavo-crna podloga. Slike jela izgledaju najbolje na njoj.',
    swatch: ['#0b0e15', '#1b2130', '#e9ecf4'],
    dark: true,
    vars: {
      '--bg': '#0b0e15',
      '--bg-deep': '#07090e',
      '--surface': '#141924',
      '--surface-2': '#1a2030',
      '--surface-3': '#212939',
      '--hover': 'rgba(255, 255, 255, .05)',
      '--active': 'rgba(255, 255, 255, .08)',
      '--line': 'rgba(255, 255, 255, .08)',
      '--line-strong': 'rgba(255, 255, 255, .16)',
      '--ink': '#e9ecf4',
      '--ink-2': '#aeb8ca',
      '--muted': '#818da3',
      '--faint': '#5c6779',
      '--glass': 'rgba(20, 25, 36, .82)',
      '--scrim': 'rgba(4, 6, 10, .76)',
      ...shadowDark,
    },
  },

  luxury: {
    name: 'Luksuz — crno i zlatno',
    desc: 'Ugalj, zlato i serifni naslovi. Za fine dining i hotelske restorane.',
    swatch: ['#0a0a0b', '#c9a227', '#f3efe6'],
    dark: true,
    accent: '#c9a227',
    display: "ui-serif, Georgia, 'Times New Roman', serif",
    vars: {
      '--bg': '#0a0a0b',
      '--bg-deep': '#050506',
      '--surface': '#131315',
      '--surface-2': '#1a1a1d',
      '--surface-3': '#232326',
      '--hover': 'rgba(201, 162, 39, .07)',
      '--active': 'rgba(201, 162, 39, .12)',
      '--line': 'rgba(201, 162, 39, .16)',
      '--line-strong': 'rgba(201, 162, 39, .32)',
      '--ink': '#f3efe6',
      '--ink-2': '#c9c3b6',
      '--muted': '#948d80',
      '--faint': '#6b6559',
      '--gold': '#c9a227',
      '--glass': 'rgba(10, 10, 11, .84)',
      '--scrim': 'rgba(3, 3, 4, .82)',
      ...shadowDark,
    },
  },

  warm: {
    name: 'Toplo — krem i braon',
    desc: 'Boje drveta i pečenog hleba. Za konobe, pekare i domaću kuhinju.',
    swatch: ['#f6f0e6', '#8a5a34', '#2e2118'],
    dark: false,
    accent: '#8a5a34',
    display: "ui-serif, Georgia, serif",
    vars: {
      '--bg': '#f6f0e6',
      '--bg-deep': '#eee5d6',
      '--surface': '#fffcf7',
      '--surface-2': '#f8f2e8',
      '--surface-3': '#efe6d8',
      '--hover': 'rgba(46, 33, 24, .045)',
      '--active': 'rgba(46, 33, 24, .08)',
      '--line': 'rgba(46, 33, 24, .11)',
      '--line-strong': 'rgba(46, 33, 24, .2)',
      '--ink': '#2e2118',
      '--ink-2': '#57432f',
      '--muted': '#7d6751',
      '--faint': '#a08a72',
      '--glass': 'rgba(255, 252, 247, .85)',
      '--scrim': 'rgba(46, 33, 24, .5)',
      ...shadowLight,
    },
  },

  mono: {
    name: 'Minimal — crno na belom',
    desc: 'Bez ijedne suvišne boje, oštre linije. Za moderne bistroe i bar.',
    swatch: ['#ffffff', '#111111', '#000000'],
    dark: false,
    accent: '#111111',
    vars: {
      '--bg': '#ffffff',
      '--bg-deep': '#f4f4f4',
      '--surface': '#ffffff',
      '--surface-2': '#fafafa',
      '--surface-3': '#f0f0f0',
      '--hover': 'rgba(0, 0, 0, .04)',
      '--active': 'rgba(0, 0, 0, .07)',
      '--line': 'rgba(0, 0, 0, .12)',
      '--line-strong': 'rgba(0, 0, 0, .3)',
      '--ink': '#000000',
      '--ink-2': '#333333',
      '--muted': '#666666',
      '--faint': '#999999',
      '--glass': 'rgba(255, 255, 255, .9)',
      '--scrim': 'rgba(0, 0, 0, .55)',
      '--r-sm': '2px',
      '--r': '3px',
      '--r-md': '4px',
      '--r-lg': '6px',
      '--r-xl': '8px',
      ...shadowLight,
    },
  },

  emerald: {
    name: 'Zeleno i zlatno',
    desc: 'Duboko smaragdno sa zlatnim naglaskom. Svečano, a ne teško.',
    swatch: ['#0b1a14', '#c9a227', '#eaf2ec'],
    dark: true,
    accent: '#c9a227',
    display: 'ui-serif, Georgia, serif',
    vars: {
      '--bg': '#0b1a14',
      '--bg-deep': '#07120e',
      '--surface': '#10241b',
      '--surface-2': '#152c21',
      '--surface-3': '#1c3729',
      '--hover': 'rgba(201, 162, 39, .08)',
      '--active': 'rgba(201, 162, 39, .14)',
      '--line': 'rgba(201, 162, 39, .18)',
      '--line-strong': 'rgba(201, 162, 39, .34)',
      '--ink': '#eaf2ec',
      '--ink-2': '#b9cdc0',
      '--muted': '#8aa394',
      '--faint': '#5f776a',
      '--gold': '#c9a227',
      '--glass': 'rgba(11, 26, 20, .85)',
      '--scrim': 'rgba(4, 10, 8, .8)',
      ...shadowDark,
    },
  },

  forest: {
    name: 'Maslina i kamen',
    desc: 'Prigušeno zeleno, bez sjaja. Za mediteranske i vegetarijanske lokale.',
    swatch: ['#0f1512', '#5f8d5a', '#e9efe8'],
    dark: true,
    accent: '#6d9e5a',
    vars: {
      '--bg': '#0f1512',
      '--bg-deep': '#0a0f0c',
      '--surface': '#161d19',
      '--surface-2': '#1c2521',
      '--surface-3': '#243029',
      '--hover': 'rgba(255, 255, 255, .05)',
      '--active': 'rgba(255, 255, 255, .08)',
      '--line': 'rgba(233, 239, 232, .09)',
      '--line-strong': 'rgba(233, 239, 232, .18)',
      '--ink': '#e9efe8',
      '--ink-2': '#b2c2ae',
      '--muted': '#87977f',
      '--faint': '#5f6d5b',
      '--glass': 'rgba(15, 21, 18, .84)',
      '--scrim': 'rgba(5, 8, 6, .78)',
      ...shadowDark,
    },
  },

  wine: {
    name: 'Vinsko crveno',
    desc: 'Bordo i topla svetlost. Za vinarije, stejk-haus i večernje lokale.',
    swatch: ['#180d10', '#a6405a', '#f2e8ea'],
    dark: true,
    accent: '#c25b74',
    display: 'ui-serif, Georgia, serif',
    vars: {
      '--bg': '#180d10',
      '--bg-deep': '#12080b',
      '--surface': '#221317',
      '--surface-2': '#2a181d',
      '--surface-3': '#351f25',
      '--hover': 'rgba(255, 255, 255, .05)',
      '--active': 'rgba(255, 255, 255, .09)',
      '--line': 'rgba(242, 232, 234, .1)',
      '--line-strong': 'rgba(242, 232, 234, .2)',
      '--ink': '#f2e8ea',
      '--ink-2': '#d2b8be',
      '--muted': '#a58a91',
      '--faint': '#7a636a',
      '--glass': 'rgba(24, 13, 16, .85)',
      '--scrim': 'rgba(10, 5, 7, .8)',
      ...shadowDark,
    },
  },

  sand: {
    name: 'Pesak i more',
    desc: 'Svetli pesak i tirkiz. Za plažne barove i letnje bašte.',
    swatch: ['#fbf7f0', '#2f8fbf', '#1b2a33'],
    dark: false,
    accent: '#2f8fbf',
    vars: {
      '--bg': '#fbf7f0',
      '--bg-deep': '#f2ece1',
      '--surface': '#ffffff',
      '--surface-2': '#f8f4ec',
      '--surface-3': '#eee7db',
      '--hover': 'rgba(27, 42, 51, .04)',
      '--active': 'rgba(27, 42, 51, .08)',
      '--line': 'rgba(27, 42, 51, .1)',
      '--line-strong': 'rgba(27, 42, 51, .2)',
      '--ink': '#1b2a33',
      '--ink-2': '#3f5765',
      '--muted': '#6b8290',
      '--faint': '#9aabb5',
      '--glass': 'rgba(255, 255, 255, .86)',
      '--scrim': 'rgba(27, 42, 51, .48)',
      ...shadowLight,
    },
  },
}

export const THEME_LIST = Object.entries(GUEST_THEMES).map(([id, t]) => ({ id, ...t }))

/**
 * CSS promenljive za koren gost aplikacije.
 * `auto` ne vraća ništa — tada važi tema uređaja gosta.
 */
export function themeStyle(restaurant) {
  const t = GUEST_THEMES[restaurant?.guestTheme] || GUEST_THEMES.auto
  const brand = restaurant?.brandColor || t.accent || '#e2603f'

  const style = {
    '--b': brand,
    '--brand': brand,
    '--brand-soft': brand,
    '--tint-brand': `color-mix(in srgb, ${brand} 14%, transparent)`,
    '--brand-grad': `linear-gradient(135deg, ${brand} 0%, color-mix(in srgb, ${brand} 78%, #000) 100%)`,
    '--shadow-brand': `0 10px 30px -12px color-mix(in srgb, ${brand} 60%, transparent)`,
  }

  if (t.vars) Object.assign(style, t.vars)
  if (t.display) style['--font-display'] = t.display

  return style
}

/** Da li tema traži svetle ikone u statusnoj traci telefona. */
export function isDarkTheme(restaurant) {
  const t = GUEST_THEMES[restaurant?.guestTheme]
  return t?.dark === true
}
