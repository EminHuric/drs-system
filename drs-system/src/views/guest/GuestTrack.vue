<script setup>
// ─────────────────────────────────────────────────────────────
//  Praćenje porudžbine (gost)
//
//  Gost ovde vidi svoju porudžbinu uživo — status se menja sam,
//  bez osvežavanja, jer je vezan za isti Firestore dokument koji
//  osoblje pomera u svom panelu.
// ─────────────────────────────────────────────────────────────

import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, RouterLink } from 'vue-router'
import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  updateDoc,
  where,
} from 'firebase/firestore'
import { db, firebaseReady } from '@/firebase'
import { ensureGuestSession } from '@/stores/auth'
import { useLiveDoc, useTicker } from '@/composables/useLive'
import ChatPanel from '@/components/ChatPanel.vue'
import ReviewForm from '@/components/ReviewForm.vue'
import Loader from '@/components/ui/Loader.vue'
import Empty from '@/components/ui/Empty.vue'
import Confirm from '@/components/ui/Confirm.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import Logo from '@/components/ui/Logo.vue'
import { toast, humanError } from '@/stores/toast'
import { ago, money, time } from '@/lib/format'
import { ORDER_FLOW, ORDER_STATUS } from '@/lib/constants'
import { themeStyle } from '@/lib/themes'
import { askNotifyPermission, notify, notifyState, notifySupported } from '@/lib/awake'
import { applyRestaurantLocale, t } from '@/lib/i18n'
import { chime } from '@/lib/sound'

const route = useRoute()
const now = useTicker(15000)

const rest = ref(null)
const ready = ref(false)
const missing = ref(false)

const orderRef = computed(() =>
  rest.value ? doc(db, 'restaurants', rest.value.id, 'orders', route.params.orderId) : null
)
const { data: order, loading, error } = useLiveDoc(orderRef)

const cur = computed(() => order.value?.currency || rest.value?.currency || '€')
// Isti izgled kao na meniju — gost ne sme da oseti da je prešao u drugu aplikaciju.
const themeVars = computed(() => themeStyle(rest.value))

const flow = computed(() => ORDER_FLOW[order.value?.type] || ORDER_FLOW.dinein)
const stepIndex = computed(() => flow.value.indexOf(order.value?.status))
const cancelled = computed(() => order.value?.status === 'cancelled')
const finished = computed(() => cancelled.value || order.value?.status === 'done')

const eta = computed(() => {
  if (!order.value || !rest.value) return null
  if (order.value.eta) return order.value.eta
  return order.value.type === 'delivery'
    ? rest.value.delivery?.etaMin || null
    : rest.value.dinein?.etaMin || null
})

// Gost ne gleda u ekran dok čeka — zato i zvuk i sistemsko obaveštenje
// kad lokal pomeri porudžbinu u sledeći korak.
let lastStatus = null
watch(order, (o) => {
  if (!o) return
  if (lastStatus && o.status !== lastStatus) {
    chime()
    notify(
      rest.value?.name || 'Vaša porudžbina',
      `${ORDER_STATUS[o.status]?.guest || ''} · ${t('orderNumber')} ${o.code}`,
      'rds-status-' + o.id
    )
  }
  lastStatus = o.status
})

async function load() {
  if (!firebaseReady) {
    missing.value = true
    ready.value = true
    return
  }
  try {
    // Anonimna sesija mora da postoji PRE čitanja — pravila po njoj
    // prepoznaju da je ovo baš ta porudžbina koju je gost napravio.
    await ensureGuestSession()

    const snap = await getDocs(
      query(collection(db, 'restaurants'), where('slug', '==', route.params.slug), limit(1))
    )
    if (snap.empty) {
      missing.value = true
    } else {
      rest.value = { id: snap.docs[0].id, ...snap.docs[0].data() }
      applyRestaurantLocale(rest.value.guestLocale)
    }
  } catch (e) {
    console.error(e)
    missing.value = true
  } finally {
    ready.value = true
  }
}

// ── utisak posle porudžbine ──────────────────────────────────
// Pitamo tek kad je porudžbina servirana ili završena — ranije gost
// još nema šta da oceni.

const reviewOpen = ref(false)
const reviewed = ref(false)

const canReview = computed(
  () =>
    rest.value?.reviewsEnabled !== false &&
    ['served', 'done', 'delivering'].includes(order.value?.status) &&
    !reviewed.value
)

