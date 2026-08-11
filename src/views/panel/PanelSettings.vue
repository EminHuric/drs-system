<script setup>
// ─────────────────────────────────────────────────────────────
//  Podešavanja lokala
//
//  Vlasnik menja bukvalno sve što se tiče njegovog lokala. Ono što
//  NE može: status naloga, web adresu i vlasništvo — to drži RDS,
//  i Firestore pravila to sprovode, ne samo ovaj ekran.
// ─────────────────────────────────────────────────────────────

import { computed, ref, watch } from 'vue'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { restaurant, isBlocked, user, displayName, resetPassword } from '@/stores/auth'
import PageHead from '@/components/ui/PageHead.vue'
import Modal from '@/components/ui/Modal.vue'
import QrCode from '@/components/QrCode.vue'
import ImagePicker from '@/components/ImagePicker.vue'
import { THEME_LIST, themeStyle } from '@/lib/themes'
import { LOCALES } from '@/lib/i18n'
import { compressAs, dominantColors, isDarkImage } from '@/lib/image'
import { toast, humanError } from '@/stores/toast'
import { normalizePhone, prettyPhone } from '@/lib/format'
import { guestUrl, supportsDelivery, supportsDinein } from '@/lib/restaurant'
import { BRAND_COLORS, BRAND_PALETTE, NEUTRAL_COLORS, CURRENCIES, MODES } from '@/lib/constants'

const locked = computed(() => isBlocked.value)
const rid = computed(() => restaurant.value?.id)

const f = ref(null)
const saving = ref(false)

// Nesačuvane izmene prepoznajemo poređenjem sa snimkom učitanog stanja.
// Sa običnim watcher-om bi i samo učitavanje forme prijavilo „izmenjeno“,
// pa bi traka za snimanje visila na ekranu bez razloga.
const snapshot = ref('')
const dirty = computed(() => Boolean(f.value) && JSON.stringify(f.value) !== snapshot.value)

function load() {
  const r = restaurant.value
  if (!r) return
  f.value = {
    name: r.name || '',
    tagline: r.tagline || '',
    about: r.about || '',
    logoEmoji: r.logoEmoji || '🍽️',
    logoImage: r.logoImage || '',
    coverImage: r.coverImage || '',
    gallery: [...(r.gallery || [])],
    guestTheme: r.guestTheme || 'auto',
    guestLocale: r.guestLocale || 'sr',
    reviewsEnabled: r.reviewsEnabled !== false,
    whatsappSend: r.whatsappSend !== false,
    reservations: r.reservations === true,
    takeaway: r.takeaway === true,
    takeawayEtaMin: r.takeawayEtaMin ?? 15,
    alarmUntilAccepted: r.alarmUntilAccepted !== false,
    brandColor: r.brandColor || '#e2603f',
    currency: r.currency || '€',
    whatsappNumber: r.whatsappNumber || '',
    phone: r.phone || '',
    city: r.city || '',
    address: r.address || '',
    hours: r.hours || '',
    deliveryFee: r.delivery?.fee ?? 0,
    minOrder: r.delivery?.minOrder ?? 0,
    freeOver: r.delivery?.freeOver ?? 0,
    deliveryEta: r.delivery?.etaMin ?? 40,
    deliveryNote: r.delivery?.note || '',
    dineinEta: r.dinein?.etaMin ?? 15,
    callWaiter: r.dinein?.callWaiter ?? true,
    showTables: r.dinein?.showTables ?? true,
  }
  snapshot.value = JSON.stringify(f.value)
}

watch(restaurant, (r) => { if (r && !f.value) load() }, { immediate: true })

