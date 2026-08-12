<script setup>
// ─────────────────────────────────────────────────────────────
//  Moja porudžbina — prozor preko menija
//
//  Gost pošalje porudžbinu i ostaje tu gde je bio: u meniju. Dole
//  mu stoji traka sa statusom, a dodir na nju otvara ovaj prozor —
//  koraci, stavke, račun, način plaćanja i sto. Bez odlaska na
//  drugu stranicu i bez ijednog praznog ekrana između.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import Modal from '@/components/ui/Modal.vue'
import Confirm from '@/components/ui/Confirm.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import { toast, humanError } from '@/stores/toast'
import { ago, money, time } from '@/lib/format'
import { ORDER_FLOW, ORDER_STATUS, PAYMENTS } from '@/lib/constants'

const props = defineProps({
  order: { type: Object, required: true },
  restaurantId: { type: String, required: true },
  restaurant: { type: Object, default: () => ({}) },
  now: { type: Number, default: () => Date.now() },
})

const emit = defineEmits(['close'])

const cur = computed(() => props.order.currency || props.restaurant.currency || '€')
const flow = computed(() => ORDER_FLOW[props.order.type] || ORDER_FLOW.dinein)
const stepIndex = computed(() => flow.value.indexOf(props.order.status))
const cancelled = computed(() => props.order.status === 'cancelled')
const finished = computed(() => cancelled.value || props.order.status === 'done')

const eta = computed(() => {
  if (props.order.eta) return props.order.eta
  return props.order.type === 'delivery'
    ? props.restaurant.delivery?.etaMin || null
    : props.restaurant.dinein?.etaMin || null
})

const KORAK = {
  new: 'Poslato',
  accepted: 'Prihvaćeno',
  preparing: 'Priprema se',
  ready: 'Spremno',
  served: 'Servirano',
  delivering: 'U dostavi',
  done: 'Završeno',
}

// Zbir se računa iz stavki, a ne uzima gotov — porudžbina koja je tek
// poslata još nema sve što server dopiše.
const artikli = computed(() =>
  (props.order.lines || []).reduce((s, l) => s + (Number(l.price) || 0) * (Number(l.qty) || 0), 0)
)

const cancelOpen = ref(false)
const cancelling = ref(false)

async function cancelOrder() {
  cancelling.value = true
  try {
    await updateDoc(doc(db, 'restaurants', props.restaurantId, 'orders', props.order.id), {
      status: 'cancelled',
      updatedAt: serverTimestamp(),
    })
    toast.ok('Porudžbina je otkazana.')
    cancelOpen.value = false
    emit('close')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    cancelling.value = false
  }
}
</script>

<template>
  <Modal :title="'Porudžbina #' + order.code" @close="emit('close')">
    <!-- ── stanje ─────────────────────────────────────── -->
    <section class="state" :class="{ done: order.status === 'done', bad: cancelled }">
      <span class="state-ico">{{ ORDER_STATUS[order.status]?.icon }}</span>
      <strong>{{ ORDER_STATUS[order.status]?.guest }}</strong>

      <p v-if="order.status === 'new'" class="small muted">
        Porudžbina je stigla osoblju. Molimo vas sačekajte potvrdu — javićemo vam ovde.
        Slobodno nastavite da razgledate meni.
      </p>
      <template v-else-if="cancelled">
        <p class="small muted">
          Vaša porudžbina je otkazana.
          <template v-if="order.cancelReason">Razlog: <strong>{{ order.cancelReason }}</strong>.</template>
          Ako želite objašnjenje ili da poručite ponovo, pišite osoblju u porukama ispod.
        </p>
      </template>
      <p v-else-if="!finished && eta" class="small muted">Procenjeno vreme: oko {{ eta }} minuta</p>

      <span class="xs faint">Poslato {{ ago(order.createdAt, now) }} u {{ time(order.createdAt) }}</span>
    </section>

    <!-- ── koraci ─────────────────────────────────────── -->
    <ol v-if="!cancelled" class="steps">
      <li v-for="(s, i) in flow" :key="s" :class="{ on: i <= stepIndex, cur: i === stepIndex }">
        <span class="bullet">{{ i < stepIndex ? '✓' : ORDER_STATUS[s]?.icon }}</span>
        <span class="xs">{{ KORAK[s] || ORDER_STATUS[s]?.label }}</span>
      </li>
    </ol>

    <!-- ── šta je naručeno ────────────────────────────── -->
    <section class="block">
      <h4>Šta ste naručili</h4>
      <div v-for="(l, i) in order.lines || []" :key="i" class="line">
        <span class="qty">{{ l.qty }}×</span>
        <span class="grow">
          <span class="truncate">{{ l.label || l.name }}</span>
          <em v-if="l.note">{{ l.note }}</em>
        </span>
        <span class="mono">{{ money(l.price * l.qty, cur) }}</span>
      </div>

      <div class="sum">
        <span class="grow">Artikli</span>
        <span class="mono">{{ money(artikli, cur) }}</span>
      </div>
      <div v-if="order.deliveryFee" class="sum">
        <span class="grow">Dostava</span>
        <span class="mono">{{ money(order.deliveryFee, cur) }}</span>
      </div>
      <div class="sum total">
        <span class="grow">Ukupno</span>
        <strong class="mono">{{ money(order.total ?? artikli, cur) }}</strong>
      </div>
    </section>

    <!-- ── detalji ────────────────────────────────────── -->
    <section class="block">
      <h4>Detalji</h4>
      <dl class="facts">
        <div v-if="order.payment">
          <dt>Plaćanje</dt>
          <dd>{{ PAYMENTS[order.payment] || order.payment }}</dd>
        </div>
        <div v-if="order.type === 'dinein' && order.tableLabel">
          <dt>Sto</dt>
          <dd>
            {{ order.tableLabel }}<template v-if="order.zoneName"> · {{ order.zoneName }}</template>
          </dd>
        </div>
        <div v-if="order.type === 'takeaway' && order.pickup">
          <dt>Preuzimanje</dt>
          <dd>{{ order.pickup.mode === 'time' ? order.pickup.time : 'što pre' }}</dd>
        </div>
        <div v-if="order.type === 'delivery' && order.guest?.address">
          <dt>Adresa</dt>
          <dd>{{ order.guest.address }}</dd>
        </div>
        <div v-if="order.note">
          <dt>Napomena</dt>
          <dd>{{ order.note }}</dd>
        </div>
      </dl>
    </section>

    <!-- ── poruke osoblju ─────────────────────────────── -->
    <!-- Poruke ostaju otvorene i kad je porudzbina otkazana — bas tada
         gost i ima sta da pita. Gase se tek kad je sve zavrseno. -->
    <section v-if="order.status !== 'done'" class="block">
      <h4>Poruke osoblju</h4>
      <ChatPanel
        :restaurant-id="restaurantId"
        :order-id="order.id"
        side="guest"
        :title="restaurant.name"
        placeholder="Pitajte osoblje…"
      />
    </section>

    <template #foot>
      <button
        v-if="order.status === 'new'"
        class="btn btn-ghost del"
        :disabled="cancelling"
        @click="cancelOpen = true"
      >
        Otkaži
      </button>
      <button class="btn btn-primary grow" @click="emit('close')">Nazad na meni</button>
    </template>
  </Modal>

  <Confirm
    v-if="cancelOpen"
    title="Otkazati porudžbinu?"
    text="Osoblje je još nije prihvatilo, pa se može otkazati bez posledica."
    confirm-label="Otkaži porudžbinu"
    danger
    :busy="cancelling"
    @cancel="cancelOpen = false"
    @confirm="cancelOrder"
  />