watch(order, (o) => {
  if (!o) return
  try {
    reviewed.value = localStorage.getItem(`rds.reviewed.${o.id}`) === '1'
  } catch {
    reviewed.value = false
  }
})

function onReviewed() {
  reviewOpen.value = false
  reviewed.value = true
}

// Dok je gost na ovom ekranu, poruke su pročitane — tačka na traci
// „vaša porudžbina" u meniju se time gasi.
watch(
  [order, () => order.value?.lastMsgAt],
  () => {
    const o = order.value
    if (!o) return
    try {
      localStorage.setItem(`rds.seen.${o.id}`, String(Date.now()))
    } catch {
      /* privatni režim */
    }
  },
  { immediate: true }
)

const cancelOpen = ref(false)
const cancelling = ref(false)

async function cancelOrder() {
  cancelling.value = true
  try {
    await updateDoc(orderRef.value, { status: 'cancelled', updatedAt: serverTimestamp() })
    toast.ok('Porudžbina je otkazana.')
    cancelOpen.value = false
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    cancelling.value = false
  }
}

const STEP_LABEL = {
  new: 'Poslato',
  accepted: 'Prihvaćeno',
  preparing: 'Priprema se',
  ready: 'Spremno',
  served: 'Servirano',
  delivering: 'U dostavi',
  done: 'Završeno',
}

onMounted(load)
</script>

