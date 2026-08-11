// ─────────────────────────────────────────────────────────────
//  Zajednički rečnik sistema: statusi, načini rada, bedževi.
//  Sve što se prikazuje korisniku prolazi kroz ove mape, da bi
//  panel, gost aplikacija i WhatsApp poruka govorili istim jezikom.
// ─────────────────────────────────────────────────────────────

/** Način rada lokala — šta gost uopšte može da naruči. */
export const MODES = {
  dinein: { label: 'Samo u lokalu', short: 'Lokal', icon: '🍽️' },
  delivery: { label: 'Samo dostava', short: 'Dostava', icon: '🛵' },
  both: { label: 'Lokal + dostava', short: 'Oboje', icon: '🍽️🛵' },
}

/** Status naloga restorana na platformi. */
export const RESTAURANT_STATUS = {
  pending: { label: 'Čeka aktivaciju', tone: 'warn', hint: 'Kod je izdat, vlasnik se još nije registrovao.' },
  onboarding: { label: 'U podešavanju', tone: 'info', hint: 'Vlasnik je preuzeo nalog i unosi podatke.' },
  active: { label: 'Aktivan', tone: 'ok', hint: 'Lokal radi i prima porudžbine.' },
  blocked: { label: 'Blokiran', tone: 'bad', hint: 'Pristup zaustavljen. Vlasnik vidi podatke, ali ne može da ih menja.' },
}

/**
 * Tok porudžbine. `next` određuje koje dugme osoblje vidi sledeće,
 * pa se isti niz koristi i za traku napretka kod gosta.
 */
export const ORDER_FLOW = {
  dinein: ['new', 'accepted', 'preparing', 'served', 'done'],
  delivery: ['new', 'accepted', 'preparing', 'delivering', 'done'],
  takeaway: ['new', 'accepted', 'preparing', 'ready', 'done'],
}

export const ORDER_STATUS = {
  new: { label: 'Nova', guest: 'Poslato — čeka potvrdu', tone: 'new', icon: '🔔' },
  accepted: { label: 'Prihvaćena', guest: 'Restoran je prihvatio porudžbinu', tone: 'info', icon: '✅' },
  preparing: { label: 'U pripremi', guest: 'Priprema se', tone: 'warn', icon: '👨‍🍳' },
  ready: { label: 'Spremno', guest: 'Spremno za preuzimanje', tone: 'ok', icon: '📦' },
  served: { label: 'Servirano', guest: 'Servirano — prijatno!', tone: 'ok', icon: '🍽️' },
  delivering: { label: 'U dostavi', guest: 'Vozač je krenuo', tone: 'ok', icon: '🛵' },
  done: { label: 'Završena', guest: 'Završeno — hvala!', tone: 'muted', icon: '🏁' },
  cancelled: { label: 'Otkazana', guest: 'Otkazano', tone: 'bad', icon: '✖️' },
}

/** Statusi koje osoblje aktivno gleda na tabli uživo. */
export const LIVE_STATUSES = ['new', 'accepted', 'preparing', 'ready', 'served', 'delivering']
export const CLOSED_STATUSES = ['done', 'cancelled']

export function nextStatus(order) {
  const flow = ORDER_FLOW[order.type] || ORDER_FLOW.dinein
  const i = flow.indexOf(order.status)
  if (i === -1 || i === flow.length - 1) return null
  return flow[i + 1]
}

/** Ručni bedževi koje vlasnik kači na artikal da bi ga istakao. */
export const BADGES = {
  bestseller: { label: 'Hit', icon: '🔥', tone: 'hot' },
  top: { label: 'Najbolje ocenjeno', icon: '⭐', tone: 'gold' },
  new: { label: 'Novo', icon: '✨', tone: 'new' },
  chef: { label: 'Preporuka kuće', icon: '👨‍🍳', tone: 'brand' },
  spicy: { label: 'Ljuto', icon: '🌶️', tone: 'hot' },
  vegan: { label: 'Posno / vegan', icon: '🌱', tone: 'green' },
  glutenfree: { label: 'Bez glutena', icon: '🌾', tone: 'green' },
  house: { label: 'Domaće', icon: '🏠', tone: 'brand' },
  discount: { label: 'Akcija', icon: '🏷️', tone: 'gold' },
}

