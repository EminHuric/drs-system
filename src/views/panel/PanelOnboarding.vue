<script setup>
// ─────────────────────────────────────────────────────────────
//  Prvo podešavanje lokala
//
//  Vlasnik ovde prolazi kroz četiri koraka i na kraju sam pušta
//  lokal u rad. Do tada je status „onboarding“ i gost ne može da
//  poruči — pravila to ne dozvoljavaju dok status nije „active“.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { collection, doc, serverTimestamp, updateDoc, writeBatch } from 'firebase/firestore'
import { db } from '@/firebase'
import { restaurant } from '@/stores/auth'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import Loader from '@/components/ui/Loader.vue'
import { toast, humanError } from '@/stores/toast'
import { normalizePhone } from '@/lib/format'
import { supportsDelivery, supportsDinein } from '@/lib/restaurant'
import { BRAND_COLORS, CURRENCIES, MODES } from '@/lib/constants'
import { TEMPLATES } from '@/lib/seedMenu'

const router = useRouter()

const step = ref(1)
const saving = ref(false)
const error = ref('')

const f = ref(null)
const template = ref('restoran')
const tableCount = ref(10)

// Formu punimo tek kad restoran stigne iz baze.
const ready = computed(() => {
  if (!restaurant.value) return false
  if (!f.value) {
    const r = restaurant.value
    f.value = {
      name: r.name || '',
      tagline: r.tagline || '',
      logoEmoji: r.logoEmoji || '🍽️',
      brandColor: r.brandColor || '#e2603f',
      currency: r.currency || '€',
      whatsappNumber: r.whatsappNumber || '',
      phone: r.phone || '',
      city: r.city || '',
      address: r.address || '',
      hours: r.hours || '',
      deliveryFee: r.delivery?.fee ?? 0,
      minOrder: r.delivery?.minOrder ?? 0,
      deliveryEta: r.delivery?.etaMin ?? 40,
      dineinEta: r.dinein?.etaMin ?? 15,
      callWaiter: r.dinein?.callWaiter ?? true,
    }
  }
  return true
})

const totalSteps = 4

const canNext = computed(() => {
  if (!f.value) return false
  if (step.value === 1) return Boolean(f.value.name.trim())
  if (step.value === 2) return normalizePhone(f.value.whatsappNumber).length >= 8
  return true
})

function next() {
  if (!canNext.value) {
    error.value =
      step.value === 1 ? 'Naziv lokala je obavezan.' : 'Unesite ispravan WhatsApp broj.'
    return
  }
  error.value = ''
  step.value = Math.min(totalSteps, step.value + 1)
}

function back() {
  error.value = ''
  step.value = Math.max(1, step.value - 1)
}

const EMOJIS = ['🍽️', '🍕', '🍔', '🍣', '🥙', '🍜', '☕', '🍺', '🍷', '🏮', '🥐', '🍰', '🌮', '🥗']

/** Čeka da uslov postane tačan, ali najviše zadato vreme. */
function waitFor(check, timeoutMs) {
  return new Promise((resolve) => {
    if (check()) return resolve(true)
    const started = Date.now()
    const id = setInterval(() => {
      if (check() || Date.now() - started > timeoutMs) {
        clearInterval(id)
        resolve(check())
      }
    }, 60)
  })
}