async function save() {
  if (!f.value || locked.value) return
  if (!f.value.name.trim()) return toast.error('Naziv lokala ne može biti prazan.')
  const wa = normalizePhone(f.value.whatsappNumber)
  if (wa.length < 8) return toast.error('WhatsApp broj nije ispravan.')

  saving.value = true
  try {
    await updateDoc(doc(db, 'restaurants', rid.value), {
      name: f.value.name.trim(),
      tagline: f.value.tagline.trim(),
      about: f.value.about.trim(),
      logoEmoji: f.value.logoEmoji,
      logoImage: f.value.logoImage,
      coverImage: f.value.coverImage,
      gallery: f.value.gallery,
      guestTheme: f.value.guestTheme,
      guestLocale: f.value.guestLocale,
      reviewsEnabled: Boolean(f.value.reviewsEnabled),
      whatsappSend: Boolean(f.value.whatsappSend),
      reservations: Boolean(f.value.reservations),
      takeaway: Boolean(f.value.takeaway),
      takeawayEtaMin: Number(f.value.takeawayEtaMin) || 15,
      alarmUntilAccepted: Boolean(f.value.alarmUntilAccepted),
      brandColor: f.value.brandColor,
      currency: f.value.currency,
      whatsappNumber: wa,
      phone: normalizePhone(f.value.phone),
      city: f.value.city.trim(),
      address: f.value.address.trim(),
      hours: f.value.hours.trim(),
      delivery: {
        fee: Number(f.value.deliveryFee) || 0,
        minOrder: Number(f.value.minOrder) || 0,
        freeOver: Number(f.value.freeOver) || 0,
        etaMin: Number(f.value.deliveryEta) || 40,
        note: f.value.deliveryNote.trim(),
      },
      dinein: {
        showTables: Boolean(f.value.showTables),
        callWaiter: Boolean(f.value.callWaiter),
        etaMin: Number(f.value.dineinEta) || 15,
      },
      updatedAt: serverTimestamp(),
    })
    snapshot.value = JSON.stringify(f.value)
    toast.ok('Podešavanja su sačuvana.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    saving.value = false
  }
}

// Pregled se boji istom funkcijom kao prava gost aplikacija, pa je ono
// što vlasnik ovde vidi tačno ono što gost dobija.
const previewVars = computed(() =>
  f.value ? themeStyle({ guestTheme: f.value.guestTheme, brandColor: f.value.brandColor }) : {}
)

// ── boje iz logotipa ─────────────────────────────────────────
// Kad vlasnik doda logo ili naslovnu sliku, iz nje se izvuku boje
// koje zaista koristi — pa bira svoju umesto da pogađa iz palete.

const logoColors = ref([])
const suggestDark = ref(null)

watch(
  () => [f.value?.logoImage, f.value?.coverImage],
  async ([logo, cover]) => {
    const src = logo || cover
    if (!src) {
      logoColors.value = []
      suggestDark.value = null
      return
    }
    try {
      logoColors.value = await dominantColors(src, 5)
      suggestDark.value = await isDarkImage(cover || logo)
    } catch {
      logoColors.value = []
    }
  },
  { deep: false }
)

const suggestedThemes = computed(() => {
  if (suggestDark.value === null) return []
  return THEME_LIST.filter((t) => t.id !== 'auto' && t.dark === suggestDark.value).slice(0, 3)
})

const allColors = ref(false)

// Birač boja vraća mala slova, paleta ih ima raznih — poređenje mora
// da bude neosetljivo na to da bi se izabrana boja pravilno označila.
function sameColor(a, b) {
  return String(a || '').toLowerCase() === String(b || '').toLowerCase()
}

const qrOpen = ref(false)
const galleryBusy = ref(false)
const MAX_GALLERY = 6

async function addGallery(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  const room = MAX_GALLERY - f.value.gallery.length
  if (room <= 0) return toast.info(`Najviše ${MAX_GALLERY} fotografija.`)

  galleryBusy.value = true
  try {
    for (const file of files.slice(0, room)) {
      f.value.gallery.push(await compressAs(file, 'review'))
    }
  } catch (err) {
    toast.error(err.message || 'Fotografija nije mogla da se obradi.')
  } finally {
    galleryBusy.value = false
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(guestUrl(restaurant.value.slug))
    toast.ok('Link je kopiran.')
  } catch {
    toast.error('Kopiranje nije uspelo.')
  }
}

const pwBusy = ref(false)

async function changePassword() {
  pwBusy.value = true
  try {
    await resetPassword(user.value.email)
    toast.ok('Poslali smo vam link za promenu lozinke na email.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    pwBusy.value = false
  }
}

const EMOJIS = ['🍽️', '🍕', '🍔', '🍣', '🥙', '🍜', '☕', '🍺', '🍷', '🏮', '🥐', '🍰', '🌮', '🥗']
</script>

<template>
  <div v-if="f">
    <PageHead title="Podešavanja" subtitle="Izgled, kontakt i pravila naručivanja vašeg lokala.">
      <template #actions>
        <button
          class="btn btn-primary"
          :class="saving && 'btn-spin'"
          :disabled="saving || locked || !dirty"
          @click="save"
        >
          {{ dirty ? 'Sačuvaj izmene' : 'Sačuvano' }}
        </button>
      </template>
    </PageHead>

    <div v-if="locked" class="note note-bad" style="margin-bottom: var(--s4)">
      <div>
        <strong>Nalog je blokiran.</strong> Podešavanja su samo za pregled dok se lokal ne odblokira.
      </div>
    </div>

    <div class="cols">
      <div class="col-main">
        <!-- ── identitet ─────────────────────────────────── -->
        <section class="panel">
          <div class="card-head"><h3>Naziv i opis</h3></div>
          <div class="body">
            <div class="field">
              <label class="label">Naziv <span class="req">*</span></label>
              <input v-model="f.name" class="input" :disabled="locked" />
            </div>

            <div class="field">
              <label class="label">Kratak opis</label>
              <input v-model="f.tagline" class="input" :disabled="locked" placeholder="Mediteranska kuhinja · Bar" />
              <span class="hint">Jedna linija ispod naziva, na vrhu menija.</span>
            </div>

            <div class="field">
              <label class="label">O nama</label>
              <textarea
                v-model="f.about"
                class="textarea"
                :disabled="locked"
                maxlength="900"
                placeholder="Porodični restoran na obali, otvoren 1998. Ribu nabavljamo svakog jutra sa pijace…"
              ></textarea>
              <span class="hint">Par rečenica o lokalu. Gost ih vidi u odeljku „O nama“, ispod menija.</span>
            </div>
          </div>
        </section>

        <!-- ── fotografije ───────────────────────────────── -->
        <section class="panel">
          <div class="card-head">
            <h3>Fotografije</h3>
            <span class="xs faint">sve slike su vaše, sa vašeg uređaja</span>
          </div>
          <div class="body">
            <ImagePicker
              v-model="f.coverImage"
              preset="cover"
              label="Naslovna slika lokala"
              ratio="21 / 9"
              placeholder="🏛️"
              :disabled="locked"
              hint="Prvo što gost vidi kad otvori vaš meni — enterijer, terasa ili sto sa hranom. Široka slika izgleda najbolje."
            />

            <ImagePicker
              v-model="f.logoImage"
              preset="logo"
              label="Logo lokala"
              ratio="1"
              placeholder="🏷️"
              :disabled="locked"
              hint="Ako ga ne dodate, prikazuje se znak koji izaberete ispod."
            />

            <div class="field">
              <label class="label">Znak <span class="faint">(kad nema logotipa)</span></label>
              <div class="emojis">
                <button
                  v-for="e in EMOJIS"
                  :key="e"
                  class="emoji"
                  :class="{ on: f.logoEmoji === e }"
                  :disabled="locked"
                  @click="f.logoEmoji = e"
                >
                  {{ e }}
                </button>
              </div>
            </div>

            <div class="field">
              <label class="label">
                Galerija ambijenta
                <span class="faint">({{ f.gallery.length }} / {{ MAX_GALLERY }})</span>
              </label>
              <div class="gal">
                <div v-for="(g, i) in f.gallery" :key="i" class="gal-item">
                  <img :src="g" alt="" />
                  <button class="gal-rm" aria-label="Ukloni" :disabled="locked" @click="f.gallery.splice(i, 1)">
                    ✕
                  </button>
                </div>

                <label v-if="f.gallery.length < MAX_GALLERY && !locked" class="gal-add" :class="{ busy: galleryBusy }">
                  <span v-if="galleryBusy" class="spinner"></span>
                  <template v-else>
                    <span style="font-size: 1.4rem">＋</span>
                    <span class="xs">Dodaj</span>
                  </template>
                  <input type="file" accept="image/*" multiple hidden :disabled="galleryBusy" @change="addGallery" />
                </label>
              </div>
              <span class="hint">Sala, bašta, roštilj, tim — sve što gostu daje osećaj kako je kod vas.</span>
            </div>
          </div>
        </section>

        <!-- ── tema ──────────────────────────────────────── -->
        <section class="panel">
          <div class="card-head">
            <h3>Izgled za goste</h3>
            <span class="xs faint">tako vaš meni vidi svaki gost</span>
          </div>
          <div class="body">
            <div class="field">
              <label class="label">Jezik menija</label>
              <div class="wrap-row">
                <button
                  v-for="(l, code) in LOCALES"
                  :key="code"
                  class="chip"
                  :class="{ on: f.guestLocale === code }"
                  :disabled="locked"
                  @click="f.guestLocale = code"
                >
                  {{ l.flag }} {{ l.name }}
                </button>
              </div>
              <span class="hint">
                Osnovni jezik vašeg menija. Gost može da ga promeni jednim dodirom zastavice —
                korisno ako imate strane goste. Nazivi jela ostaju onako kako ste ih uneli.
              </span>
            </div>

            <div class="field">
              <label class="label">Tema</label>
              <div class="themes">
                <button
                  v-for="t in THEME_LIST"
                  :key="t.id"
                  class="theme"
                  :class="{ on: f.guestTheme === t.id }"
                  :disabled="locked"
                  @click="f.guestTheme = t.id"
                >
                  <span class="sw">
                    <i v-for="(c, i) in t.swatch" :key="i" :style="{ background: c }"></i>
                  </span>
                  <strong class="small">{{ t.name }}</strong>
                  <span class="xs faint">{{ t.desc }}</span>
                </button>
              </div>
              <span class="hint">
                Tema važi na svakom telefonu isto — kao osvetljenje u lokalu. Samo uz „Kao na
                uređaju gosta“ gost sam bira svetlo ili tamno.
              </span>
            </div>

            <!-- boje izvučene iz logotipa -->
            <div v-if="logoColors.length" class="field">
              <label class="label">Boje sa vašeg logotipa</label>
              <div class="colors">
                <button
                  v-for="c in logoColors"
                  :key="c"
                  class="color"
                  :class="{ on: f.brandColor.toLowerCase() === c }"
                  :style="{ background: c }"
                  :title="c"
                  :aria-label="`Uzmi boju ${c}`"
                  :disabled="locked"
                  @click="f.brandColor = c"
                ></button>
              </div>
              <span class="hint">
                Izvučene iz slike koju ste dodali. Kliknite onu koju prepoznajete kao svoju —
                nema potrebe da je tražite po paleti.
              </span>
            </div>

            <div v-if="suggestedThemes.length" class="field">
              <label class="label">Predlog uz vaše slike</label>
              <div class="wrap-row">
                <button
                  v-for="t in suggestedThemes"
                  :key="t.id"
                  class="chip"
                  :class="{ on: f.guestTheme === t.id }"
                  :disabled="locked"
                  @click="f.guestTheme = t.id"
                >
                  {{ t.name }}
                </button>
              </div>
              <span class="hint">
                Vaša slika je {{ suggestDark ? 'tamna' : 'svetla' }}, pa uz nju najbolje idu ove teme.
              </span>
            </div>

            <div class="field">
              <div class="row-between">
                <label class="label">Boja naglaska</label>
                <button class="linkish xs" @click="allColors = !allColors">
                  {{ allColors ? 'Prikaži manje' : `Sve boje (${BRAND_PALETTE.length + NEUTRAL_COLORS.length})` }}
                </button>
              </div>

              <div class="colors">
                <button
                  v-for="c in BRAND_COLORS"
                  :key="c.value"
                  class="color"
                  :class="{ on: sameColor(f.brandColor, c.value) }"
                  :style="{ background: c.value }"
                  :title="c.name"
                  :aria-label="c.name"
                  :disabled="locked"
                  @click="f.brandColor = c.value"
                ></button>
                <label class="color custom" title="Bilo koja boja">
                  <input
                    type="color"
                    :value="f.brandColor"
                    :disabled="locked"
                    @input="f.brandColor = $event.target.value"
                  />
                </label>
              </div>

              <!-- puna paleta: 14 tonova × 5 jačina + neutralne -->
              <div v-if="allColors" class="palette">
                <button
                  v-for="c in [...BRAND_PALETTE, ...NEUTRAL_COLORS]"
                  :key="c.value"
                  class="swatch"
                  :class="{ on: sameColor(f.brandColor, c.value) }"
                  :style="{ background: c.value }"
                  :title="`${c.name} · ${c.value}`"
                  :aria-label="c.name"
                  :disabled="locked"
                  @click="f.brandColor = c.value"
                ></button>
              </div>

              <span class="hint">
                Njome se boje dugmad, cene i naglasci. Svaka boja iz palete čitljiva je i na
                svetloj i na tamnoj temi. Trenutno: <strong class="mono">{{ f.brandColor }}</strong>
              </span>
            </div>

            <label class="switch">
              <input v-model="f.reviewsEnabled" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Ocene i utisci gostiju</strong>
                <span class="xs faint" style="display: block">
                  Gosti ocenjuju lokal i kače fotografije. Isključeno — odeljak nestaje sa menija,
                  a naručivanje radi kao i pre.
                </span>
              </span>
            </label>

            <!-- živi pregled -->
            <div class="field">
              <label class="label">Kako to izgleda</label>
              <div class="preview" :style="previewVars">
                <div class="pv-hero">
                  <img v-if="f.coverImage" :src="f.coverImage" alt="" />
                  <span class="pv-mark">
                    <img v-if="f.logoImage" :src="f.logoImage" alt="" />
                    <template v-else>{{ f.logoEmoji }}</template>
                  </span>
                </div>
                <div class="pv-body">
                  <strong class="pv-name">{{ f.name || 'Naziv lokala' }}</strong>
                  <span class="pv-tag">{{ f.tagline || 'Kratak opis lokala' }}</span>
                  <div class="pv-item">
                    <span class="pv-thumb">🥙</span>
                    <span class="grow">
                      <strong>Ćevapi u lepinji</strong>
                      <em>10 komada, kajmak, luk</em>
                    </span>
                    <span class="pv-price">8,50 {{ f.currency }}</span>
                  </div>
                  <span class="pv-btn">Poruči</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- ── kontakt ───────────────────────────────────── -->
        <section class="panel">
          <div class="card-head"><h3>Kontakt i porudžbine</h3></div>
          <div class="body">
            <label class="switch">
              <input v-model="f.whatsappSend" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Šalji porudžbine i na WhatsApp</strong>
                <span class="xs faint" style="display: block">
                  Porudžbina uvek stiže u panel. Ovim se dodatno otvara WhatsApp gostu, pa vam
                  zvoni i telefon. Isključeno — porudžbina ide samo u sistem, bez otvaranja
                  ijedne druge aplikacije.
                </span>
              </span>
            </label>

            <div v-if="f.whatsappSend" class="field">
              <label class="label">WhatsApp broj za porudžbine <span class="req">*</span></label>
              <input v-model="f.whatsappNumber" class="input" :disabled="locked" placeholder="+382 69 123 456" />
              <span class="hint">
                Trenutno:
                <strong class="mono">{{ prettyPhone(normalizePhone(f.whatsappNumber)) || '—' }}</strong>
                · Na telefonu se otvara aplikacija, ne web verzija.
              </span>
            </div>

            <div class="two">
              <div class="field">
                <label class="label">Telefon za pozive</label>
                <input v-model="f.phone" class="input" :disabled="locked" />
              </div>
              <div class="field">
                <label class="label">Valuta</label>
                <select v-model="f.currency" class="select" :disabled="locked">
                  <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
                </select>
              </div>
            </div>

            <div class="two">
              <div class="field">
                <label class="label">Grad</label>
                <input v-model="f.city" class="input" :disabled="locked" />
              </div>
              <div class="field">
                <label class="label">Adresa</label>
                <input v-model="f.address" class="input" :disabled="locked" />
              </div>
            </div>

            <div class="field">
              <label class="label">Radno vreme</label>
              <input v-model="f.hours" class="input" :disabled="locked" placeholder="Svaki dan 08–24h" />
            </div>
          </div>
        </section>

        <!-- ── u lokalu ──────────────────────────────────── -->
        <section v-if="supportsDinein(restaurant)" class="panel">
          <div class="card-head"><h3>🍽️ Naručivanje u lokalu</h3></div>
          <div class="body">
            <div class="field" style="max-width: 220px">
              <label class="label">Prosečno vreme pripreme</label>
              <div class="input-group">
                <input v-model.number="f.dineinEta" class="input" type="number" min="1" max="180" :disabled="locked" />
                <span class="addon">min</span>
              </div>
            </div>

            <label class="switch">
              <input v-model="f.showTables" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Prikaži skicu lokala gostu</strong>
                <span class="xs faint" style="display: block">
                  Gost bira sto sa mape. Isključeno — sam upisuje broj stola.
                </span>
              </span>
            </label>

            <label class="switch">
              <input v-model="f.callWaiter" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Dugme „Pozovi konobara“</strong>
                <span class="xs faint" style="display: block">
                  Gost jednim dodirom traži konobara. U panelu se pojavi ekran preko svega koji
                  <strong>zvoni i vibrira dok neko ne pritisne „Idem“</strong> — poziv ne može da
                  se previdi.
                </span>
              </span>
            </label>

            <label class="switch">
              <input v-model="f.reservations" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Rezervacija stola unapred</strong>
                <span class="xs faint" style="display: block">
                  Gost ostavlja ime, prezime, telefon, datum, vreme i broj osoba. Rezervacija
                  stiže na istu tablu gde su i porudžbine.
                </span>
              </span>
            </label>

            <label class="switch">
              <input v-model="f.alarmUntilAccepted" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Zvoni dok porudžbina ne bude prihvaćena</strong>
                <span class="xs faint" style="display: block">
                  Nova porudžbina se oglašava svakih 6 sekundi dok je neko ne prihvati — osoblje
                  ne mora da gleda u ekran. Isključeno: samo jedan signal po porudžbini.
                </span>
              </span>
            </label>
          </div>
        </section>

        <!-- ── za poneti ─────────────────────────────────── -->
        <section class="panel">
          <div class="card-head"><h3>🛍️ Za poneti</h3></div>
          <div class="body">
            <label class="switch">
              <input v-model="f.takeaway" type="checkbox" :disabled="locked" />
              <span class="track"></span>
              <span>
                <strong class="small">Gost može da poruči i dođe po gotovo</strong>
                <span class="xs faint" style="display: block">
                  Bira „što pre" ili tačno vreme dolaska. Ne zove vas telefonom i ne čeka za
                  šankom — hrana ga sačeka spremna.
                </span>
              </span>
            </label>

            <div v-if="f.takeaway" class="field" style="max-width: 240px">
              <label class="label">Vreme pripreme za poneti</label>
              <div class="input-group">
                <input v-model.number="f.takeawayEtaMin" class="input" type="number" min="5" max="180" :disabled="locked" />
                <span class="addon">min</span>
              </div>
              <span class="hint">Najraniji termin koji gost može da izabere.</span>
            </div>
          </div>
        </section>

        <!-- ── dostava ───────────────────────────────────── -->
        <section v-if="supportsDelivery(restaurant)" class="panel">
          <div class="card-head"><h3>🛵 Dostava na adresu</h3></div>
          <div class="body">
            <div class="three">
              <div class="field">
                <label class="label">Cena dostave</label>
                <div class="input-group">
                  <input v-model.number="f.deliveryFee" class="input" type="number" min="0" step="0.1" :disabled="locked" />
                  <span class="addon">{{ f.currency }}</span>
                </div>
              </div>
              <div class="field">
                <label class="label">Najmanja porudžbina</label>
                <div class="input-group">
                  <input v-model.number="f.minOrder" class="input" type="number" min="0" step="0.5" :disabled="locked" />
                  <span class="addon">{{ f.currency }}</span>
                </div>
              </div>
              <div class="field">
                <label class="label">Vreme dostave</label>
                <div class="input-group">
                  <input v-model.number="f.deliveryEta" class="input" type="number" min="5" max="240" :disabled="locked" />
                  <span class="addon">min</span>
                </div>
              </div>
            </div>

            <div class="field" style="max-width: 260px">
              <label class="label">Besplatna dostava preko</label>
              <div class="input-group">
                <input v-model.number="f.freeOver" class="input" type="number" min="0" step="1" :disabled="locked" />
                <span class="addon">{{ f.currency }}</span>
              </div>
              <span class="hint">Ostavite 0 ako nemate besplatnu dostavu.</span>
            </div>

            <div class="field">
              <label class="label">Napomena o dostavi</label>
              <textarea
                v-model="f.deliveryNote"
                class="textarea"
                style="min-height: 68px"
                :disabled="locked"
                placeholder="Dostavljamo u krugu od 5 km. Plaćanje gotovinom kuriru."
              ></textarea>
            </div>
          </div>
        </section>
      </div>

      <!-- ── bočna kolona ────────────────────────────────── -->
      <aside class="col-side">
        <section class="panel">
          <div class="card-head"><h4>Vaš meni na internetu</h4></div>
          <div class="body">
            <div class="input-group">
              <input class="input mono small" :value="guestUrl(restaurant.slug)" readonly />
              <button class="addon" style="cursor: pointer" @click="copyLink">Kopiraj</button>
            </div>
            <div class="wrap-row">
              <a class="btn btn-soft btn-sm grow" :href="guestUrl(restaurant.slug)" target="_blank" rel="noopener">
                ↗ Otvori
              </a>
              <button class="btn btn-soft btn-sm grow" @click="qrOpen = true">📱 QR kod</button>
            </div>
            <p class="hint">
              Podelite ovaj link na Instagramu, Facebooku i Google profilu — to je vaš meni za
              dostavu i za goste van lokala.
            </p>
          </div>
        </section>

        <section class="panel">
          <div class="card-head"><h4>Nalog</h4></div>
          <div class="body">
            <dl class="dl">
              <div><dt>Vlasnik</dt><dd>{{ displayName }}</dd></div>
              <div><dt>Email</dt><dd class="small">{{ user?.email }}</dd></div>
              <div><dt>Web adresa</dt><dd class="mono small">/r/{{ restaurant.slug }}</dd></div>
              <div><dt>Namena</dt><dd>{{ MODES[restaurant.mode]?.label }}</dd></div>
            </dl>

            <button class="btn btn-soft btn-sm btn-block" :class="pwBusy && 'btn-spin'" :disabled="pwBusy" @click="changePassword">
              🔑 Promeni lozinku
            </button>

            <p class="hint">
              Web adresu i namenu naloga menja RDS tim — javite se ako vam treba izmena.
            </p>
          </div>
        </section>
      </aside>
    </div>

    <!-- lepljiva traka kad ima nesačuvanih izmena -->
    <Transition name="fade">
      <div v-if="dirty && !locked" class="savebar">
        <span class="small">Imate nesačuvane izmene.</span>
        <button class="btn btn-ghost btn-sm" @click="load">Poništi</button>
        <button class="btn btn-primary btn-sm" :class="saving && 'btn-spin'" :disabled="saving" @click="save">
          Sačuvaj
        </button>
      </div>
    </Transition>

    <Modal v-if="qrOpen" title="QR kod vašeg menija" @close="qrOpen = false">
      <QrCode :text="guestUrl(restaurant.slug)" :label="restaurant.name" />
      <p class="hint center">
        Ovaj kod vodi na meni bez izabranog stola — dobar je za izlog, vizit-kartu i društvene
        mreže. Kodove po stolovima pravite u „Raspored stolova“.
      </p>
    </Modal>
  </div>
</template>

<style scoped>
.cols {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 320px;
  gap: var(--s4);
  align-items: start;
  padding-bottom: var(--s8);
}
@media (max-width: 1000px) {
  .cols {
    grid-template-columns: 1fr;
  }
}
.col-main,
.col-side {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}
.body {
  padding: var(--s5);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}
.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
}
.three {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s3);
}
@media (max-width: 620px) {
  .two,
  .three {
    grid-template-columns: 1fr;
  }
}

.emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.emoji {
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 1.15rem;
  transition: all var(--fast);
}
.emoji.on {
  border-color: var(--brand);
  background: var(--tint-brand);
}
.colors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
  align-items: center;
}
.color {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  border: 2px solid transparent;
  transition: all var(--fast);
  padding: 0;
}
.color.on {
  border-color: var(--ink);
  transform: scale(1.1);
}
.color.custom {
  background: conic-gradient(#e2603f, #d9a441, #6d9e5a, #2f8fbf, #6366f1, #a63d5b, #e2603f);
  position: relative;
  overflow: hidden;
  cursor: pointer;
  border-color: var(--line-strong);
}
.color.custom input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.linkish {
  color: var(--brand-soft);
  font-weight: 650;
}
.linkish:hover {
  text-decoration: underline;
}

/* Puna paleta — mreža koja se sama slaže prema širini ekrana. */
.palette {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(30px, 100%), 1fr));
  gap: 4px;
  margin-top: var(--s2);
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
  border: 1px solid var(--line);
  max-height: 260px;
  overflow-y: auto;
}
.swatch {
  aspect-ratio: 1;
  border-radius: 5px;
  border: 2px solid transparent;
  transition: transform var(--fast), border-color var(--fast);
  padding: 0;
}
.swatch:hover:not(:disabled) {
  transform: scale(1.18);
  z-index: 1;
}
.swatch.on {
  border-color: var(--ink);
  transform: scale(1.12);
}