/**
 * Boje za oznake koje vlasnik sam pravi. Namerno ih je malo —
 * meni u deset boja ne izgleda bogato nego neuredno.
 */
export const TAG_TONES = [
  { id: 'brand', label: 'Boja lokala' },
  { id: 'hot', label: 'Crvena' },
  { id: 'gold', label: 'Zlatna' },
  { id: 'green', label: 'Zelena' },
  { id: 'new', label: 'Plava' },
  { id: 'plain', label: 'Siva' },
]

export const TAG_ICONS = ['🔥', '⭐', '👨‍🍳', '🌱', '🌶️', '🏠', '✨', '🏷️', '❤️', '🥇', '🍯', '🧊', '']

export const ALLERGENS = [
  'gluten', 'laktoza', 'jaja', 'orašasti plodovi', 'kikiriki',
  'soja', 'riba', 'školjke', 'susam', 'senf',
]

/** Najčešći izbori — stoje na vrhu palete kao prečica. */
export const BRAND_COLORS = [
  { name: 'Terakota', value: '#e2603f' },
  { name: 'Zlatna', value: '#d9a441' },
  { name: 'Maslina', value: '#6d9e5a' },
  { name: 'Jadran', value: '#2f8fbf' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Vino', value: '#a63d5b' },
  { name: 'Grafit', value: '#5b6472' },
  { name: 'Mandarina', value: '#f08c34' },
]

// ─────────────────────────────────────────────────────────────
//  Velika paleta
//
//  Boje se računaju, a ne prepisuju ručno: 14 tonova × 5 jačina.
//  Zasićenost i svetlina su namerno u uskom opsegu — svaka boja
//  odavde mora da bude čitljiva i na svetloj i na tamnoj temi, pa
//  vlasnik ne može da izabere nešto što se ne vidi.
// ─────────────────────────────────────────────────────────────

const HUES = [
  { h: 6, name: 'Crvena' },
  { h: 18, name: 'Terakota' },
  { h: 30, name: 'Narandžasta' },
  { h: 42, name: 'Ćilibar' },
  { h: 52, name: 'Zlatna' },
  { h: 86, name: 'Limeta' },
  { h: 132, name: 'Zelena' },
  { h: 162, name: 'Smaragd' },
  { h: 186, name: 'Tirkiz' },
  { h: 205, name: 'Jadran' },
  { h: 228, name: 'Plava' },
  { h: 258, name: 'Indigo' },
  { h: 290, name: 'Ljubičasta' },
  { h: 332, name: 'Magenta' },
]

const STEPS = [
  { s: 74, l: 62, tag: 'svetla' },
  { s: 70, l: 52, tag: 'osnovna' },
  { s: 64, l: 44, tag: 'duboka' },
  { s: 46, l: 38, tag: 'prigušena' },
  { s: 30, l: 30, tag: 'tamna' },
]

function hsl2hex(h, s, l) {
  s /= 100
  l /= 100
  const k = (n) => (n + h / 30) % 12
  const a = s * Math.min(l, 1 - l)
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))
  const to = (n) =>
    Math.round(255 * f(n))
      .toString(16)
      .padStart(2, '0')
  return `#${to(0)}${to(8)}${to(4)}`
}

export const BRAND_PALETTE = HUES.flatMap((hue) =>
  STEPS.map((st) => ({
    name: `${hue.name} ${st.tag}`,
    value: hsl2hex(hue.h, st.s, st.l),
  }))
)

/** Neutralne boje — za lokale koji ne žele nikakvu boju. */
export const NEUTRAL_COLORS = [
  { name: 'Crna', value: '#141414' },
  { name: 'Grafit', value: '#3d4450' },
  { name: 'Kamen', value: '#6b7280' },
  { name: 'Srebro', value: '#9aa3af' },
  { name: 'Bronza', value: '#8a6a45' },
  { name: 'Šampanj', value: '#c2a878' },
]

export const CURRENCIES = ['€', 'RSD', 'KM', 'kn', '$']

/** Načini plaćanja — tekst koji vide i gost i osoblje. */
export const PAYMENTS = {
  cash: 'Gotovina',
  card: 'Karticom',
  waiter: 'Konobaru',
  counter: 'Na kasi',
  online: 'Online',
}