async function finish() {
  if (!canNext.value) return
  saving.value = true
  error.value = ''

  const rid = restaurant.value.id

  try {
    // 1) Podaci lokala.
    await updateDoc(doc(db, 'restaurants', rid), {
      name: f.value.name.trim(),
      tagline: f.value.tagline.trim(),
      logoEmoji: f.value.logoEmoji,
      brandColor: f.value.brandColor,
      currency: f.value.currency,
      whatsappNumber: normalizePhone(f.value.whatsappNumber),
      phone: normalizePhone(f.value.phone),
      city: f.value.city.trim(),
      address: f.value.address.trim(),
      hours: f.value.hours.trim(),
      delivery: {
        fee: Number(f.value.deliveryFee) || 0,
        minOrder: Number(f.value.minOrder) || 0,
        freeOver: 0,
        etaMin: Number(f.value.deliveryEta) || 40,
        note: '',
      },
      dinein: {
        showTables: true,
        callWaiter: Boolean(f.value.callWaiter),
        etaMin: Number(f.value.dineinEta) || 15,
      },
      updatedAt: serverTimestamp(),
    })

    // 2) Početni meni (ako je izabran šablon).
    if (template.value !== 'prazan') {
      const tpl = TEMPLATES[template.value]
      const batch = writeBatch(db)
      let catSort = 0

      for (const c of tpl.categories) {
        const catRef = doc(collection(db, 'restaurants', rid, 'categories'))
        batch.set(catRef, {
          name: c.name,
          emoji: c.emoji,
          sort: catSort++,
          active: true,
          createdAt: serverTimestamp(),
        })

        let itemSort = 0
        for (const i of c.items) {
          const itemRef = doc(collection(db, 'restaurants', rid, 'items'))
          batch.set(itemRef, {
            categoryId: catRef.id,
            name: i.name,
            desc: i.desc || '',
            price: i.price,
            emoji: i.emoji || '🍽️',
            image: '',
            badges: i.badges || [],
            allergens: [],
            sort: itemSort++,
            active: true,
            featured: false,
            ordersCount: 0,
            rating: 0,
            ratingCount: 0,
            createdAt: serverTimestamp(),
          })
        }
      }
      await batch.commit()
    }

    // 3) Stolovi u pravilnoj mreži — vlasnik ih posle razmešta mišem.
    if (supportsDinein(restaurant.value) && tableCount.value > 0) {
      const batch = writeBatch(db)
      const n = Math.min(60, Math.max(1, Number(tableCount.value) || 0))
      const cols = Math.ceil(Math.sqrt(n))
      for (let i = 0; i < n; i++) {
        const col = i % cols
        const row = Math.floor(i / cols)
        batch.set(doc(collection(db, 'restaurants', rid, 'tables')), {
          label: String(i + 1),
          zoneId: 'sala',
          shape: 'rect',
          seats: 4,
          x: 8 + col * (84 / cols),
          y: 8 + row * 18,
          w: Math.min(16, 70 / cols),
          h: 12,
          sort: i,
          active: true,
        })
      }
      await batch.commit()
    }

    // 4) Lokal ide u rad. Tek sada gost može da poruči.
    await updateDoc(doc(db, 'restaurants', rid), {
      status: 'active',
      acceptingOrders: true,
      updatedAt: serverTimestamp(),
    })

    // Sačekaj da novi status stigne do lokalnog stanja. Bez ovoga bi
    // guard u ruteru još video status „onboarding“ i vratio vlasnika
    // nazad na čarobnjak — beskonačan krug na samom kraju podešavanja.
    await waitFor(() => restaurant.value?.status === 'active', 4000)

    toast.ok('Vaš lokal je na mreži! 🎉')
    router.replace({ name: 'panel' })
  } catch (e) {
    error.value = humanError(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Loader v-if="!ready" text="Učitavanje vašeg lokala…" />

  <div v-else class="wrap-page">
    <header class="top">
      <Logo :size="32" />
      <ThemeToggle />
    </header>

    <main class="box animate-in">
      <!-- napredak -->
      <div class="progress">
        <div v-for="i in totalSteps" :key="i" class="bar" :class="{ on: i <= step }"></div>
      </div>
      <p class="xs faint">Korak {{ step }} od {{ totalSteps }}</p>

      <!-- ── 1. izgled ──────────────────────────────────── -->
      <section v-if="step === 1" class="col" style="gap: var(--s4)">
        <div>
          <h1>Kako se zove vaš lokal?</h1>
          <p class="muted small">Ovo gost vidi na vrhu menija.</p>
        </div>

        <div class="field">
          <label class="label">Naziv <span class="req">*</span></label>
          <input v-model="f.name" class="input" placeholder="Konoba Lanterna" />
        </div>

        <div class="field">
          <label class="label">Kratak opis</label>
          <input v-model="f.tagline" class="input" placeholder="Mediteranska kuhinja · Dobre Vode" />
          <span class="hint">Jedna rečenica ispod naziva. Može i da ostane prazno.</span>
        </div>

        <div class="field">
          <label class="label">Znak lokala</label>
          <div class="emojis">
            <button
              v-for="e in EMOJIS"
              :key="e"
              type="button"
              class="emoji"
              :class="{ on: f.logoEmoji === e }"
              @click="f.logoEmoji = e"
            >
              {{ e }}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="label">Boja brenda</label>
          <div class="colors">
            <button
              v-for="c in BRAND_COLORS"
              :key="c.value"
              type="button"
              class="color"
              :class="{ on: f.brandColor === c.value }"
              :style="{ background: c.value }"
              :title="c.name"
              :aria-label="c.name"
              @click="f.brandColor = c.value"
            ></button>
          </div>
          <span class="hint">Njome se boje dugmad i naglasci u vašoj gost aplikaciji.</span>
        </div>

        <div class="preview" :style="{ '--b': f.brandColor }">
          <span class="pv-ico">{{ f.logoEmoji }}</span>
          <div class="grow" style="min-width: 0">
            <strong class="truncate">{{ f.name || 'Naziv lokala' }}</strong>
            <span class="xs faint truncate">{{ f.tagline || 'Kratak opis' }}</span>
          </div>
          <span class="pv-btn">Poruči</span>
        </div>
      </section>

      <!-- ── 2. kontakt ─────────────────────────────────── -->
      <section v-else-if="step === 2" class="col" style="gap: var(--s4)">
        <div>
          <h1>Gde stižu porudžbine?</h1>
          <p class="muted small">
            Ovo je najvažniji podatak u celom sistemu — na taj broj gost šalje porudžbinu preko
            WhatsApp-a.
          </p>
        </div>

        <div class="field">
          <label class="label">WhatsApp broj <span class="req">*</span></label>
          <input v-model="f.whatsappNumber" class="input" placeholder="+382 69 123 456" />
          <span class="hint">
            Sa pozivnim brojem države. Preporučujemo <strong>WhatsApp Business</strong> — besplatan
            je i ima brze odgovore tipa „Stiže za 10 minuta ✅“.
          </span>
        </div>

        <div class="field">
          <label class="label">Telefon za pozive</label>
          <input v-model="f.phone" class="input" placeholder="+382 30 123 456" />
        </div>

        <div class="two">
          <div class="field">
            <label class="label">Grad</label>
            <input v-model="f.city" class="input" placeholder="Bar" />
          </div>
          <div class="field">
            <label class="label">Valuta</label>
            <select v-model="f.currency" class="select">
              <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
            </select>
          </div>
        </div>

        <div class="field">
          <label class="label">Adresa lokala</label>
          <input v-model="f.address" class="input" placeholder="Obala 12" />
        </div>

        <div class="field">
          <label class="label">Radno vreme</label>
          <input v-model="f.hours" class="input" placeholder="Svaki dan 08–24h" />
        </div>
      </section>

      <!-- ── 3. način rada ──────────────────────────────── -->
      <section v-else-if="step === 3" class="col" style="gap: var(--s4)">
        <div>
          <h1>Podesite način rada</h1>
          <p class="muted small">
            Vaš nalog je otvoren kao: <strong>{{ MODES[restaurant.mode]?.label }}</strong
            >. Ako ovo nije tačno, javite RDS timu.
          </p>
        </div>

        <div v-if="supportsDinein(restaurant)" class="block">
          <h4>🍽️ Naručivanje u lokalu</h4>

          <div class="two">
            <div class="field">
              <label class="label">Koliko imate stolova?</label>
              <input v-model.number="tableCount" class="input" type="number" min="0" max="60" />
              <span class="hint">Napravićemo ih odmah — raspored crtate kasnije, mišem.</span>
            </div>
            <div class="field">
              <label class="label">Prosečno vreme pripreme</label>
              <div class="input-group">
                <input v-model.number="f.dineinEta" class="input" type="number" min="1" max="180" />
                <span class="addon">min</span>
              </div>
            </div>
          </div>

          <label class="switch">
            <input v-model="f.callWaiter" type="checkbox" />
            <span class="track"></span>
            <span class="small">Gost može da pozove konobara jednim dodirom</span>
          </label>
        </div>

        <div v-if="supportsDelivery(restaurant)" class="block">
          <h4>🛵 Dostava na adresu</h4>

          <div class="three">
            <div class="field">
              <label class="label">Cena dostave</label>
              <div class="input-group">
                <input v-model.number="f.deliveryFee" class="input" type="number" min="0" step="0.1" />
                <span class="addon">{{ f.currency }}</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Najmanja porudžbina</label>
              <div class="input-group">
                <input v-model.number="f.minOrder" class="input" type="number" min="0" step="0.5" />
                <span class="addon">{{ f.currency }}</span>
              </div>
            </div>
            <div class="field">
              <label class="label">Vreme dostave</label>
              <div class="input-group">
                <input v-model.number="f.deliveryEta" class="input" type="number" min="5" max="240" />
                <span class="addon">min</span>
              </div>
            </div>
          </div>
        </div>

        <p class="hint">Sve ovo kasnije menjate u Podešavanjima, kad god poželite.</p>
      </section>

      <!-- ── 4. meni ────────────────────────────────────── -->
      <section v-else class="col" style="gap: var(--s4)">
        <div>
          <h1>Da vam napunimo meni?</h1>
          <p class="muted small">
            Izaberite šablon pa ga prilagodite — menjajte cene, brišite i dodajte svoje. Ništa nije
            zaključano.
          </p>
        </div>

        <div class="tpls">
          <button
            v-for="(t, key) in TEMPLATES"
            :key="key"
            type="button"
            class="tpl"
            :class="{ on: template === key }"
            @click="template = key"
          >
            <span class="tpl-ico">{{ t.icon }}</span>
            <strong class="small">{{ t.label }}</strong>
            <span class="xs faint">{{ t.desc }}</span>
            <span class="xs faint">
              {{ t.categories.length }} kategorija ·
              {{ t.categories.reduce((s, c) => s + c.items.length, 0) }} artikala
            </span>
          </button>

          <button type="button" class="tpl" :class="{ on: template === 'prazan' }" @click="template = 'prazan'">
            <span class="tpl-ico">📝</span>
            <strong class="small">Počeću od nule</strong>
            <span class="xs faint">Prazan meni — sve unosim sam.</span>
          </button>
        </div>

        <div class="note note-ok small">
          <div>
            Posle ovog koraka vaš meni je javno dostupan na
            <strong class="mono">/r/{{ restaurant.slug }}</strong> i lokal počinje da prima
            porudžbine.
          </div>
        </div>
      </section>

      <p v-if="error" class="note note-bad small">{{ error }}</p>

      <!-- ── dugmad ─────────────────────────────────────── -->
      <div class="nav">
        <button v-if="step > 1" class="btn btn-ghost" :disabled="saving" @click="back">
          ← Nazad
        </button>
        <div class="spacer"></div>
        <button v-if="step < totalSteps" class="btn btn-primary btn-lg" @click="next">
          Dalje →
        </button>
        <button
          v-else
          class="btn btn-primary btn-lg"
          :class="saving && 'btn-spin'"
          :disabled="saving"
          @click="finish"
        >
          Pusti lokal u rad 🚀
        </button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.wrap-page {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--s5);
  gap: var(--s5);
}
.top {
  width: 100%;
  max-width: 620px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.box {
  width: 100%;
  max-width: 620px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--s6);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  margin-bottom: auto;
}
.box h1 {
  font-size: var(--fs-xl);
}

.progress {
  display: flex;
  gap: 5px;
}
.bar {
  flex: 1;
  height: 4px;
  border-radius: var(--r-full);
  background: var(--surface-3);
  transition: background var(--slow);
}
.bar.on {
  background: var(--brand-grad);
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
@media (max-width: 560px) {
  .two,
  .three {
    grid-template-columns: 1fr;
  }
  .box {
    padding: var(--s5);
  }
}

.block {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding: var(--s4);
  border-radius: var(--r);
  background: var(--surface-2);
  border: 1px solid var(--line);
}

.emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.emoji {
  width: 42px;
  height: 42px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 1.2rem;
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
}
.color {
  width: 36px;
  height: 36px;
  border-radius: var(--r-sm);
  border: 2px solid transparent;
  transition: all var(--fast);
}
.color.on {
  border-color: var(--ink);
  transform: scale(1.1);
}

.preview {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
}
.preview strong,
.preview .xs {
  display: block;
  line-height: 1.25;
}
.pv-ico {
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: color-mix(in srgb, var(--b) 18%, transparent);
  font-size: 1.25rem;
  flex: none;
}
.pv-btn {
  padding: 7px var(--s4);
  border-radius: var(--r-sm);
  background: var(--b);
  color: #fff;
  font-size: var(--fs-sm);
  font-weight: 650;
  flex: none;
}

.tpls {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: var(--s3);
}
.tpl {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--s4);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
  text-align: left;
  transition: all var(--fast);
}
.tpl:hover {
  border-color: var(--line-strong);
}
.tpl.on {
  border-color: var(--brand);
  background: var(--tint-brand);
}
.tpl-ico {
  font-size: 1.5rem;
  margin-bottom: 2px;
}

.nav {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding-top: var(--s3);
  border-top: 1px solid var(--line);
}
</style>