</template>

<style scoped>
.state {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
  padding: var(--s4) var(--s3) var(--s5);
}
.state-ico {
  font-size: 2.4rem;
  line-height: 1;
}
.state strong {
  font-size: var(--fs-md);
  letter-spacing: -0.02em;
}
.state p {
  margin: 2px 0 0;
  max-width: 34ch;
}
.state.bad strong {
  color: var(--bad);
}
.state.done strong {
  color: var(--ok);
}

/* ── koraci ── */
.steps {
  display: flex;
  list-style: none;
  margin: 0 0 var(--s5);
  padding: 0;
}
.steps li {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  position: relative;
  color: var(--faint);
  text-align: center;
}
/* Linija koja spaja tačke ide iza njih, od sredine do sredine. */
.steps li::before {
  content: '';
  position: absolute;
  top: 13px;
  right: 50%;
  width: 100%;
  height: 2px;
  background: var(--line);
}
.steps li:first-child::before {
  display: none;
}
.steps li.on::before {
  background: var(--b);
}
.bullet {
  width: 27px;
  height: 27px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-3);
  font-size: 12px;
  position: relative;
  z-index: 1;
}
.steps li.on .bullet {
  background: var(--b);
  color: #fff;
}
.steps li.cur {
  color: var(--ink);
  font-weight: 700;
}
.steps li.cur .bullet {
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--b) 22%, transparent);
}

/* ── odeljci ── */
.block {
  padding-top: var(--s4);
  border-top: 1px solid var(--line);
  margin-bottom: var(--s4);
}
.block h4 {
  margin: 0 0 var(--s3);
  font-size: var(--fs-sm);
  color: var(--muted);
}

.line {
  display: flex;
  align-items: baseline;
  gap: var(--s2);
  padding: 5px 0;
  font-size: var(--fs-sm);
}
.line .qty {
  min-width: 26px;
  font-weight: 750;
  color: var(--b);
}
.line em {
  display: block;
  font-style: normal;
  font-size: var(--fs-xs);
  color: var(--faint);
}

.sum {
  display: flex;
  gap: var(--s2);
  padding: 4px 0;
  font-size: var(--fs-sm);
  color: var(--muted);
}
.sum.total {
  margin-top: 4px;
  padding-top: var(--s2);
  border-top: 1px dashed var(--line);
  color: var(--ink);
  font-size: var(--fs-base);
}

.facts {
  margin: 0;
  display: grid;
  gap: var(--s2);
}
.facts > div {
  display: flex;
  gap: var(--s3);
  align-items: baseline;
}
.facts dt {
  min-width: 96px;
  font-size: var(--fs-xs);
  color: var(--faint);
}
.facts dd {
  margin: 0;
  font-size: var(--fs-sm);
  font-weight: 600;
}

.del {
  color: var(--bad);
  margin-right: auto;
}
</style>