<template>
  <Loader v-if="!ready || loading" text="Učitavanje porudžbine…" />

  <div v-else-if="missing || !rest || (!order && !loading)" class="msg">
    <Empty
      icon="🔍"
      :title="error ? 'Nemate pristup ovoj porudžbini' : 'Porudžbina nije pronađena'"
      :text="
        error
          ? 'Porudžbinu može da vidi samo uređaj sa kojeg je poslata — to je zaštita vaše privatnosti.'
          : 'Moguće je da je uklonjena ili da je link netačan.'
      "
    >
      <RouterLink :to="{ name: 'guest', params: { slug: route.params.slug } }" class="btn btn-primary btn-sm">
        Nazad na meni
      </RouterLink>
    </Empty>
  </div>

  <div v-else class="page" :style="themeVars">
    <header class="head">
      <RouterLink :to="{ name: 'guest', params: { slug: route.params.slug } }" class="btn btn-ghost btn-icon">
        ←
      </RouterLink>
      <div class="grow" style="min-width: 0">
        <strong class="truncate">{{ rest.name }}</strong>
        <span class="xs faint">Porudžbina #{{ order.code }}</span>
      </div>
      <ThemeToggle />
    </header>

    <main class="body">
      <!-- ── status ─────────────────────────────────────── -->
      <section class="hero" :class="{ done: order.status === 'done', bad: cancelled }">
        <span class="hero-ico">{{ ORDER_STATUS[order.status]?.icon }}</span>
        <h1>{{ ORDER_STATUS[order.status]?.guest }}</h1>
        <p v-if="!finished && eta" class="muted small">Procenjeno vreme: oko {{ eta }} minuta</p>
        <p v-if="cancelled && order.cancelReason" class="small muted">
          Razlog: {{ order.cancelReason }}
        </p>
        <p class="xs faint">Poslato {{ ago(order.createdAt, now) }} u {{ time(order.createdAt) }}</p>
      </section>

      <!-- ── traka napretka ─────────────────────────────── -->
      <section v-if="!cancelled" class="track card">
        <ol class="steps">
          <li v-for="(s, i) in flow" :key="s" :class="{ on: i <= stepIndex, cur: i === stepIndex }">
            <span class="bullet">{{ i < stepIndex ? '✓' : ORDER_STATUS[s]?.icon }}</span>
            <span class="small">{{ STEP_LABEL[s] || ORDER_STATUS[s]?.label }}</span>
          </li>
        </ol>
      </section>

      <!-- ── stavke ─────────────────────────────────────── -->
      <section class="card">
        <div class="card-head">
          <h3>Vaša porudžbina</h3>
          <span class="badge">
            {{ order.type === 'delivery' ? '🛵 Dostava' : order.type === 'takeaway' ? '🛍️ Za poneti' : '🍽️ U lokalu' }}
          </span>
        </div>

        <ul class="lines">
          <li v-for="(l, i) in order.lines" :key="i">
            <span class="qty">{{ l.qty }}×</span>
            <span class="grow">
              {{ l.name }}
              <em v-if="l.note" class="xs faint" style="display: block">↳ {{ l.note }}</em>
            </span>
            <span class="mono small">{{ money(l.price * l.qty, cur) }}</span>
          </li>
        </ul>

        <div class="sums">
          <div v-if="order.deliveryFee > 0" class="row-between small">
            <span class="muted">Dostava</span>
            <span class="mono">{{ money(order.deliveryFee, cur) }}</span>
          </div>
          <div class="row-between total">
            <strong>Ukupno</strong>
            <strong class="mono">{{ money(order.total, cur) }}</strong>
          </div>
        </div>

        <dl class="meta">
          <div v-if="order.tableLabel">
            <dt>Sto</dt>
            <dd>{{ order.tableLabel }}<template v-if="order.zoneName"> · {{ order.zoneName }}</template></dd>
          </div>
          <div v-if="order.guest?.address">
            <dt>Adresa</dt>
            <dd>{{ order.guest.address }}<template v-if="order.guest.floor"> · {{ order.guest.floor }}</template></dd>
          </div>
          <div v-if="order.guest?.name"><dt>Ime</dt><dd>{{ order.guest.name }}</dd></div>
          <div v-if="order.payment">
            <dt>Plaćanje</dt>
            <dd>{{ order.payment === 'card' ? 'Kartica' : 'Gotovina' }}</dd>
          </div>
          <div v-if="order.note"><dt>Napomena</dt><dd>{{ order.note }}</dd></div>
        </dl>
      </section>

      <!-- ── poziv na utisak ────────────────────────────── -->
      <section v-if="canReview" class="ask card">
        <span class="ask-ico" aria-hidden="true">⭐</span>
        <div class="grow">
          <strong>Kako je bilo?</strong>
          <p class="small muted">
            Ostavite utisak i slike — pomažete i lokalu i gostima koji tek biraju. Traje pola minuta.
          </p>
        </div>
        <button class="btn btn-primary btn-sm" @click="reviewOpen = true">Oceni</button>
      </section>

      <div v-else-if="reviewed" class="note note-ok small">
        <div>Hvala na utisku! Vidljiv je na stranici lokala.</div>
      </div>

      <!-- ── poruke ─────────────────────────────────────── -->
      <section class="card chat-card">
        <div class="card-head">
          <h3>{{ t('messages') }}</h3>
          <span v-if="!finished" class="badge badge-ok">
            <span class="dot dot-live"></span> {{ t('live') }}
          </span>
        </div>

        <!-- Gost obično zaključa telefon dok čeka; bez ovoga bi propustio
             i odgovor osoblja i promenu statusa. -->
        <button
          v-if="notifySupported && notifyState === 'default' && !finished"
          class="notify-ask"
          @click="askNotifyPermission"
        >
          🔔 <span>Javi mi kad odgovore ili kad hrana bude gotova</span>
          <strong>Uključi</strong>
        </button>

        <div class="chat-box">
          <ChatPanel
            :restaurant-id="rest.id"
            :order-id="order.id"
            side="guest"
            :disabled="finished"
            :title="rest.name"
            :placeholder="t('askStaff')"
          />
        </div>
      </section>

      <!-- ── radnje ─────────────────────────────────────── -->
      <div class="acts">
        <button v-if="order.status === 'new'" class="btn btn-danger btn-block" @click="cancelOpen = true">
          Otkaži porudžbinu
        </button>
        <p v-else-if="!finished" class="hint center">
          Porudžbina je već prihvaćena — za izmene pišite osoblju u porukama iznad.
        </p>

        <a v-if="rest.phone" class="btn btn-soft btn-block" :href="`tel:+${rest.phone}`">
          📞 Pozovi lokal
        </a>

        <RouterLink
          :to="{ name: 'guest', params: { slug: route.params.slug } }"
          class="btn btn-ghost btn-block"
        >
          Nazad na meni
        </RouterLink>
      </div>

      <footer class="foot">
        <RouterLink to="/" class="xs faint powered">
          <Logo :size="16" :show-text="false" /> Pokreće RDS
        </RouterLink>
      </footer>
    </main>

    <ReviewForm
      v-if="reviewOpen"
      :restaurant-id="rest.id"
      :restaurant-name="rest.name"
      :order="order"
      @close="reviewOpen = false"
      @done="onReviewed"
    />

    <Confirm
      v-if="cancelOpen"
      title="Otkazati porudžbinu?"
      text="Porudžbina se poništava i osoblje je više neće pripremati. Ovo je moguće samo dok je lokal još nije prihvatio."
      confirm-label="Otkaži porudžbinu"
      cancel-label="Ne, ostavi"
      danger
      :busy="cancelling"
      @cancel="cancelOpen = false"
      @confirm="cancelOrder"
    />
  </div>
