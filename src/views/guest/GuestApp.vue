<script setup>
// ─────────────────────────────────────────────────────────────
//  Gost aplikacija
//
//  Ovo je jedini ekran koji vidi krajnji gost. Nema prijave, nema
//  registracije — samo anonimna sesija koja služi da Firestore
//  pravila znaju „ova porudžbina je tvoja“. Zbog nje gost ne može
//  do tuđih porudžbina, ni do panela lokala.
//
//  Porudžbina ide u dva kanala odjednom: u bazu (osoblje je vidi
//  uživo) i u WhatsApp (stiže i na telefon lokala).
// ─────────────────────────────────────────────────────────────

import { computed, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
} from 'firebase/firestore'
import { db, firebaseReady } from '@/firebase'
import { ensureGuestSession, user } from '@/stores/auth'
import { useLiveCollection } from '@/composables/useLive'
import { useCart } from '@/composables/useCart'
import FloorPlan from '@/components/FloorPlan.vue'
import Modal from '@/components/ui/Modal.vue'
import Loader from '@/components/ui/Loader.vue'
import Empty from '@/components/ui/Empty.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import Logo from '@/components/ui/Logo.vue'
import StarRating from '@/components/StarRating.vue'
import ReviewCard from '@/components/ReviewCard.vue'
import ReviewForm from '@/components/ReviewForm.vue'
import PhotoViewer from '@/components/PhotoViewer.vue'
import GuestAssistant from '@/components/GuestAssistant.vue'
import { byItem, fmtRating, summarize } from '@/lib/reviews'
import { toast, humanError } from '@/stores/toast'
import { money, normalizePhone, toDate } from '@/lib/format'
import { orderCode } from '@/lib/codes'
import { BADGES, LIVE_STATUSES, ORDER_STATUS } from '@/lib/constants'
import { supportsDelivery, supportsDinein, supportsTakeaway } from '@/lib/restaurant'
import { GUEST_THEMES, themeStyle } from '@/lib/themes'
import { LOCALES, applyRestaurantLocale, currentLocale, locale, setLocale, t } from '@/lib/i18n'
import { buildOrderMessage, openWhatsApp } from '@/lib/whatsapp'

const route = useRoute()
const router = useRouter()

// ═══ lokal ════════════════════════════════════════════════════

const rest = ref(null)
const loading = ref(true)
const notFound = ref(false)

async function loadRestaurant() {
  if (!firebaseReady) {
    notFound.value = true
    loading.value = false
    return
  }
  try {
    const snap = await getDocs(
      query(collection(db, 'restaurants'), where('slug', '==', route.params.slug), limit(1))
    )
    if (snap.empty) {
      notFound.value = true
    } else {
      rest.value = { id: snap.docs[0].id, ...snap.docs[0].data() }
      // Jezik lokala važi dok ga gost sam ne promeni.
      applyRestaurantLocale(rest.value.guestLocale)
    }
  } catch (e) {
    console.error(e)
    notFound.value = true
  } finally {
    loading.value = false
  }
}

const rid = computed(() => rest.value?.id || null)
const cur = computed(() => rest.value?.currency || '€')
const brand = computed(() => rest.value?.brandColor || '#e2603f')

// Izgled bira restoran, ne uređaj gosta — tako lokal izgleda isto
// svima, kao što svaki lokal ima svoje osvetljenje. Prekidač svetlo/
// tamno se nudi samo kad vlasnik nije izabrao temu.
const themeVars = computed(() => themeStyle(rest.value))
const freeTheme = computed(() => (rest.value?.guestTheme || 'auto') === 'auto')

watch(
  () => [rest.value?.guestTheme, rest.value?.brandColor],
  () => {
    const t = GUEST_THEMES[rest.value?.guestTheme]
    const color = t?.vars?.['--bg'] || (t?.dark ? '#0b0e15' : '#f5f6f9')
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color)
  }
)

const closed = computed(
  () => !rest.value || rest.value.status !== 'active' || rest.value.acceptingOrders === false
)
const blocked = computed(() => rest.value?.status === 'blocked')

// ═══ meni ═════════════════════════════════════════════════════

const catQuery = computed(() =>
  rid.value ? query(collection(db, 'restaurants', rid.value, 'categories'), orderBy('sort')) : null
)
const itemQuery = computed(() =>
  rid.value ? query(collection(db, 'restaurants', rid.value, 'items'), orderBy('sort')) : null
)
const tableQuery = computed(() =>
  rid.value ? query(collection(db, 'restaurants', rid.value, 'tables'), orderBy('sort')) : null
)

const reviewQuery = computed(() =>
  rid.value
    ? query(collection(db, 'restaurants', rid.value, 'reviews'), orderBy('createdAt', 'desc'), limit(60))
    : null
)

const { items: categories } = useLiveCollection(catQuery)
const { items: allItems, loading: itemsLoading } = useLiveCollection(itemQuery)
const { items: tables } = useLiveCollection(tableQuery)
const { items: allReviews, error: reviewError } = useLiveCollection(reviewQuery)

// ═══ moja porudžbina u toku ═══════════════════════════════════
//
// Gost naruči pa se vrati na meni da doda još nešto ili samo da
// pogleda — i tu izgubi vezu sa svojom porudžbinom. Zato traka sa
// statusom i porukama stoji sve dok porudžbina ne bude završena.
//
// Pretplata se pravi samo ako gost VEĆ ima anonimnu sesiju, dakle
// ako je nekad naručio. Slučajni prolaznik ne dobija nalog nizašta.

const myUid = computed(() => user.value?.uid || '')

const myOrdersQuery = computed(() =>
  rid.value && myUid.value
    ? // Bez orderBy namerno — tako upit ne traži složeni indeks,
      // a deset porudžbina se ionako sortira ovde.
      query(
        collection(db, 'restaurants', rid.value, 'orders'),
        where('guestUid', '==', myUid.value),
        limit(10)
      )
    : null
)

const { items: myOrders } = useLiveCollection(myOrdersQuery)

const activeOrder = computed(() => {
  const live = myOrders.value
    .filter((o) => LIVE_STATUSES.includes(o.status) && o.kind !== 'call')
    .sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
  return live[0] || null
})

/** Osoblje je odgovorilo, a gost to još nije video. */
const hasReply = computed(() => {
  const o = activeOrder.value
  if (!o?.lastMsgAt || o.lastMsgFrom !== 'staff') return false
  try {
    return (o.lastMsgAt.toMillis?.() ?? 0) > Number(localStorage.getItem(`rds.seen.${o.id}`) || 0)
  } catch {
    return true
  }
})

function openMyOrder() {
  router.push({
    name: 'guest-order',
    params: { slug: route.params.slug, orderId: activeOrder.value.id },
  })
}

// ═══ ocene ════════════════════════════════════════════════════
//
// Ocene su dodatak, ne uslov. Ako ih vlasnik ne želi ili baza još
// nema pravila za njih, ceo odeljak jednostavno nestane — meni i
// naručivanje rade netaknuto, bez ijedne poruke o grešci gostu.

const reviewsOn = computed(
  () => rest.value?.reviewsEnabled !== false && !reviewError.value
)

const reviews = computed(() =>
  reviewsOn.value ? allReviews.value.filter((r) => r.visible !== false) : []
)
const rating = computed(() => summarize(reviews.value))
const itemScores = computed(() => byItem(reviews.value))

const reviewOpen = ref(false)
const viewer = ref(null)
const shownReviews = ref(6)

