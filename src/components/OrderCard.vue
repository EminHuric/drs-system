<script setup>
// Kartica jedne porudžbine na tabli uživo.
// Boji se sama kako vreme prolazi — konobar mora da vidi šta gori.

import { computed, ref } from 'vue'
import { money, minutesSince, time } from '@/lib/format'
import { ORDER_STATUS, ORDER_FLOW } from '@/lib/constants'
import { advance, cancel, setStatus, orderIcon, orderTitle } from '@/lib/orders'
import { toast, humanError } from '@/stores/toast'
import Modal from '@/components/ui/Modal.vue'
import { buildStatusMessage, whatsappUrl } from '@/lib/whatsapp'

const props = defineProps({
  order: { type: Object, required: true },
  restaurant: { type: Object, required: true },
  now: { type: Number, default: () => Date.now() },
  compact: Boolean,
  unread: Boolean,
})

const emit = defineEmits(['chat'])

const busy = ref(false)
const expanded = ref(false)

const waiting = computed(() => minutesSince(props.order.createdAt, props.now))

// Preko 15 minuta bez pomaka je opomena, preko 25 je alarm.
const heat = computed(() => {
  if (props.order.status === 'new' && waiting.value >= 5) return 'hot'
  if (waiting.value >= 25) return 'hot'
  if (waiting.value >= 15) return 'warm'
  return ''
})

const flow = computed(() => ORDER_FLOW[props.order.type] || ORDER_FLOW.dinein)
const stepIndex = computed(() => flow.value.indexOf(props.order.status))

const nextLabel = computed(() => {
  const i = stepIndex.value
  if (i === -1 || i === flow.value.length - 1) return null
  const s = flow.value[i + 1]
  const map = {
    accepted: 'Prihvati',
    preparing: 'U pripremu',
    ready: 'Spremno',
    served: 'Servirano',
    delivering: 'Vozač krenuo',
    done: 'Završi',
  }
  return { status: s, label: map[s] || ORDER_STATUS[s]?.label }
})