</template>

<style scoped>
.page {
  --b: var(--brand);
  min-height: 100dvh;
  background: var(--bg);
}
.msg {
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--s5);
}

.head {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  background: var(--glass);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
}
.head strong,
.head .xs {
  display: block;
  line-height: 1.25;
}

.body {
  max-width: 620px;
  margin-inline: auto;
  padding: var(--s5) var(--s4) var(--s8);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}

.hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  text-align: center;
  padding: var(--s6) var(--s4);
  border-radius: var(--r-lg);
  background: color-mix(in srgb, var(--b) 12%, var(--surface));
  border: 1px solid color-mix(in srgb, var(--b) 32%, transparent);
}
.hero.done {
  background: var(--tint-ok);
  border-color: transparent;
}
.hero.bad {
  background: var(--tint-bad);
  border-color: transparent;
}
.hero h1 {
  font-size: var(--fs-lg);
}
.hero-ico {
  font-size: 2.6rem;
  line-height: 1;
}

.track {
  padding: var(--s4);
}
.steps {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: space-between;
  gap: 2px;
  position: relative;
}
.steps li {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex: 1;
  text-align: center;
  color: var(--faint);
  position: relative;
  min-width: 0;
}
/* Linija između koraka */
.steps li:not(:last-child)::after {
  content: '';
  position: absolute;
  top: 15px;
  left: calc(50% + 18px);
  right: calc(-50% + 18px);
  height: 2px;
  background: var(--surface-3);
}
.steps li.on:not(:last-child)::after {
  background: var(--b);
}
.bullet {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-3);
  font-size: var(--fs-sm);
  flex: none;
  z-index: 1;
  transition: all var(--slow);
}
.steps li.on {
  color: var(--ink);
}
.steps li.on .bullet {
  background: var(--b);
  color: #fff;
}
.steps li.cur .bullet {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--b) 26%, transparent);
}
.steps li span.small {
  font-size: 10px;
  line-height: 1.2;
}

.lines {
  list-style: none;
  margin: 0;
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  font-size: var(--fs-sm);
}
.lines li {
  display: flex;
  gap: var(--s2);
  align-items: baseline;
}
.qty {
  font-weight: 700;
  color: var(--b);
  min-width: 24px;
  flex: none;
}

.sums {
  padding: 0 var(--s4) var(--s3);
  display: flex;
  flex-direction: column;
  gap: 5px;
}
.total {
  padding-top: var(--s2);
  border-top: 1px dashed var(--line-strong);
  font-size: var(--fs-md);
}

.meta {
  margin: 0;
  padding: var(--s3) var(--s4) var(--s4);
  border-top: 1px solid var(--line);
  display: grid;
  gap: var(--s2);
  font-size: var(--fs-sm);
}
.meta > div {
  display: flex;
  justify-content: space-between;
  gap: var(--s3);
  align-items: baseline;
}
.meta dt {
  color: var(--muted);
  flex: none;
}
.meta dd {
  margin: 0;
  text-align: right;
  overflow-wrap: anywhere;
}

.ask {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s4);
  background: color-mix(in srgb, var(--gold) 12%, var(--surface));
  border-color: color-mix(in srgb, var(--gold) 34%, transparent);
}
.ask strong {
  display: block;
  line-height: 1.3;
}
.ask-ico {
  font-size: 1.7rem;
  flex: none;
}

.chat-card {
  display: flex;
  flex-direction: column;
}
.notify-ask {
  display: flex;
  align-items: center;
  gap: var(--s2);
  margin: 0 var(--s4);
  padding: var(--s2) var(--s3);
  border-radius: var(--r-sm);
  background: var(--tint-info);
  color: var(--ink-2);
  font-size: var(--fs-sm);
  text-align: left;
  line-height: 1.35;
}
.notify-ask span {
  flex: 1;
  min-width: 0;
}
.notify-ask strong {
  color: var(--b);
  flex: none;
}
.notify-ask:hover {
  filter: brightness(1.06);
}
.chat-box {
  padding: var(--s4);
  height: 380px;
  display: flex;
}

.acts {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.foot {
  text-align: center;
  padding-top: var(--s4);
}
.powered {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  opacity: 0.7;
}
</style>