function goReviews() {
  document.getElementById('ocene')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

const available = computed(() => allItems.value.filter((i) => i.active !== false))

const search = ref('')

/** Naša slova i veličina slova ne smeju da utiču na pretragu. */
function plain(x) {
  return String(x || '')
    .toLowerCase()
    .replace(/[čć]/g, 'c')
    .replace(/š/g, 's')
    .replace(/ž/g, 'z')
    .replace(/đ/g, 'dj')
}

// Traži se po nazivu, opisu, sastojcima i kategoriji — i to svaka
// reč zasebno, pa „pileca salata" nađe i „Cezar salata sa piletinom".
// Naziv vredi najviše, pa najbolji pogodak izlazi na vrh.
const results = computed(() => {
  const q = plain(search.value).trim()
  if (!q) return null

  const words = q.split(/\s+/).filter(Boolean)
  const catName = Object.fromEntries(categories.value.map((c) => [c.id, plain(c.name)]))

  return available.value
    .map((i) => {
      const name = plain(i.name)
      const extra = plain([i.desc, i.ingredients, catName[i.categoryId]].join(' '))
      let score = 0
      for (const w of words) {
        if (name.startsWith(w)) score += 12
        else if (name.includes(w)) score += 8
        else if (extra.includes(w)) score += 3
      }
      return { i, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((x) => x.i)
})

const sections = computed(() =>
  categories.value
    .map((c) => ({ ...c, items: available.value.filter((i) => i.categoryId === c.id) }))
    .filter((c) => c.items.length)
)

// Prazno znači „sve". Kad gost izabere kategoriju, ostale nestaju —
// ne skroluje se kroz ceo meni da bi se stiglo do pića.
const shownSections = computed(() =>
  activeCat.value ? sections.value.filter((c) => c.id === activeCat.value) : sections.value
)

const featured = computed(() => available.value.filter((i) => i.featured).slice(0, 8))

// ═══ način naručivanja ════════════════════════════════════════

const MODE_KEY = () => `rds.mode.${rid.value}`
const orderType = ref('')

// Šta lokal uopšte nudi. „Za poneti" je zaseban prekidač, pa kafić može
// da ima stolove i poneti bez dostave.
const modes = computed(() => {
  const r = rest.value
  if (!r) return []
  const m = []
  if (supportsDinein(r)) m.push('dinein')
  if (supportsDelivery(r)) m.push('delivery')
  if (supportsTakeaway(r)) m.push('takeaway')
  return m
})

watch([rest, modes], () => {
  if (!rest.value) return
  const list = modes.value
  if (!list.length) return

  // Jedna mogućnost — nema šta da se bira.
  if (list.length === 1) {
    orderType.value = list[0]
    return
  }
  if (orderType.value && list.includes(orderType.value)) return

  let saved = ''
  try {
    saved = localStorage.getItem(MODE_KEY()) || ''
  } catch {
    /* privatni režim */
  }
  orderType.value = list.includes(saved) ? saved : ''
})

const needsModeChoice = computed(() => modes.value.length > 1 && !orderType.value)

function chooseMode(m) {
  orderType.value = m
  try {
    localStorage.setItem(MODE_KEY(), m)
  } catch {
    /* privatni režim */
  }
}

// ═══ sto ══════════════════════════════════════════════════════

const tableLabel = ref('')
const tableId = ref('')

// QR kod sa stola donosi ?sto=7 — gost tada ne bira ništa.
watch([rest, tables], () => {
  const fromQr = route.query.sto || route.query.table
  if (fromQr && !tableLabel.value) {
    tableLabel.value = String(fromQr)
    const t = tables.value.find((x) => String(x.label) === String(fromQr))
    if (t) tableId.value = t.id
  }
})

const zoneName = computed(() => {
  const t = tables.value.find((x) => x.id === tableId.value)
  if (!t) return ''
  return rest.value?.floorZones?.find((z) => z.id === (t.zoneId || 'sala'))?.name || ''
})

const tablePicker = ref(false)
const pickZone = ref('')

const zones = computed(() =>
  rest.value?.floorZones?.length ? rest.value.floorZones : [{ id: 'sala', name: 'Sala' }]
)

// Šema se prikazuje samo ako je vlasnik nacrtao stolove i nije je isključio.
// Bez toga bi gost gledao prazno platno i pitao se šta se od njega traži.
const showFloor = computed(
  () => rest.value?.dinein?.showTables !== false && tables.value.some((t) => t.active !== false)
)

const activeZone = computed(() => zones.value.find((z) => z.id === pickZone.value) || zones.value[0])

const pickableTables = computed(() =>
  tables.value
    .filter((t) => t.active !== false)
    .slice()
    .sort((a, b) => {
      const na = Number(a.label)
      const nb = Number(b.label)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return String(a.label).localeCompare(String(b.label), 'sr')
    })
)

function pickTable(t) {
  tableId.value = t.id
  tableLabel.value = t.label
  tablePicker.value = false
}

// ═══ korpa ════════════════════════════════════════════════════

// shallowRef, ne ref: korpa je objekat pun ref-ova i ne sme da se
// „raspakuje“ prilikom smeštanja u reaktivnu vrednost.
const cart = shallowRef(useCart('none'))
watch(rid, (id) => (cart.value = useCart(id || 'none')), { immediate: true })

const lines = computed(() => cart.value.lines.value)
const count = computed(() => cart.value.count.value)
const subtotal = computed(() => cart.value.subtotal.value)

const deliveryFee = computed(() => {
  if (orderType.value !== 'delivery') return 0
  const d = rest.value?.delivery || {}
  if (d.freeOver > 0 && subtotal.value >= d.freeOver) return 0
  return Number(d.fee) || 0
})

const total = computed(() => subtotal.value + deliveryFee.value)

const minOrder = computed(() =>
  orderType.value === 'delivery' ? Number(rest.value?.delivery?.minOrder) || 0 : 0
)
const belowMin = computed(() => minOrder.value > 0 && subtotal.value < minOrder.value)

// ═══ prikaz jela ══════════════════════════════════════════════

const detail = ref(null)
const detailQty = ref(1)
const detailNote = ref('')

function openDetail(item) {
  detail.value = item
  detailQty.value = 1
  detailNote.value = ''
}

function addFromDetail() {
  cart.value.add(detail.value, detailQty.value, detailNote.value.trim())
  toast.ok(`${detail.value.name} je dodato u korpu.`)
  detail.value = null
}

/**
 * Na slici stoji SAMO jedan bedž — onaj koji najviše znači gostu.
 * Gomila oznaka preko fotografije pretrpa mrežu i ništa se ne pročita.
 */
function topBadge(it) {
  if (itemScores.value[it.id]?.count) {
    return { icon: '★', label: fmtRating(itemScores.value[it.id].avg), tone: 'gold' }
  }
  const order = ['bestseller', 'chef', 'discount', 'new', 'spicy', 'vegan']
  const key = order.find((k) => it.badges?.includes(k))
  return key ? { icon: BADGES[key].icon, label: BADGES[key].label, tone: BADGES[key].tone } : null
}

function quickAdd(item) {
  cart.value.add(item, 1, '')
}

// ═══ slanje porudžbine ════════════════════════════════════════

const checkout = ref(false)
const sending = ref(false)
const formError = ref('')

const guest = ref(loadGuest())

function loadGuest() {
  try {
    return {
      name: '',
      phone: '',
      address: '',
      floor: '',
      geo: null,
      payment: 'cash',
      note: '',
      ...JSON.parse(localStorage.getItem('rds.guest') || '{}'),
    }
  } catch {
    return { name: '', phone: '', address: '', floor: '', geo: null, payment: 'cash', note: '' }
  }
}

function saveGuest() {
  try {
    const { name, phone, address, floor } = guest.value
    localStorage.setItem('rds.guest', JSON.stringify({ name, phone, address, floor }))
  } catch {
    /* privatni režim */
  }
}

const gettingLocation = ref(false)

function useMyLocation() {
  if (!navigator.geolocation) return toast.error('Vaš uređaj ne podržava određivanje lokacije.')
  gettingLocation.value = true
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      guest.value.geo = {
        lat: Number(pos.coords.latitude.toFixed(6)),
        lng: Number(pos.coords.longitude.toFixed(6)),
      }
      gettingLocation.value = false
      toast.ok('Lokacija je dodata — kurir će vas lakše naći.')
    },
    () => {
      gettingLocation.value = false
      toast.error('Lokacija nije dostupna. Upišite adresu što preciznije.')
    },
    { enableHighAccuracy: true, timeout: 10000 }
  )
}

const payOptions = computed(() => {
  if (orderType.value === 'delivery') {
    return [
      { id: 'cash', icon: '💵', label: 'Gotovina kuriru' },
      { id: 'card', icon: '💳', label: 'Kartica kuriru' },
    ]
  }
  if (orderType.value === 'takeaway') {
    return [
      { id: 'counter', icon: '🧾', label: 'Na kasi' },
      { id: 'card', icon: '💳', label: 'Karticom' },
    ]
  }
  return [
    { id: 'waiter', icon: '🙋', label: 'Konobaru' },
    { id: 'counter', icon: '🧾', label: 'Na kasi' },
    { id: 'card', icon: '💳', label: 'Karticom' },
  ]
})

// Ako se promeni način poručivanja, izabrano plaćanje možda više ne postoji.
watch(payOptions, (list) => {
  if (!list.some((o) => o.id === guest.value.payment)) guest.value.payment = list[0].id
}, { immediate: true })

function validate() {
  if (!lines.value.length) return 'Korpa je prazna.'
  if (closed.value) return 'Lokal trenutno ne prima porudžbine.'

  if (orderType.value === 'delivery') {
    if (!guest.value.address.trim()) return 'Unesite adresu za dostavu.'
    if (normalizePhone(guest.value.phone).length < 8)
      return 'Unesite broj telefona — kurir mora da vas dobije.'
    if (belowMin.value)
      return `Najmanja porudžbina za dostavu je ${money(minOrder.value, cur.value)}.`
  } else if (orderType.value === 'takeaway') {
    if (normalizePhone(guest.value.phone).length < 8)
      return 'Unesite broj telefona — lokal mora da vas obavesti kad bude gotovo.'
    if (pickup.value.mode === 'time' && !pickup.value.time)
      return 'Izaberite vreme preuzimanja.'
  } else if (!tableLabel.value.trim()) {
    return 'Izaberite sto za kojim sedite.'
  }
  return ''
}

async function submit() {
  formError.value = validate()
  if (formError.value) return

  sending.value = true
  try {
    const u = await ensureGuestSession()

    const payload = {
      code: orderCode(),
      type: orderType.value,
      tableId: orderType.value === 'dinein' ? tableId.value || '' : '',
      tableLabel: orderType.value === 'dinein' ? tableLabel.value.trim() : '',
      zoneName: orderType.value === 'dinein' ? zoneName.value : '',
      guestUid: u.uid,
      guest: {
        name: guest.value.name.trim(),
        phone: normalizePhone(guest.value.phone),
        address: orderType.value === 'delivery' ? guest.value.address.trim() : '',
        floor: orderType.value === 'delivery' ? guest.value.floor.trim() : '',
        geo: orderType.value === 'delivery' ? guest.value.geo : null,
      },
      pickup:
        orderType.value === 'takeaway'
          ? { mode: pickup.value.mode, time: pickup.value.mode === 'time' ? pickup.value.time : '' }
          : null,
      lines: lines.value.map((l) => ({
        itemId: l.itemId,
        name: l.name,
        price: l.price,
        qty: l.qty,
        note: l.note || '',
      })),
      subtotal: subtotal.value,
      deliveryFee: deliveryFee.value,
      total: total.value,
      currency: cur.value,
      payment: guest.value.payment,
      note: guest.value.note.trim(),
      status: 'new',
      history: [{ status: 'new', at: Date.now() }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const ref_ = await addDoc(collection(db, 'restaurants', rid.value, 'orders'), payload)

    saveGuest()

    cart.value.clear()
    checkout.value = false

    // Porudžbina je već u sistemu i osoblje je vidi. WhatsApp je samo
    // dodatni kanal — ako ga lokal ne koristi, gost ni ne primeti da
    // postoji. Otvara se posle preusmeravanja da se ekran praćenja
    // sačeka gosta kad se vrati iz WhatsApp-a.
    const sendWa = rest.value.whatsappSend !== false && rest.value.whatsappNumber

    router.push({
      name: 'guest-order',
      params: { slug: route.params.slug, orderId: ref_.id },
    })

    if (sendWa) {
      openWhatsApp(rest.value.whatsappNumber, buildOrderMessage(payload, rest.value))
    }
  } catch (e) {
    formError.value = guestError(e)
  } finally {
    sending.value = false
  }
}

/**
 * Gost ne sme da vidi poruku o Firebase podešavanjima — to je naš
 * problem, ne njegov. Zato dobija rečenicu koja mu kaže šta da uradi
 * SADA: da pozove lokal telefonom.
 */
function guestError(e) {
  const fallback = rest.value?.phone
    ? `Naručivanje preko aplikacije trenutno nije dostupno. Pozovite nas na +${rest.value.phone}.`
    : 'Naručivanje preko aplikacije trenutno nije dostupno. Pokušajte ponovo za koji minut.'

  const code = e?.code || ''
  if (code === 'auth/operation-not-allowed' || code === 'auth/admin-restricted-operation') {
    console.error('[RDS] Anonimna prijava nije uključena u Firebase projektu.', e)
    return fallback
  }
  if (code === 'permission-denied') return 'Lokal trenutno ne prima porudžbine.'
  if (code === 'unavailable' || code === 'auth/network-request-failed') {
    return 'Nema veze sa internetom. Proverite mrežu pa pokušajte ponovo.'
  }
  return humanError(e)
}

// ── za poneti ────────────────────────────────────────────────
//
// Gost poruči unapred i dođe po gotovo — bez zvanja restorana i bez
// čekanja za šankom. Bira „što pre" ili tačan sat.

const pickup = ref({ mode: 'asap', time: '' })

const takeawayEta = computed(() => Number(rest.value?.takeawayEtaMin) || 15)

/** Predlozi vremena: prvi mogući termin pa na svakih 15 minuta. */
const pickupSlots = computed(() => {
  const out = []
  const now = new Date()
  const start = new Date(now.getTime() + takeawayEta.value * 60000)
  // Zaokruži naviše na sledećih 5 minuta da vreme izgleda uredno.
  start.setMinutes(Math.ceil(start.getMinutes() / 5) * 5, 0, 0)

  for (let i = 0; i < 12; i++) {
    const d = new Date(start.getTime() + i * 15 * 60000)
    out.push(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`)
  }
  return out
})

const pickupLabel = computed(() =>
  pickup.value.mode === 'asap'
    ? `Što pre (~${takeawayEta.value} min)`
    : `u ${pickup.value.time}`
)

// ── rezervacija stola ────────────────────────────────────────
//
// Rezervacija se čuva kao porudžbina sa `kind: 'reservation'`, a ne
// kao zasebna vrsta zapisa. Tako se pojavljuje na istoj tabli koju
// osoblje ionako gleda ceo dan — jedno mesto umesto dva.

const resOpen = ref(false)
const resBusy = ref(false)
const resError = ref('')

function todayISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const resForm = ref({
  firstName: '',
  lastName: '',
  phone: '',
  date: todayISO(),
  time: '19:00',
  people: 2,
  note: '',
})

const canReserve = computed(
  () => rest.value?.reservations === true && supportsDinein(rest.value) && !closed.value
)

function openReservation() {
  const g = guest.value
  const parts = (g.name || '').trim().split(/\s+/)
  resForm.value = {
    firstName: parts[0] || '',
    lastName: parts.slice(1).join(' ') || '',
    phone: g.phone || '',
    date: todayISO(),
    time: '19:00',
    people: 2,
    note: '',
  }
  resError.value = ''
  resOpen.value = true
}

async function submitReservation() {
  const r = resForm.value
  resError.value = ''

  if (!r.firstName.trim()) return (resError.value = 'Unesite ime.')
  if (!r.lastName.trim()) return (resError.value = 'Unesite prezime.')
  if (normalizePhone(r.phone).length < 8)
    return (resError.value = 'Unesite broj telefona — lokal mora da vas potvrdi.')
  if (!r.date || !r.time) return (resError.value = 'Izaberite datum i vreme.')

  resBusy.value = true
  try {
    const u = await ensureGuestSession()
    const fullName = `${r.firstName.trim()} ${r.lastName.trim()}`
    const when = `${r.date} u ${r.time}`

    const payload = {
      code: orderCode(),
      type: 'dinein',
      kind: 'reservation',
      tableId: '',
      tableLabel: '',
      zoneName: '',
      guestUid: u.uid,
      guest: {
        name: fullName,
        phone: normalizePhone(r.phone),
        address: '',
        floor: '',
        geo: null,
      },
      reservation: {
        date: r.date,
        time: r.time,
        people: Number(r.people) || 2,
      },
      lines: [
        {
          itemId: 'reservation',
          name: `🗓️ Rezervacija · ${when} · ${r.people} ${Number(r.people) === 1 ? 'osoba' : 'osoba'}`,
          price: 0,
          qty: 1,
          note: '',
        },
      ],
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      currency: cur.value,
      note: r.note.trim(),
      status: 'new',
      history: [{ status: 'new', at: Date.now() }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }

    const ref_ = await addDoc(collection(db, 'restaurants', rid.value, 'orders'), payload)

    try {
      const g = JSON.parse(localStorage.getItem('rds.guest') || '{}')
      localStorage.setItem(
        'rds.guest',
        JSON.stringify({ ...g, name: fullName, phone: normalizePhone(r.phone) })
      )
    } catch {
      /* privatni režim */
    }

    resOpen.value = false

    router.push({
      name: 'guest-order',
      params: { slug: route.params.slug, orderId: ref_.id },
    })

    if (rest.value.whatsappSend !== false && rest.value.whatsappNumber) {
      openWhatsApp(rest.value.whatsappNumber, buildOrderMessage(payload, rest.value))
    }
  } catch (e) {
    resError.value = guestError(e)
  } finally {
    resBusy.value = false
  }
}

// ── dozivanje konobara ───────────────────────────────────────

const callingWaiter = ref(false)
const waiterCalled = ref(false)

async function callWaiter() {
  if (waiterCalled.value) return
  if (!tableLabel.value.trim()) {
    tablePicker.value = true
    return toast.info('Prvo izaberite sto.')
  }
  callingWaiter.value = true
  try {
    const u = await ensureGuestSession()
    await addDoc(collection(db, 'restaurants', rid.value, 'orders'), {
      code: orderCode(),
      type: 'dinein',
      kind: 'call',
      tableId: tableId.value || '',
      tableLabel: tableLabel.value.trim(),
      zoneName: zoneName.value,
      guestUid: u.uid,
      guest: { name: guest.value.name.trim(), phone: '', address: '', floor: '', geo: null },
      lines: [{ itemId: 'call', name: '🔔 Poziv konobaru', price: 0, qty: 1, note: '' }],
      subtotal: 0,
      deliveryFee: 0,
      total: 0,
      currency: cur.value,
      note: 'Gost doziva konobara.',
      status: 'new',
      history: [{ status: 'new', at: Date.now() }],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    waiterCalled.value = true
    toast.ok('Konobar je obavešten. Stiže odmah!')
    // Kratka pauza da gost ne zove pet puta zaredom dok konobar prilazi.
    setTimeout(() => (waiterCalled.value = false), 90000)
  } catch (e) {
    toast.error(guestError(e))
  } finally {
    callingWaiter.value = false
  }
}

// ═══ jezik ════════════════════════════════════════════════════

const langOpen = ref(false)

function pickLocale(code) {
  setLocale(code)
  langOpen.value = false
}

// ═══ kretanje kroz meni ═══════════════════════════════════════

const activeCat = ref('')
let observer = null

const showTabs = computed(
  () =>
    !results.value &&
    sections.value.length > 1 &&
    (rest.value?.mode !== 'both' || Boolean(orderType.value))
)

function setupSpy() {
  observer?.disconnect()
  observer = new IntersectionObserver(
    (entries) => {
      for (const e of entries) if (e.isIntersecting) activeCat.value = e.target.dataset.cat
    },
    { rootMargin: '-160px 0px -68% 0px' }
  )
  requestAnimationFrame(() => {
    document.querySelectorAll('[data-cat]').forEach((el) => observer.observe(el))
  })
}

watch(sections, setupSpy)

function goCat(id) {
  activeCat.value = id
  // Vrati pogled na vrh liste — inače gost ostane na pola stare kategorije.
  document.querySelector('.body')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(loadRestaurant)
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <Loader v-if="loading" text="Učitavanje menija…" />

  <!-- ── lokal ne postoji ─────────────────────────────── -->
  <div v-else-if="notFound || !rest" class="msg-page">
    <Empty
      icon="🔍"
      title="Ovaj meni ne postoji"
      text="Proverite link ili QR kod. Moguće je i da je lokal uklonjen sa platforme."
    >
      <RouterLink to="/" class="btn btn-primary btn-sm">Idi na RDS</RouterLink>
    </Empty>
  </div>

  <div v-else class="app" :style="themeVars">
    <!-- ── naslovna ───────────────────────────────────── -->
    <header class="hero" :class="{ 'has-cover': rest.coverImage }">
      <div
        v-if="rest.coverImage"
        class="cover"
        :style="{ backgroundImage: `url(${rest.coverImage})` }"
        aria-hidden="true"
      ></div>
      <div v-else class="cover cover-plain" aria-hidden="true"></div>
      <div class="veil" aria-hidden="true"></div>

      <div class="hero-tools">
        <!-- Šest zastavica u nizu je bilo šareno i nečitko. Sada stoji
             samo trenutni jezik; ostali se otvore kad zatrebaju. -->
        <div class="lang">
          <button class="lang-now" :aria-expanded="langOpen" @click="langOpen = !langOpen">
            <span class="lang-flag">{{ currentLocale.flag }}</span>
            <span class="lang-name">{{ currentLocale.name }}</span>
            <span class="lang-caret" :class="{ up: langOpen }">⌄</span>
          </button>
        </div>
        <ThemeToggle v-if="freeTheme" />
      </div>

      <div class="hero-in">
        <span class="mark">
          <img v-if="rest.logoImage" :src="rest.logoImage" :alt="rest.name" />
          <span v-else aria-hidden="true">{{ rest.logoEmoji || '🍽️' }}</span>
        </span>

        <h1>{{ rest.name }}</h1>
        <p v-if="rest.tagline" class="tag-line">{{ rest.tagline }}</p>

        <div class="hero-meta">
          <button v-if="reviewsOn && rating.count" class="meta rate-link" @click="goReviews">
            <StarRating :model-value="rating.avg" readonly precise :size="13" />
            <strong>{{ fmtRating(rating.avg) }}</strong>
            <span class="soft">({{ rating.count }})</span>
          </button>
          <span v-if="rest.city" class="meta">📍 {{ rest.city }}</span>
          <span v-if="rest.hours" class="meta">🕒 {{ rest.hours }}</span>
          <span v-if="supportsDelivery(rest)" class="meta">🛵 Dostava</span>
          <span v-if="supportsDinein(rest)" class="meta">🍽️ U lokalu</span>
        </div>

        <div class="hero-actions">
          <button v-if="canReserve" class="btn btn-outline" @click="openReservation">
            {{ t('reserve') }}
          </button>

          <!-- Zvonce stoji uz vrh, gde ga gost traži kad mu nešto zatreba —
               a ne na dnu menija posle svih jela. -->
          <button
            v-if="orderType === 'dinein' && rest.dinein?.callWaiter && !closed"
            class="btn bell"
            :class="[callingWaiter && 'btn-spin', waiterCalled && 'called']"
            :disabled="callingWaiter || waiterCalled"
            @click="callWaiter"
          >
            {{ waiterCalled ? t('waiterCalled') : t('callWaiter') }}
          </button>
        </div>
      </div>
    </header>

    <!-- ── sticky traka ───────────────────────────────── -->
    <div class="bar">
      <div class="bar-in">
        <span class="bar-mark" aria-hidden="true">
          <img v-if="rest.logoImage" :src="rest.logoImage" alt="" />
          <span v-else>{{ rest.logoEmoji || '🍽️' }}</span>
        </span>
        <strong class="truncate bar-name">{{ rest.name }}</strong>
        <input v-model="search" class="input search" :placeholder="t('search')" />

        <!-- Korpa je uvek na istom mestu, i kad je prazna — gost ne
             sme ni na trenutak da se pita gde mu je porudžbina. -->
        <button
          v-if="!closed"
          class="cart-btn"
          :class="{ full: count }"
          :aria-label="count ? `Korpa, ${count} artikala` : 'Korpa je prazna'"
          @click="checkout = true"
        >
          🛒
          <span v-if="count" class="cart-n">{{ count }}</span>
        </button>
      </div>

      <!-- traka statusa -->
      <div v-if="blocked" class="strip strip-bad">
        Lokal trenutno nije dostupan preko RDS platforme.
      </div>
      <div v-else-if="closed" class="strip strip-warn">
        {{ t('paused') }}
      </div>
      <div v-else-if="orderType === 'dinein' && tableLabel" class="strip strip-ok">
        🪑 Sto <strong>{{ tableLabel }}</strong>
        <template v-if="zoneName"> · {{ zoneName }}</template>
        <button class="strip-btn" @click="tablePicker = true">promeni</button>
      </div>

      <!-- Kategorije žive u istoj lepljivoj traci — inače bi se dve
           lepljive trake preklapale i trebalo bi pogađati visinu. -->
      <nav v-if="showTabs" class="tabs">
        <button class="tab" :class="{ on: !activeCat }" @click="goCat('')">Sve</button>
        <button
          v-for="c in sections"
          :key="c.id"
          class="tab"
          :class="{ on: activeCat === c.id }"
          @click="goCat(c.id)"
        >
          {{ c.name }}
        </button>
      </nav>
    </div>

    <!-- ── izbor načina ───────────────────────────────── -->
    <div v-if="modes.length > 1" class="modestrip">
      <button
        v-for="m in modes"
        :key="m"
        class="ms-btn"
        :class="{ on: orderType === m }"
        @click="chooseMode(m)"
      >
        <span>{{ m === 'dinein' ? '🍽️' : m === 'takeaway' ? '🛍️' : '🛵' }}</span>
        {{ m === 'dinein' ? t('dineIn') : m === 'takeaway' ? 'Za poneti' : t('deliveryTitle') }}
      </button>
    </div>

    <main class="body">
        <div v-if="itemsLoading" class="grid">
          <div v-for="i in 6" :key="i" class="skeleton" style="height: 108px"></div>
        </div>

        <!-- rezultati pretrage -->
        <section v-else-if="results" class="sec">
          <h2 class="sec-title">{{ t('searchResults') }}</h2>
          <div v-if="results.length" class="grid">
              <button v-for="it in results" :key="it.id" class="dish" @click="openDetail(it)">
                <span class="dish-photo">
                  <img v-if="it.image" :src="it.image" :alt="it.name" loading="lazy" />
                  <span v-else class="dish-fallback">{{ it.emoji || '🍽️' }}</span>
                  <span v-if="topBadge(it)" class="dish-flag" :class="'flag-' + topBadge(it).tone">
                    {{ topBadge(it).icon }} {{ topBadge(it).label }}
                  </span>
                  <span v-if="cart.qtyOf(it.id)" class="dish-qty">{{ cart.qtyOf(it.id) }}</span>
                </span>
                <span class="dish-body">
                  <strong class="dish-name">{{ it.name }}</strong>
                  <span v-if="it.desc" class="dish-desc">{{ it.desc }}</span>
                  <span v-if="it.portion || it.prepTime" class="dish-specs">
                    <span v-if="it.portion">{{ it.portion }}</span>
                    <span v-if="it.prepTime">⏱ {{ it.prepTime }} min</span>
                  </span>
                  <span class="dish-foot">
                    <span class="dish-price">{{ money(it.price, cur) }}</span>
                    <s v-if="it.oldPrice > it.price" class="dish-old">{{ money(it.oldPrice, cur) }}</s>
                    <span
                      v-if="!closed"
                      class="dish-add"
                      role="button"
                      tabindex="0"
                      :aria-label="'Dodaj ' + it.name"
                      @click.stop="quickAdd(it)"
                      @keydown.enter.stop="quickAdd(it)"
                    >＋</span>
                  </span>
                </span>
              </button>
          </div>
          <p v-else class="muted center" style="padding: var(--s6)">
            Ništa nije pronađeno za „{{ search }}“.
          </p>
        </section>

        <template v-else>
          <!-- izdvojeno -->
          <section v-if="featured.length" class="sec">
            <h2 class="sec-title">{{ t('chefPick') }}</h2>
            <div class="rail">
              <button v-for="it in featured" :key="it.id" class="rail-card" @click="openDetail(it)">
                <span class="rail-thumb">
                  <img v-if="it.image" :src="it.image" :alt="it.name" loading="lazy" />
                  <span v-else>{{ it.emoji }}</span>
                </span>
                <strong class="small truncate">{{ it.name }}</strong>
                <span class="mono small">{{ money(it.price, cur) }}</span>
              </button>
            </div>
          </section>

          <Empty
            v-if="!sections.length"
            icon="🍽️"
            :title="t('menuComing')"
            :text="t('menuComingHint')"
          />

          <!-- kategorije -->
          <section v-for="c in shownSections" :id="'c-' + c.id" :key="c.id" :data-cat="c.id" class="sec">
            <h2 class="sec-title">{{ c.name }}</h2>
            <div class="grid">
              <button v-for="it in c.items" :key="it.id" class="dish" @click="openDetail(it)">
                <span class="dish-photo">
                  <img v-if="it.image" :src="it.image" :alt="it.name" loading="lazy" />
                  <span v-else class="dish-fallback">{{ it.emoji || '🍽️' }}</span>
                  <span v-if="topBadge(it)" class="dish-flag" :class="'flag-' + topBadge(it).tone">
                    {{ topBadge(it).icon }} {{ topBadge(it).label }}
                  </span>
                  <span v-if="cart.qtyOf(it.id)" class="dish-qty">{{ cart.qtyOf(it.id) }}</span>
                </span>
                <span class="dish-body">
                  <strong class="dish-name">{{ it.name }}</strong>
                  <span v-if="it.desc" class="dish-desc">{{ it.desc }}</span>
                  <span v-if="it.portion || it.prepTime" class="dish-specs">
                    <span v-if="it.portion">{{ it.portion }}</span>
                    <span v-if="it.prepTime">⏱ {{ it.prepTime }} min</span>
                  </span>
                  <span class="dish-foot">
                    <span class="dish-price">{{ money(it.price, cur) }}</span>
                    <s v-if="it.oldPrice > it.price" class="dish-old">{{ money(it.oldPrice, cur) }}</s>
                    <span
                      v-if="!closed"
                      class="dish-add"
                      role="button"
                      tabindex="0"
                      :aria-label="'Dodaj ' + it.name"
                      @click.stop="quickAdd(it)"
                      @keydown.enter.stop="quickAdd(it)"
                    >＋</span>
                  </span>
                </span>
              </button>
            </div>
          </section>
        </template>


        <!-- ── o lokalu ─────────────────────────────────── -->
        <section v-if="rest.about || rest.gallery?.length" class="sec about">
          <h2 class="sec-title">{{ t('aboutUs') }}</h2>
          <p v-if="rest.about">{{ rest.about }}</p>

          <div v-if="rest.gallery?.length" class="gallery">
            <button
              v-for="(g, i) in rest.gallery"
              :key="i"
              :aria-label="`Fotografija lokala ${i + 1}`"
              @click="viewer = { photos: rest.gallery, index: i }"
            >
              <img :src="g" :alt="`${rest.name} — ambijent`" loading="lazy" />
            </button>
          </div>
        </section>

        <!-- ── ocene i utisci ───────────────────────────── -->
        <section v-if="reviewsOn" id="ocene" class="sec reviews">
          <div class="rev-head">
            <div>
              <h2 class="sec-title" style="margin-bottom: 2px">{{ t('reviews') }}</h2>
              <p v-if="rating.count" class="small muted">
                {{ fmtRating(rating.avg) }} od 5 · {{ rating.count }}
                {{ rating.count === 1 ? 'ocena' : 'ocena' }}
                <template v-if="rating.verified">
                  · {{ rating.verified }} sa potvrđenom porudžbinom
                </template>
              </p>
              <p v-else class="small muted">Budite prvi koji će ostaviti utisak.</p>
            </div>
            <button class="btn btn-outline btn-sm" @click="reviewOpen = true">{{ t('leaveReview') }}</button>
          </div>

          <!-- prosek i raspodela -->
          <div v-if="rating.count" class="rev-summary card">
            <div class="big-score">
              <strong>{{ fmtRating(rating.avg) }}</strong>
              <StarRating :model-value="rating.avg" readonly precise :size="16" />
              <span class="xs faint">{{ rating.count }} ocena</span>
            </div>
            <div class="dist">
              <div v-for="n in [5, 4, 3, 2, 1]" :key="n" class="dist-row">
                <span class="xs faint" style="width: 26px">{{ n }} ★</span>
                <span class="dist-track">
                  <span class="dist-fill" :style="{ width: (rating.dist[n] / rating.count) * 100 + '%' }"></span>
                </span>
                <span class="xs faint" style="width: 20px; text-align: right">{{ rating.dist[n] }}</span>
              </div>
            </div>
          </div>

          <div v-if="reviews.length" class="rev-list">
            <ReviewCard
              v-for="r in reviews.slice(0, shownReviews)"
              :key="r.id"
              :review="r"
              :restaurant-name="rest.name"
              @photo="viewer = $event"
            />
            <button
              v-if="reviews.length > shownReviews"
              class="btn btn-soft btn-block"
              @click="shownReviews += 6"
            >
              Prikaži još utisaka ({{ reviews.length - shownReviews }})
            </button>
          </div>

          <div v-else class="rev-empty card">
            <span aria-hidden="true">💬</span>
            <p class="small muted">
              Još nema utisaka. Ako ste bili kod nas, napišite par reči — pomaže i nama i gostima
              koji tek biraju.
            </p>
            <button class="btn btn-primary btn-sm" @click="reviewOpen = true">Ostavi prvi utisak</button>
          </div>
        </section>

        <footer class="foot">
          <p class="xs faint">
            {{ rest.name }}<template v-if="rest.address"> · {{ rest.address }}</template>
          </p>
          <a v-if="rest.phone" class="xs" :href="`tel:+${rest.phone}`">📞 +{{ rest.phone }}</a>
          <RouterLink to="/" class="xs faint powered">
            <Logo :size="16" :show-text="false" /> {{ t('poweredBy') }}
          </RouterLink>
        </footer>
      </main>

    <!-- ── donje trake ────────────────────────────────── -->
    <div class="docks">
      <!-- Porudžbina u toku — prati gosta po celom meniju dok ne bude
           gotova, da uvek može do statusa i do poruka osoblju. -->
      <Transition name="sheet">
        <button v-if="activeOrder" class="mybar" :class="{ ping: hasReply }" @click="openMyOrder">
          <span class="my-ico">{{ ORDER_STATUS[activeOrder.status]?.icon }}</span>
          <span class="grow">
            <strong class="truncate">{{ ORDER_STATUS[activeOrder.status]?.guest }}</strong>
            <span class="xs truncate">
              #{{ activeOrder.code }}
              <template v-if="activeOrder.type === 'takeaway' && activeOrder.pickup">
                · preuzimanje
                {{ activeOrder.pickup.mode === 'time' ? activeOrder.pickup.time : 'što pre' }}
              </template>
            </span>
          </span>
          <span class="my-chat">
            💬
            <span v-if="hasReply" class="my-dot"></span>
          </span>
        </button>
      </Transition>

      <Transition name="sheet">
        <button v-if="count && !checkout && !closed" class="cartbar" @click="checkout = true">
          <span class="cb-count">{{ count }}</span>
          <span class="grow truncate">{{ money(total, cur) }}</span>
          <span class="cb-go">Završi porudžbinu →</span>
        </button>
      </Transition>
    </div>

    <!-- ── detalj jela ────────────────────────────────── -->
    <Modal v-if="detail" :title="detail.name" @close="detail = null">
      <div v-if="detail.image" class="detail-img">
        <img :src="detail.image" :alt="detail.name" />
      </div>
      <div v-else class="detail-emoji">{{ detail.emoji }}</div>

      <div v-if="itemScores[detail.id]?.count" class="row" style="gap: var(--s2)">
        <StarRating :model-value="itemScores[detail.id].avg" readonly precise :size="16" />
        <strong class="small">{{ fmtRating(itemScores[detail.id].avg) }}</strong>
        <span class="xs faint">
          · {{ itemScores[detail.id].count }}
          {{ itemScores[detail.id].count === 1 ? 'ocena gosta' : 'ocena gostiju' }}
        </span>
      </div>

      <p v-if="detail.desc" class="muted">{{ detail.desc }}</p>

      <div v-if="detail.badges?.length" class="wrap-row">
        <span
          v-for="b in detail.badges"
          :key="b"
          class="badge"
          :class="'badge-' + (BADGES[b]?.tone || '')"
        >
          {{ BADGES[b]?.icon }} {{ BADGES[b]?.label }}
        </span>
      </div>

      <div v-if="detail.ingredients" class="facts">
        <span class="up faint">Sastojci</span>
        <p class="small">{{ detail.ingredients }}</p>
      </div>

      <div class="wrap-row">
        <span v-if="detail.portion" class="badge">⚖️ {{ detail.portion }}</span>
        <span v-if="detail.prepTime" class="badge">⏱️ ~{{ detail.prepTime }} min</span>
      </div>

      <p v-if="detail.allergens?.length" class="note note-warn xs">
        ⚠️ Sadrži alergene: {{ detail.allergens.join(', ') }}
      </p>

      <div class="field">
        <label class="label">Napomena za kuhinju</label>
        <input v-model="detailNote" class="input" placeholder="npr. bez luka, dobro pečeno…" />
      </div>

      <template #foot>
        <div class="stepper">
          <button class="btn btn-soft btn-icon" @click="detailQty = Math.max(1, detailQty - 1)">−</button>
          <strong class="mono" style="min-width: 28px; text-align: center">{{ detailQty }}</strong>
          <button class="btn btn-soft btn-icon" @click="detailQty++">+</button>
        </div>
        <button class="btn btn-primary grow" :disabled="closed" @click="addFromDetail">
          Dodaj · {{ money(detail.price * detailQty, cur) }}
        </button>
      </template>
    </Modal>

    <!-- ── izbor stola ────────────────────────────────── -->
    <Modal v-if="tablePicker" :title="t('chooseTable')" wide @close="tablePicker = false">
      <template v-if="rest.dinein?.showTables !== false && tables.length">
        <div v-if="zones.length > 1" class="seg" style="width: fit-content">
          <button
            v-for="z in zones"
            :key="z.id"
            :class="{ on: (activeZone?.id || '') === z.id }"
            @click="pickZone = z.id"
          >
            {{ z.name }}
          </button>
        </div>

        <FloorPlan
          :tables="tables"
          :zone-id="activeZone?.id || 'sala'"
          :selected-id="tableId"
          :brand-color="brand"
          @select="pickTable"
        />
        <p class="hint center">Dodirnite sto za kojim sedite.</p>
      </template>

      <div class="field">
        <label class="label">{{ tables.length ? 'Ili upišite broj stola' : 'Broj stola' }}</label>
        <input
          v-model="tableLabel"
          class="input"
          placeholder="npr. 7"
          @input="tableId = (tables.find((t) => String(t.label) === String(tableLabel)) || {}).id || ''"
        />
      </div>

      <template #foot>
        <button class="btn btn-primary btn-block" :disabled="!tableLabel.trim()" @click="tablePicker = false">
          Potvrdi
        </button>
      </template>
    </Modal>

    <!-- ── slanje porudžbine ──────────────────────────── -->
    <Modal v-if="checkout" :title="t('yourOrder')" :busy="sending" @close="checkout = false">
      <!-- Korpa i podaci u istom ekranu — gost ne prolazi kroz dva
           prozora da bi poslao istu porudžbinu. -->
      <Empty v-if="!lines.length" icon="🛒" :title="t('cartEmpty')" :text="t('cartEmptyHint')" />

      <ul v-else class="cart">
        <li v-for="(l, i) in lines" :key="i">
          <span class="c-emoji">{{ l.emoji || '🍽️' }}</span>
          <div class="grow" style="min-width: 0">
            <strong class="small truncate">{{ l.name }}</strong>
            <span v-if="l.note" class="xs faint truncate">↳ {{ l.note }}</span>
            <span class="xs faint">{{ money(l.price, cur) }} {{ t('perPiece') }}</span>
          </div>
          <div class="stepper">
            <button class="btn btn-soft btn-icon btn-sm" :aria-label="'-'" @click="cart.dec(i)">−</button>
            <strong class="mono small" style="min-width: 18px; text-align: center">{{ l.qty }}</strong>
            <button class="btn btn-soft btn-icon btn-sm" :aria-label="'+'" @click="cart.inc(i)">+</button>
          </div>
          <strong class="mono small c-sum">{{ money(l.price * l.qty, cur) }}</strong>
        </li>
      </ul>

      <p v-if="belowMin" class="note note-warn small">
        {{ t('minOrder') }} {{ money(minOrder, cur) }} — {{ t('missing') }}
        {{ money(minOrder - subtotal, cur) }}.
      </p>

      <hr style="margin: 0" />
      <div v-if="rest.mode === 'both'" class="seg" style="width: 100%">
        <button class="grow" :class="{ on: orderType === 'dinein' }" @click="chooseMode('dinein')">
          🍽️ U lokalu
        </button>
        <button class="grow" :class="{ on: orderType === 'delivery' }" @click="chooseMode('delivery')">
          🛵 Dostava
        </button>
      </div>

      <!-- u lokalu -->
      <template v-if="orderType === 'dinein'">
        <div class="field">
          <label class="label">{{ t('table') }} <span class="req">*</span></label>
          <!-- Prava skica lokala: gost prepozna gde sedi, ne mora da traži
               broj na ivici stola. -->
          <FloorPlan
            v-if="showFloor"
            :tables="tables"
            :zone-id="pickZone || zones[0]?.id || 'sala'"
            :selected-id="tableId"
            :brand-color="brand"
            @select="pickTable"
          />

          <div v-if="showFloor && zones.length > 1" class="seg" style="width: fit-content">
            <button
              v-for="z in zones"
              :key="z.id"
              :class="{ on: (pickZone || zones[0]?.id) === z.id }"
              @click="pickZone = z.id"
            >{{ z.name }}</button>
          </div>

          <div v-if="tableLabel" class="picked">
            🪑 Izabrali ste <strong>sto {{ tableLabel }}</strong>
            <template v-if="zoneName"> · {{ zoneName }}</template>
          </div>
          <div class="row">
            <input v-model="tableLabel" class="input grow" placeholder="broj stola" />
            <button v-if="tables.length" class="btn btn-soft" :title="t('tableFromMap')" @click="tablePicker = true">🗺️</button>
          </div>
        </div>
      </template>

      <!-- za poneti -->
      <template v-else-if="orderType === 'takeaway'">
        <div class="field">
          <label class="label">Kada dolazite po porudžbinu? <span class="req">*</span></label>
          <div class="seg" style="width: 100%">
            <button class="grow" :class="{ on: pickup.mode === 'asap' }" @click="pickup.mode = 'asap'">
              ⚡ Što pre (~{{ takeawayEta }} min)
            </button>
            <button
              class="grow"
              :class="{ on: pickup.mode === 'time' }"
              @click="((pickup.mode = 'time'), (pickup.time = pickup.time || pickupSlots[0]))"
            >
              🕒 Tačno vreme
            </button>
          </div>
        </div>

        <div v-if="pickup.mode === 'time'" class="field">
          <label class="label">Vreme preuzimanja</label>
          <div class="slots">
            <button
              v-for="s in pickupSlots"
              :key="s"
              class="slot"
              :class="{ on: pickup.time === s }"
              @click="pickup.time = s"
            >
              {{ s }}
            </button>
          </div>
          <span class="hint">
            Najraniji termin je za {{ takeawayEta }} minuta — toliko traje priprema.
          </span>
        </div>

        <div class="note note-ok small">
          <div>
            Hrana vas čeka spremna — ne morate da zovete ni da čekate za šankom. Javićemo vam
            kad bude gotovo.
          </div>
        </div>
      </template>

      <!-- dostava -->
      <template v-else>
        <div class="field">
          <label class="label">Adresa dostave <span class="req">*</span></label>
          <input v-model="guest.address" class="input" placeholder="Ulica i broj" />
        </div>

        <div class="two">
          <div class="field">
            <label class="label">Sprat / stan</label>
            <input v-model="guest.floor" class="input" placeholder="3. sprat, stan 12" />
          </div>
          <div class="field">
            <label class="label">Tačna lokacija</label>
            <button
              class="btn btn-soft btn-block"
              :class="gettingLocation && 'btn-spin'"
              :disabled="gettingLocation"
              @click="useMyLocation"
            >
              {{ guest.geo ? '✅ Dodata' : '📍 Podeli lokaciju' }}
            </button>
          </div>
        </div>

        
      </template>

      <div class="field">
          <label class="label">Način plaćanja</label>
          <div class="paylist">
            <button
              v-for="o in payOptions"
              :key="o.id"
              class="pay"
              :class="{ on: guest.payment === o.id }"
              @click="guest.payment = o.id"
            >
              <span class="pay-ico">{{ o.icon }}</span>
              <span>{{ o.label }}</span>
            </button>
          </div>
        </div>

      <div :class="orderType === 'dinein' ? '' : 'two'">
        <div class="field">
          <label class="label">Vaše ime</label>
          <input v-model="guest.name" class="input" placeholder="Marko" />
        </div>
        <div v-if="orderType !== 'dinein'" class="field">
          <label class="label">
            Telefon
            <span v-if="orderType !== 'dinein'" class="req">*</span>
          </label>
          <input v-model="guest.phone" class="input" placeholder="+382 6X XXX XXX" />
        </div>
      </div>

      <div class="field">
        <label class="label">Napomena</label>
        <textarea
          v-model="guest.note"
          class="textarea"
          style="min-height: 62px"
          placeholder="npr. pozvonite na drugo zvono"
        ></textarea>
      </div>

      <div class="sums">
        <div class="row-between small">
          <span class="muted">Artikli ({{ count }})</span>
          <span class="mono">{{ money(subtotal, cur) }}</span>
        </div>
        <div v-if="orderType === 'delivery'" class="row-between small">
          <span class="muted">Dostava</span>
          <span class="mono">{{ deliveryFee > 0 ? money(deliveryFee, cur) : 'besplatno' }}</span>
        </div>
        <div class="row-between total-row">
          <strong>Ukupno</strong>
          <strong class="mono">{{ money(total, cur) }}</strong>
        </div>
      </div>

      <p v-if="formError" class="note note-bad small">{{ formError }}</p>

      <p class="hint">
        <template v-if="rest.whatsappSend !== false && rest.whatsappNumber">
          Porudžbina odmah stiže osoblju. Otvoriće se i WhatsApp sa gotovom porukom — pritisnite
          <strong>Pošalji</strong> da lokal dobije obaveštenje i na telefon.
        </template>
        <template v-else>
          Porudžbina odmah stiže osoblju. Pratićete je uživo na sledećem ekranu.
        </template>
      </p>

      <template #foot>
        <button class="btn btn-ghost" :disabled="sending" @click="checkout = false">{{ t('keepBrowsing') }}</button>
        <button
          class="btn btn-primary grow"
          :class="sending && 'btn-spin'"
          :disabled="sending || !lines.length || belowMin"
          @click="submit"
        >
          Pošalji porudžbinu · {{ money(total, cur) }}
        </button>
      </template>
    </Modal>

    <!-- ── rezervacija stola ──────────────────────────── -->
    <Modal v-if="resOpen" :title="t('reserveTitle')" :busy="resBusy" @close="resOpen = false">
      <p class="muted small">
        Lokal vas kontaktira na broj koji ostavite i potvrđuje rezervaciju.
      </p>

      <div class="two">
        <div class="field">
          <label class="label">Ime <span class="req">*</span></label>
          <input v-model="resForm.firstName" class="input" autocomplete="given-name" placeholder="Marko" />
        </div>
        <div class="field">
          <label class="label">Prezime <span class="req">*</span></label>
          <input v-model="resForm.lastName" class="input" autocomplete="family-name" placeholder="Marković" />
        </div>
      </div>

      <div class="field">
        <label class="label">Telefon <span class="req">*</span></label>
        <input v-model="resForm.phone" class="input" type="tel" autocomplete="tel" placeholder="+382 6X XXX XXX" />
      </div>

      <div class="three">
        <div class="field">
          <label class="label">Datum <span class="req">*</span></label>
          <input v-model="resForm.date" class="input" type="date" :min="todayISO()" />
        </div>
        <div class="field">
          <label class="label">Vreme <span class="req">*</span></label>
          <input v-model="resForm.time" class="input" type="time" step="900" />
        </div>
        <div class="field">
          <label class="label">Osoba</label>
          <input v-model.number="resForm.people" class="input" type="number" min="1" max="50" />
        </div>
      </div>

      <div class="field">
        <label class="label">Napomena</label>
        <textarea
          v-model="resForm.note"
          class="textarea"
          style="min-height: 60px"
          placeholder="npr. sto pored prozora, rođendan, dečja stolica…"
        ></textarea>
      </div>

      <p v-if="resError" class="note note-bad small">{{ resError }}</p>

      <template #foot>
        <button class="btn btn-ghost" :disabled="resBusy" @click="resOpen = false">Odustani</button>
        <button
          class="btn btn-primary grow"
          :class="resBusy && 'btn-spin'"
          :disabled="resBusy"
          @click="submitReservation"
        >
          {{ t('sendReservation') }}
        </button>
      </template>
    </Modal>

    <!-- ── utisak gosta ───────────────────────────────── -->
    <ReviewForm
      v-if="reviewOpen"
      :restaurant-id="rid"
      :restaurant-name="rest.name"
      @close="reviewOpen = false"
      @done="reviewOpen = false"
    />

    <!-- Pomoćnik: odgovara o meniju i preporučuje, bez pristupa
         ijednom podatku o vlasniku ili poslovanju. -->
    <GuestAssistant
      v-if="rest.assistant !== false && sections.length"
      :rest="rest"
      :items="available"
      :categories="categories"
      :scores="itemScores"
      :closed="closed"
      @add="quickAdd"
      @open="openDetail"
    />

    <!-- ── izbor jezika ───────────────────────────────── -->
    <Teleport to="body">
      <Transition name="fade">
        <div v-if="langOpen" class="scrim" @click="langOpen = false"></div>
      </Transition>
      <Transition name="sheet">
        <div v-if="langOpen" class="lang-sheet" :style="themeVars">
          <h4>Izaberite jezik</h4>
          <div class="lang-grid">
            <button
              v-for="(l, code) in LOCALES"
              :key="code"
              class="lang-row"
              :class="{ on: locale === code }"
              @click="pickLocale(code)"
            >
              <span class="lang-flag">{{ l.flag }}</span>
              <span class="grow">{{ l.name }}</span>
              <span v-if="locale === code" class="lang-tick">✓</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>

    <PhotoViewer v-if="viewer" :photos="viewer.photos" :start="viewer.index" @close="viewer = null" />
  </div>
</template>

<style scoped>
.app {
  --b: var(--brand);
  min-height: 100dvh;
  background: var(--bg);
  padding-bottom: 96px;
}
.msg-page {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--s5);
}

/* ── naslovna ── */
.hero {
  position: relative;
  isolation: isolate;
  padding: var(--s8) var(--s4) var(--s7);
  text-align: center;
  overflow: hidden;
  min-height: 300px;
  display: grid;
  align-items: end;
}
.cover {
  position: absolute;
  inset: 0;
  z-index: -2;
  background-size: cover;
  background-position: center;
  transform: scale(1.04);
}
.cover-plain {
  background: linear-gradient(
    160deg,
    color-mix(in srgb, var(--b) 34%, var(--bg)) 0%,
    var(--bg) 62%
  );
}
/* Preliv preko fotografije — bez njega tekst nestane na svetloj slici. */
.veil {
  position: absolute;
  inset: 0;
  z-index: -1;
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--bg) 30%, transparent) 0%,
    color-mix(in srgb, var(--bg) 62%, transparent) 45%,
    var(--bg) 100%
  );
}
.has-cover .veil {
  background: linear-gradient(
    180deg,
    rgba(0, 0, 0, 0.42) 0%,
    color-mix(in srgb, var(--bg) 55%, rgba(0, 0, 0, 0.5)) 55%,
    var(--bg) 100%
  );
}
.hero-tools {
  position: absolute;
  top: var(--s3);
  right: var(--s3);
  z-index: 2;
  display: flex;
  align-items: center;
  gap: var(--s2);
}
.lang-now {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  height: 34px;
  padding: 0 11px;
  border-radius: var(--r-full);
  background: var(--glass);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid var(--line);
  font-size: var(--fs-xs);
  font-weight: 650;
  transition: transform var(--fast);
}
.lang-now:active {
  transform: scale(0.96);
}
.lang-flag {
  font-size: 1rem;
  line-height: 1;
}
.lang-caret {
  font-size: 0.8rem;
  opacity: 0.6;
  transition: transform var(--fast);
}
.lang-caret.up {
  transform: rotate(180deg);
}
/* Na uskom ekranu ostaje samo zastavica — ime jezika ionako piše u listi. */
@media (max-width: 420px) {
  .lang-name {
    display: none;
  }
  .lang-now {
    padding: 0 9px;
  }
}

/* ── lista jezika ── */
.lang-sheet {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 92;
  margin-inline: auto;
  width: min(440px, 100%);
  padding: var(--s4);
  padding-bottom: max(var(--s4), env(safe-area-inset-bottom));
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-bottom: none;
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  box-shadow: var(--shadow-lg);
}
.lang-sheet h4 {
  margin: 0 0 var(--s3);
  text-align: center;
  font-size: var(--fs-sm);
}
.lang-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(140px, 100%), 1fr));
  gap: var(--s2);
}
.lang-row {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: 11px var(--s3);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  text-align: left;
  transition: all var(--fast);
}
.lang-row:hover {
  border-color: var(--brand);
}
.lang-row.on {
  border-color: var(--brand);
  background: var(--tint-brand, var(--surface));
}
.lang-tick {
  color: var(--brand);
  font-weight: 800;
}
.hero-in {
  position: relative;
  max-width: 720px;
  margin-inline: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  animation: fade-up 0.6s var(--ease) both;
}
.mark {
  width: 76px;
  height: 76px;
  display: grid;
  place-items: center;
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-lg);
  font-size: 2.1rem;
  overflow: hidden;
  margin-bottom: var(--s2);
}
.mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.hero h1 {
  font-family: var(--font-display, var(--font));
  font-size: var(--fs-2xl);
  letter-spacing: -0.035em;
  line-height: 1.1;
  text-wrap: balance;
}
.has-cover .hero h1 {
  text-shadow: 0 2px 18px rgba(0, 0, 0, 0.4);
}
.tag-line {
  color: var(--ink-2);
  max-width: 46ch;
  line-height: 1.5;
}
.hero-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s2);
  margin-top: var(--s3);
}
.meta {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px var(--s3);
  border-radius: var(--r-full);
  background: var(--surface);
  border: 1px solid var(--line);
  font-size: var(--fs-xs);
  font-weight: 600;
  color: var(--ink-2);
  white-space: nowrap;
}
.meta .soft {
  color: var(--faint);
  font-weight: 500;
}
.slots {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(74px, 100%), 1fr));
  gap: 6px;
}
.slot {
  padding: 8px 4px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: var(--fs-sm);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  transition: all var(--fast);
}
.slot:hover {
  border-color: var(--line-strong);
}
.slot.on {
  border-color: var(--b);
  background: var(--b);
  color: #fff;
}

.hero-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--s2);
  margin-top: var(--s3);
}
.hero-actions .btn {
  min-height: 42px;
  padding-inline: var(--s4);
  border-radius: var(--r-full);
  font-weight: 650;
}
.hero-actions .btn-outline {
  background: var(--surface);
  border-color: var(--line-strong);
}
.hero-actions .btn-outline:hover {
  border-color: var(--b);
  color: var(--b);
}

/* Zvonce je jače obojeno — gost ga traži kad mu nešto zatreba. */
.bell {
  background: var(--b);
  color: #fff;
  box-shadow: 0 6px 18px -8px var(--b);
}
.bell.called {
  background: var(--tint-ok);
  color: var(--ok);
  box-shadow: none;
  opacity: 1;
}

.three {
  display: grid;
  grid-template-columns: 1fr 1fr 0.7fr;
  gap: var(--s2);
}
@media (max-width: 460px) {
  .three {
    grid-template-columns: 1fr 1fr;
  }
  .three > :last-child {
    grid-column: 1 / -1;
  }
}

/* ── sticky traka ── */
.bar {
  position: sticky;
  top: 0;
  z-index: 30;
  background: var(--glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
  padding: var(--s2) var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}
.bar-in {
  display: flex;
  align-items: center;
  gap: var(--s3);
  max-width: 900px;
  margin-inline: auto;
  width: 100%;
}
.bar-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--b) 16%, transparent);
  font-size: 1rem;
  flex: none;
  overflow: hidden;
}
.bar-mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.bar-name {
  font-size: var(--fs-sm);
  flex: none;
  max-width: 30%;
}
.search {
  flex: 1;
  height: 36px;
  min-width: 0;
}
.cart-btn {
  position: relative;
  width: 40px;
  height: 36px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: 1.05rem;
  transition: all var(--fast);
}
.cart-btn:hover {
  border-color: var(--b);
}
.cart-btn.full {
  background: var(--b);
  border-color: var(--b);
}
.cart-n {
  position: absolute;
  top: -6px;
  right: -6px;
  min-width: 19px;
  height: 19px;
  padding: 0 5px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--ink);
  color: var(--bg);
  font-size: 10px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 560px) {
  .bar-name {
    display: none;
  }
  .hero {
    padding-top: var(--s7);
    min-height: 260px;
  }
  .mark {
    width: 64px;
    height: 64px;
    font-size: 1.8rem;
  }
}

.strip {
  max-width: 900px;
  margin-inline: auto;
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: 6px var(--s3);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
}
.strip-ok {
  background: var(--tint-ok);
  color: var(--ok);
}
.strip-warn {
  background: var(--tint-warn);
  color: var(--warn);
}
.strip-bad {
  background: var(--tint-bad);
  color: var(--bad);
}
.strip-btn {
  margin-left: auto;
  text-decoration: underline;
  font-size: var(--fs-xs);
  color: inherit;
  opacity: 0.85;
}

/* ── izbor načina ── */
.choose {
  max-width: 620px;
  margin: var(--s8) auto;
  padding-inline: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  text-align: center;
}
.choose-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
}
@media (max-width: 460px) {
  .choose-grid {
    grid-template-columns: 1fr;
  }
}
.choose-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  padding: var(--s6) var(--s4);
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  transition: all var(--fast);
}
.choose-card:hover {
  border-color: var(--b);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.cc-ico {
  font-size: 2rem;
}

/* ── kategorije ── */
.tabs {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  max-width: 900px;
  margin-inline: auto;
  width: 100%;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.tabs::-webkit-scrollbar {
  display: none;
}
.tab {
  flex: none;
  padding: 8px var(--s4);
  border-radius: var(--r-full);
  font-size: var(--fs-sm);
  font-weight: 650;
  letter-spacing: -0.01em;
  color: var(--muted);
  border: 1px solid transparent;
  background: var(--surface-2);
  transition: all var(--fast);
  white-space: nowrap;
}
.tab:hover {
  color: var(--ink);
  background: var(--surface-3);
}
.tab.on {
  background: var(--b);
  border-color: var(--b);
  color: #fff;
  box-shadow: 0 4px 12px -4px var(--b);
}

/* ── telo ── */
.body {
  max-width: 900px;
  margin-inline: auto;
  padding: var(--s5) var(--s4) 0;
}
.sec {
  margin-bottom: var(--s7);
  scroll-margin-top: 140px;
}
.sec-title {
  font-family: var(--font-display, var(--font));
  font-size: var(--fs-lg);
  margin-bottom: var(--s4);
  letter-spacing: -0.02em;
}

/* ── mreža jela ──────────────────────────────────────
   Dve kolone na telefonu, krupna fotografija na vrhu. Hranu
   prodaje slika — zato ona, a ne tekst, nosi karticu. */
.grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--s3);
}
@media (min-width: 720px) {
  .grid {
    grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr));
  }
}

.dish {
  display: flex;
  flex-direction: column;
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: transform var(--fast), box-shadow var(--fast);
}
.dish:hover {
  box-shadow: var(--shadow);
  transform: translateY(-3px);
}
.dish:active {
  transform: scale(0.985);
}
.dish:hover .dish-photo img {
  transform: scale(1.06);
}

.dish-photo {
  position: relative;
  aspect-ratio: 1;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.dish-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s var(--ease);
}
/* Bez fotografije: topla podloga u boji lokala umesto sive rupe. */
.dish-fallback {
  font-size: 2.8rem;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.18));
}
.dish-photo:has(.dish-fallback) {
  background: linear-gradient(145deg, color-mix(in srgb, var(--b) 24%, var(--surface)), var(--surface-3));
}

.dish-flag {
  position: absolute;
  top: 8px;
  left: 8px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 4px 8px;
  border-radius: var(--r-full);
  font-size: 11px;
  font-weight: 750;
  background: rgba(12, 12, 14, 0.72);
  color: #fff;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  max-width: calc(100% - 16px);
  overflow: hidden;
  white-space: nowrap;
}
.flag-gold {
  color: #ffd464;
}
.flag-hot {
  color: #ff9a72;
}
.flag-green {
  color: #8fe0aa;
}

.dish-qty {
  position: absolute;
  top: 8px;
  right: 8px;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--ink);
  color: var(--bg);
  font-size: 12px;
  font-weight: 800;
}

/* Dugme stoji uz cenu, ne preko fotografije — slika ostaje čista,
   a dugme dobija pun kvadrat od 40px umesto polovine preko ivice. */
.dish-add {
  width: 40px;
  height: 40px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 13px;
  background: var(--b);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 6px 16px -8px var(--b);
  transition: transform var(--fast), box-shadow var(--fast), border-radius var(--fast);
}
.dish-add:hover {
  transform: translateY(-2px);
  border-radius: 18px;
  box-shadow: 0 10px 22px -8px var(--b);
}
.dish-add:active {
  transform: scale(0.92);
}

.dish-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--s3);
  flex: 1;
}
.dish-name {
  font-size: var(--fs-base);
  font-weight: 650;
  line-height: 1.28;
  letter-spacing: -0.012em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dish-desc {
  font-size: var(--fs-xs);
  color: var(--muted);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dish-specs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 2px;
}
.dish-specs > span {
  font-size: 10px;
  font-weight: 600;
  color: var(--muted);
  padding: 3px 7px;
  border-radius: var(--r-full);
  background: var(--surface-2);
  white-space: nowrap;
}

.dish-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: var(--s2);
}
.dish-foot .dish-price {
  margin-right: auto;
}
.dish-price {
  font-size: var(--fs-md);
  font-weight: 780;
  letter-spacing: -0.025em;
  font-variant-numeric: tabular-nums;
}
.dish-old {
  font-size: var(--fs-xs);
  color: var(--faint);
}
.dish-portion {
  font-size: 10px;
  color: var(--faint);
  padding: 2px 6px;
  border-radius: var(--r-full);
  background: var(--surface-2);
}

/* ── izdvojeno ── */
.rail {
  display: flex;
  gap: var(--s3);
  overflow-x: auto;
  padding-bottom: var(--s2);
  scrollbar-width: none;
}
.rail::-webkit-scrollbar {
  display: none;
}
.rail-card {
  flex: none;
  width: 186px;
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: var(--s2);
  border-radius: var(--r-md);
  border: 1px solid var(--line);
  background: var(--surface);
  text-align: left;
  transition: border-color var(--fast), transform var(--fast), box-shadow var(--fast);
}
.rail-card:hover {
  border-color: var(--b);
  transform: translateY(-3px);
  box-shadow: var(--shadow);
}
.rail-card:hover .rail-thumb img {
  transform: scale(1.07);
}
.rail-thumb {
  width: 100%;
  aspect-ratio: 4 / 3;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  display: grid;
  place-items: center;
  font-size: 2.2rem;
  overflow: hidden;
}
.rail-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform var(--slow);
}
@media (max-width: 480px) {
  .rail-card {
    width: 156px;
  }
}

/* ── o lokalu ── */
.about {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}
.about p {
  color: var(--ink-2);
  line-height: 1.7;
  max-width: 66ch;
}
.gallery {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(150px, 100%), 1fr));
  gap: var(--s2);
}
.gallery button {
  aspect-ratio: 4 / 3;
  border-radius: var(--r);
  overflow: hidden;
  border: 1px solid var(--line);
  padding: 0;
  cursor: zoom-in;
  transition: transform var(--fast), border-color var(--fast);
}
.gallery button:hover {
  transform: scale(1.02);
  border-color: var(--b);
}
.gallery img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}


/* ── ocene ── */
.rate-link {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--gold);
  font-weight: 650;
  font-size: var(--fs-xs);
  vertical-align: middle;
}
.rate-link:hover {
  text-decoration: underline;
}

.reviews {
  scroll-margin-top: 150px;
}
.rev-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s3);
  flex-wrap: wrap;
  margin-bottom: var(--s4);
}

.rev-summary {
  display: flex;
  align-items: center;
  gap: var(--s5);
  padding: var(--s4);
  margin-bottom: var(--s4);
}
@media (max-width: 520px) {
  .rev-summary {
    flex-direction: column;
    align-items: stretch;
    gap: var(--s3);
  }
}
.big-score {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  flex: none;
  padding-right: var(--s5);
  border-right: 1px solid var(--line);
}
@media (max-width: 520px) {
  .big-score {
    padding-right: 0;
    border-right: none;
    padding-bottom: var(--s3);
    border-bottom: 1px solid var(--line);
  }
}
.big-score strong {
  font-size: var(--fs-2xl);
  font-weight: 750;
  letter-spacing: -0.03em;
  line-height: 1;
}
.dist {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 5px;
  min-width: 0;
}
.dist-row {
  display: flex;
  align-items: center;
  gap: var(--s2);
}
.dist-track {
  flex: 1;
  height: 6px;
  border-radius: var(--r-full);
  background: var(--surface-2);
  overflow: hidden;
}
.dist-fill {
  display: block;
  height: 100%;
  background: var(--gold);
  border-radius: var(--r-full);
  transition: width var(--slow);
}

.rev-list {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.rev-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s3);
  padding: var(--s7) var(--s4);
  text-align: center;
}
.rev-empty span {
  font-size: 2rem;
  opacity: 0.55;
}
.rev-empty p {
  max-width: 40ch;
}

.facts {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
}
.facts p {
  margin: 0;
  line-height: 1.55;
  color: var(--ink-2);
}

.foot {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s6) 0 var(--s7);
  border-top: 1px solid var(--line);
  text-align: center;
}
.powered {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  opacity: 0.7;
}

/* ── korpa ── */
/* Obe donje trake žive u istoj koloni — kad su obe tu, slažu se
   jedna iznad druge umesto da se preklope. */
.docks {
  position: fixed;
  left: 50%;
  transform: translateX(-50%);
  bottom: max(var(--s4), env(safe-area-inset-bottom));
  z-index: 40;
  width: min(560px, calc(100vw - 2 * var(--s4)));
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  pointer-events: none;
}
.docks > * {
  pointer-events: auto;
}

.mybar {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2) var(--s3) var(--s2) var(--s2);
  border-radius: var(--r-full);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-lg);
  text-align: left;
  width: 100%;
}
.mybar:hover {
  border-color: var(--b);
}
.mybar.ping {
  border-color: var(--b);
  animation: pulse-ring 2s ease-out infinite;
}
.mybar strong {
  display: block;
  font-size: var(--fs-sm);
  line-height: 1.25;
}
.mybar .xs {
  display: block;
  color: var(--faint);
}
.my-ico {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-3);
  flex: none;
}
.my-chat {
  position: relative;
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-2);
  flex: none;
}
.my-dot {
  position: absolute;
  top: 1px;
  right: 1px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bad);
  border: 2px solid var(--surface);
}

.cartbar {
  width: 100%;
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r-full);
  background: var(--b);
  color: #fff;
  font-weight: 700;
  font-size: var(--fs-md);
  box-shadow: 0 14px 40px -10px var(--b), var(--shadow-lg);
  text-align: left;
}
.cartbar:hover {
  filter: brightness(1.06);
}
.cb-count {
  min-width: 30px;
  height: 30px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.26);
  font-size: var(--fs-base);
  font-variant-numeric: tabular-nums;
  flex: none;
}
.cb-go {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  flex: none;
}
@media (max-width: 380px) {
  .cartbar {
    font-size: var(--fs-base);
    padding-inline: var(--s3);
  }
}

.cart {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}
.cart li {
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.cart strong,
.cart .xs {
  display: block;
  line-height: 1.3;
}
.c-emoji {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  flex: none;
}
.stepper {
  display: flex;
  align-items: center;
  gap: var(--s2);
  flex: none;
}

.sums {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
}
.total-row {
  padding-top: var(--s2);
  border-top: 1px dashed var(--line-strong);
  font-size: var(--fs-md);
}

.detail-img img {
  width: 100%;
  max-height: 240px;
  object-fit: cover;
  border-radius: var(--r);
}
.detail-emoji {
  font-size: 3.5rem;
  text-align: center;
  padding: var(--s4);
  background: var(--surface-2);
  border-radius: var(--r);
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
}
@media (max-width: 460px) {
  .two {
    grid-template-columns: 1fr;
  }
}
/* ── traka izbora načina ── */
.modestrip {
  display: flex;
  gap: 6px;
  max-width: 900px;
  margin: var(--s4) auto 0;
  padding-inline: var(--s4);
  overflow-x: auto;
  scrollbar-width: none;
}
.modestrip::-webkit-scrollbar {
  display: none;
}
.ms-btn {
  flex: 1;
  min-width: fit-content;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 10px var(--s3);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface);
  font-size: var(--fs-sm);
  font-weight: 650;
  color: var(--muted);
  white-space: nowrap;
  transition: all var(--fast);
}
.ms-btn:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}
.ms-btn.on {
  background: var(--b);
  border-color: var(--b);
  color: #fff;
}

/* ── korpa u ekranu za slanje ── */
.c-sum {
  flex: none;
  min-width: 58px;
  text-align: right;
}

/* ── telefon: vazduha tamo gde treba, manje gde ne treba ── */
@media (max-width: 640px) {
  .body {
    padding-inline: var(--s4);
  }
  .sec {
    margin-bottom: var(--s6);
  }
  .sec-title {
    font-size: var(--fs-md);
    margin-bottom: var(--s3);
  }
  .grid {
    gap: var(--s2);
  }
  .card-item {
    padding: var(--s2);
    gap: var(--s2);
  }
  .hero {
    min-height: 230px;
    padding-bottom: var(--s5);
  }
  .cart li {
    gap: var(--s2);
  }
  .stepper .btn-icon {
    width: 30px;
    height: 30px;
  }
}
/* ── brzi izbor stola ── */
.tablepick {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(54px, 100%), 1fr));
  gap: 6px;
  max-height: 164px;
  overflow-y: auto;
  padding: 2px;
}
.tp {
  height: 46px;
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: var(--fs-base);
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  transition: all var(--fast);
}
.tp:hover {
  border-color: var(--line-strong);
}
.tp.on {
  background: var(--b);
  border-color: var(--b);
  color: #fff;
  transform: scale(1.05);
}

/* ── kartice ulaze u talasu, ne sve odjednom ── */
@media (prefers-reduced-motion: no-preference) {
  .dish {
    animation: dish-in 0.42s var(--ease) both;
  }
  .dish:nth-child(2) { animation-delay: 0.04s; }
  .dish:nth-child(3) { animation-delay: 0.08s; }
  .dish:nth-child(4) { animation-delay: 0.12s; }
  .dish:nth-child(5) { animation-delay: 0.16s; }
  .dish:nth-child(n + 6) { animation-delay: 0.2s; }
}
@keyframes dish-in {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
/* ── izabrani sto ── */
.picked {
  padding: 10px var(--s3);
  border-radius: var(--r);
  background: var(--tint-ok);
  color: var(--ok);
  font-size: var(--fs-sm);
  font-weight: 600;
}

/* ── načini plaćanja ── */
.paylist {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(104px, 100%), 1fr));
  gap: 6px;
}
.pay {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--s3) var(--s2);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: var(--fs-xs);
  font-weight: 650;
  color: var(--muted);
  transition: all var(--fast);
  text-align: center;
  line-height: 1.25;
}
.pay:hover {
  border-color: var(--line-strong);
  color: var(--ink);
}
.pay.on {
  border-color: var(--b);
  background: var(--tint-brand);
  color: var(--b);
}
.pay-ico {
  font-size: 1.3rem;
}
</style>
