// ─────────────────────────────────────────────────────────────
//  Oblik dokumenta restorana na jednom mestu.
//
//  Isti oblik koriste i admin (kad otvara nalog) i vlasnik (kad
//  menja podešavanja), pa polje ne može da "nestane" i sruši
//  pravilo koje ga proverava.
// ─────────────────────────────────────────────────────────────

export function defaultRestaurant(patch = {}) {
  return {
    name: '',
    slug: '',
    tagline: '',
    logoEmoji: '🍽️',
    logoImage: '', // pravi logo lokala; ako ga nema, prikazuje se znak iznad
    brandColor: '#e2603f',
    coverImage: '', // fotografija objekta na vrhu menija
    gallery: [], // do 6 slika ambijenta
    guestTheme: 'auto', // vidi lib/themes.js
    guestLocale: 'sr', // jezik gost aplikacije; gost ga može promeniti
    about: '', // par rečenica o lokalu

    // Ocene su potpuno odvojene od naručivanja: gasi ih se jednim
    // prekidačem i lokal radi dalje kao da ih nema.
    reviewsEnabled: true,

    // Pomoćnik gostu (odgovara o meniju, preporučuje jela).
    assistant: true,

    // Porudžbina uvek ide u sistem. WhatsApp je dodatni kanal koji
    // lokal može da isključi ako mu smeta što gost mora da pritisne
    // „Pošalji" u još jednoj aplikaciji.
    whatsappSend: true,

    // Rezervacija stola unapred (ime, telefon, datum, vreme, broj osoba).
    reservations: false,

    // Naručivanje za poneti: gost poruči unapred i dođe po gotovo.
    takeaway: false,
    takeawayEtaMin: 15,

    // Zvono za neprihvaćene porudžbine (osoblje ne mora da gleda ekran).
    alarmUntilAccepted: true,

    mode: 'both', // dinein | delivery | both
    currency: '€',
    city: '',
    address: '',
    phone: '',
    whatsappNumber: '',

    status: 'pending',
    ownerUid: null,
    ownerEmail: '',
    ownerName: '',

    // Prekidač "danas ne primamo porudžbine" — pravila ga proveravaju
    // pri svakom upisu nove porudžbine.
    acceptingOrders: true,

    delivery: {
      fee: 0,
      minOrder: 0,
      freeOver: 0,
      etaMin: 40,
      note: '',
    },
    dinein: {
      showTables: true,
      callWaiter: true,
      etaMin: 15,
    },

    hours: '',
    floorZones: [{ id: 'sala', name: 'Sala' }],

    plan: 'standard',
    ...patch,
  }
}

/** Da li lokal uopšte nudi taj način naručivanja. */
export function supportsDinein(r) {
  return r?.mode === 'dinein' || r?.mode === 'both'
}

export function supportsDelivery(r) {
  return r?.mode === 'delivery' || r?.mode === 'both'
}

/** „Za poneti" je zaseban prekidač — ne zavisi od namene naloga. */
export function supportsTakeaway(r) {
  return r?.takeaway === true
}

export function guestUrl(slug, table) {
  const base = `${window.location.origin}/r/${slug}`
  return table ? `${base}?sto=${encodeURIComponent(table)}` : base
}