/* ── galerija ── */
.gal {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}
.gal-item {
  position: relative;
  width: 96px;
  height: 72px;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 1px solid var(--line);
}
.gal-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.gal-rm {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 20px;
  height: 20px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.6);
  color: #fff;
  font-size: 10px;
}
.gal-rm:hover {
  background: var(--bad);
}
.gal-add {
  width: 96px;
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  border-radius: var(--r-sm);
  border: 1px dashed var(--line-strong);
  background: var(--surface-2);
  color: var(--muted);
  cursor: pointer;
  transition: all var(--fast);
}
.gal-add:hover {
  border-color: var(--brand);
  color: var(--brand-soft);
}

/* ── teme ── */
.themes {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
  gap: var(--s2);
}
.theme {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--s3);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
  text-align: left;
  transition: all var(--fast);
}
.theme:hover:not(:disabled) {
  border-color: var(--line-strong);
}
.theme.on {
  border-color: var(--brand);
  background: var(--tint-brand);
}
.sw {
  display: flex;
  gap: 3px;
  margin-bottom: 5px;
}
.sw i {
  width: 20px;
  height: 20px;
  border-radius: 4px;
  border: 1px solid var(--line);
}

/* ── živi pregled ── */
.preview {
  border-radius: var(--r-md);
  overflow: hidden;
  border: 1px solid var(--line-strong);
  background: var(--bg);
  color: var(--ink);
  max-width: 380px;
}
.pv-hero {
  position: relative;
  height: 96px;
  background: linear-gradient(160deg, color-mix(in srgb, var(--b) 40%, var(--bg)), var(--bg));
  display: grid;
  place-items: center;
}
.pv-hero > img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.55;
}
.pv-mark {
  position: relative;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  font-size: 1.3rem;
  overflow: hidden;
}
.pv-mark img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.pv-body {
  padding: var(--s3);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  background: var(--bg);
}
.pv-name {
  font-family: var(--font-display, var(--font));
  font-size: var(--fs-md);
  color: var(--ink);
}
.pv-tag {
  font-size: var(--fs-xs);
  color: var(--muted);
}
.pv-item {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2);
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line);
}
.pv-item strong {
  display: block;
  font-size: var(--fs-sm);
  color: var(--ink);
}
.pv-item em {
  font-style: normal;
  font-size: var(--fs-xs);
  color: var(--faint);
}
.pv-thumb {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  flex: none;
}
.pv-price {
  font-size: var(--fs-sm);
  font-weight: 700;
  color: var(--b);
}
.pv-btn {
  align-self: flex-start;
  padding: 7px var(--s4);
  border-radius: var(--r-sm);
  background: var(--b);
  color: #fff;
  font-size: var(--fs-sm);
  font-weight: 650;
}

.dl {
  margin: 0;
  display: grid;
  gap: var(--s2);
}
.dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--s3);
  align-items: baseline;
}
.dl dt {
  color: var(--muted);
  font-size: var(--fs-sm);
  flex: none;
}
.dl dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.savebar {
  position: fixed;
  left: 50%;
  bottom: var(--s4);
  transform: translateX(-50%);
  z-index: 50;
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2) var(--s3) var(--s2) var(--s4);
  border-radius: var(--r-full);
  background: var(--surface-3);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-lg);
}
</style>