async function doAdvance() {
  busy.value = true
  try {
    await advance(props.restaurant.id, props.order)
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

// Otkazivanje bez objašnjenja je najgore što gost može da dobije:
// porudžbina nestane i niko mu ne kaže zašto. Zato se razlog traži
// pre nego što se otkaže — u dva dodira, ne kucanjem.
const cancelOpen = ref(false)
const cancelReason = ref('')

const RAZLOZI = [
  'Nemamo trenutno taj artikal',
  'Prevelika gužva, ne stižemo',
  'Kuhinja se zatvara',
  'Gost je odustao',
]

function askCancel() {
  cancelReason.value = ''
  cancelOpen.value = true
}

async function doCancel() {
  busy.value = true
  try {
    await cancel(props.restaurant.id, props.order, cancelReason.value.trim())
    toast.ok(`Porudžbina ${props.order.code} je otkazana.`)
    cancelOpen.value = false
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

async function doDone() {
  busy.value = true
  try {
    await setStatus(props.restaurant.id, props.order, 'done')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

function waMessage() {
  const phone = props.order.guest?.phone
  if (!phone) {
    toast.info('Gost nije ostavio broj telefona.')
    return
  }
  const label = ORDER_STATUS[props.order.status]?.guest || ''
  window.open(
    whatsappUrl(phone, buildStatusMessage(props.order, props.restaurant, label)),
    '_blank'
  )
}

function mapsUrl() {
  const g = props.order.guest
  if (g?.geo) return `https://maps.google.com/?q=${g.geo.lat},${g.geo.lng}`
  return `https://maps.google.com/?q=${encodeURIComponent(
    [g?.address, props.restaurant.city].filter(Boolean).join(', ')
  )}`
}
</script>

<template>
  <article class="oc card" :class="[heat && 'heat-' + heat, order.status === 'new' && 'is-new']">
    <!-- ── zaglavlje ────────────────────────────────────── -->
    <header class="oc-head">
      <span class="oc-ico" aria-hidden="true">{{ orderIcon(order) }}</span>

      <div class="grow" style="min-width: 0">
        <strong class="truncate">
          <template v-if="order.kind === 'reservation'">
            🗓️ Rezervacija · {{ order.reservation?.people }} os.
          </template>
          <template v-else-if="order.kind === 'call'">🔔 Doziv konobara</template>
          <template v-else>{{ orderTitle(order) }}</template>
        </strong>
        <span class="xs faint">
          #{{ order.code }} · {{ time(order.createdAt) }}
          <template v-if="order.guest?.name"> · {{ order.guest.name }}</template>
        </span>
      </div>

      <div class="oc-meta">
        <span class="badge" :class="'badge-' + (ORDER_STATUS[order.status]?.tone || 'muted')">
          {{ ORDER_STATUS[order.status]?.label }}
        </span>
        <span class="xs mono" :class="heat === 'hot' ? 'hot-t' : 'faint'">{{ waiting }} min</span>
      </div>
    </header>

    <!-- ── stavke ───────────────────────────────────────── -->
    <ul class="lines">
      <li v-for="(l, i) in expanded || !compact ? order.lines : order.lines.slice(0, 3)" :key="i">
        <span class="qty">{{ l.qty }}×</span>
        <span class="grow">
          {{ l.name }}
          <em v-if="l.note" class="xs faint" style="display: block">↳ {{ l.note }}</em>
        </span>
        <span class="mono small">{{ money(l.price * l.qty, order.currency) }}</span>
      </li>
      <li v-if="compact && !expanded && order.lines.length > 3">
        <button class="more xs" @click="expanded = true">
          + još {{ order.lines.length - 3 }} stavki
        </button>
      </li>
    </ul>

    <!-- ── detalji ──────────────────────────────────────── -->
    <div v-if="order.kind === 'reservation'" class="resv">
      <div class="resv-when">
        <strong>{{ order.reservation?.date }}</strong>
        <span>u {{ order.reservation?.time }}</span>
      </div>
      <div class="small">
        👥 {{ order.reservation?.people }} osoba
        <template v-if="order.guest?.phone"> · 📞 +{{ order.guest.phone }}</template>
      </div>
      <a v-if="order.guest?.phone" class="btn btn-soft btn-sm" :href="`tel:+${order.guest.phone}`">
        📞 Pozovi i potvrdi
      </a>
    </div>

    <!-- Vreme preuzimanja je najvažniji podatak kod porudžbine za poneti:
         po njemu kuhinja odlučuje kad da krene. -->
    <div v-if="order.type === 'takeaway'" class="pickup">
      <span class="pickup-ico">🛍️</span>
      <div class="grow">
        <strong>{{ order.pickup?.mode === 'time' ? order.pickup.time : 'Što pre' }}</strong>
        <span class="xs faint">preuzimanje</span>
      </div>
      <a v-if="order.guest?.phone" class="btn btn-ghost btn-sm" :href="`tel:+${order.guest.phone}`">
        📞
      </a>
    </div>

    <div v-if="order.note" class="note note-warn xs">📝 {{ order.note }}</div>

    <div v-if="order.type === 'delivery'" class="deliv">
      <div class="small">
        📍 {{ order.guest?.address || '—' }}
        <span v-if="order.guest?.floor" class="faint">· {{ order.guest.floor }}</span>
      </div>
      <div class="wrap-row">
        <a class="btn btn-ghost btn-sm" :href="mapsUrl()" target="_blank" rel="noopener">🗺️ Mapa</a>
        <a v-if="order.guest?.phone" class="btn btn-ghost btn-sm" :href="`tel:+${order.guest.phone}`">
          📞 Pozovi
        </a>
      </div>
    </div>

    <!-- ── zbir ─────────────────────────────────────────── -->
    <div class="total">
      <span class="small muted">
        {{ order.lines.length }} {{ order.lines.length === 1 ? 'stavka' : 'stavki' }}
        <template v-if="order.deliveryFee > 0">
          · dostava {{ money(order.deliveryFee, order.currency) }}
        </template>
      </span>
      <strong class="mono">{{ money(order.total, order.currency) }}</strong>
    </div>

    <!-- ── radnje ───────────────────────────────────────── -->
    <footer class="oc-foot">
      <button
        v-if="nextLabel"
        class="btn btn-primary btn-sm grow"
        :class="busy && 'btn-spin'"
        :disabled="busy"
        @click="doAdvance"
      >
        {{ nextLabel.label }} →
      </button>
      <button
        v-else-if="order.status !== 'done' && order.status !== 'cancelled'"
        class="btn btn-ok btn-sm grow"
        :disabled="busy"
        @click="doDone"
      >
        Završi
      </button>

      <button class="btn btn-soft btn-sm chat-btn" title="Poruke sa gostom" @click="emit('chat', order)">
        💬
        <span v-if="unread" class="pip"></span>
      </button>

      <button v-if="order.guest?.phone" class="btn btn-soft btn-sm" title="Javi gostu na WhatsApp" @click="waMessage">
        🟢
      </button>

      <button
        v-if="order.status !== 'cancelled' && order.status !== 'done'"
        class="btn btn-ghost btn-sm"
        title="Otkaži porudžbinu"
        :disabled="busy"
        @click="askCancel"
      >
        ✕
      </button>
    </footer>

    <!-- ── traka napretka ───────────────────────────────── -->
    <div v-if="stepIndex >= 0" class="steps" :aria-label="'Korak ' + (stepIndex + 1)">
      <span
        v-for="(s, i) in flow"
        :key="s"
        class="dotstep"
        :class="{ on: i <= stepIndex }"
        :title="ORDER_STATUS[s]?.label"
      ></span>
    </div>
  </article>

  <!-- ── razlog otkazivanja ─────────────────────────────── -->
  <Modal v-if="cancelOpen" title="Otkazivanje porudžbine" :busy="busy" @close="cancelOpen = false">
    <p class="small muted">
      Gost će videti ovaj razlog na svom telefonu i moći da vam odgovori u porukama.
      Bez razloga mu porudžbina samo nestane i ne zna šta se desilo.
    </p>

    <div class="wrap-row" style="margin: var(--s3) 0">
      <button
        v-for="r in RAZLOZI"
        :key="r"
        class="chip"
        :class="{ on: cancelReason === r }"
        @click="cancelReason = r"
      >
        {{ r }}
      </button>
    </div>

    <div class="field">
      <label class="label">Ili napišite svojim rečima</label>
      <input v-model="cancelReason" class="input" maxlength="120" placeholder="npr. Riba je danas rasprodata" />
    </div>

    <template #foot>
      <button class="btn btn-ghost" :disabled="busy" @click="cancelOpen = false">Odustani</button>
      <button class="btn btn-danger grow" :disabled="busy" @click="doCancel">
        Otkaži porudžbinu
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.oc {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding: var(--s4);
  position: relative;
  overflow: hidden;
}
.oc.is-new {
  border-color: var(--brand);
  box-shadow: 0 0 0 1px var(--brand), var(--shadow);
}
.heat-warm {
  border-color: var(--warn);
}
.heat-hot {
  border-color: var(--bad);
  animation: pulse-ring 2.4s infinite;
}
.hot-t {
  color: var(--bad);
  font-weight: 700;
}

.oc-head {
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.oc-head strong,
.oc-head .xs {
  display: block;
  line-height: 1.25;
}
.oc-ico {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  font-size: 1.05rem;
  flex: none;
}
.oc-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex: none;
}

.lines {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  font-size: var(--fs-sm);
}
.lines li {
  display: flex;
  gap: var(--s2);
  align-items: baseline;
}
.qty {
  font-weight: 700;
  color: var(--brand-soft);
  font-variant-numeric: tabular-nums;
  flex: none;
  min-width: 22px;
}
.more {
  color: var(--muted);
  text-decoration: underline;
}

.deliv {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s3);
  border-radius: var(--r-sm);
  background: var(--surface-2);
}

/* Rezervacija — datum i vreme moraju da se pročitaju iz hoda. */
.resv {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  align-items: flex-start;
  padding: var(--s3);
  border-radius: var(--r-sm);
  background: var(--tint-info);
}
.resv-when {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.resv-when strong {
  font-size: var(--fs-md);
  font-variant-numeric: tabular-nums;
}

.pickup {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2) var(--s3);
  border-radius: var(--r-sm);
  background: var(--tint-ok);
}
.pickup strong {
  display: block;
  font-size: var(--fs-md);
  font-variant-numeric: tabular-nums;
  line-height: 1.2;
}
.pickup-ico {
  font-size: 1.2rem;
}

.total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s3);
  padding-top: var(--s3);
  border-top: 1px dashed var(--line-strong);
}
.total strong {
  font-size: var(--fs-md);
}

.oc-foot {
  display: flex;
  gap: var(--s2);
}
.chat-btn {
  position: relative;
}
.pip {
  position: absolute;
  top: -3px;
  right: -3px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bad);
  border: 2px solid var(--surface);
}

.steps {
  display: flex;
  gap: 4px;
}
.dotstep {
  height: 3px;
  flex: 1;
  border-radius: var(--r-full);
  background: var(--surface-3);
  transition: background var(--slow);
}
.dotstep.on {
  background: var(--brand-grad);
}
</style>
