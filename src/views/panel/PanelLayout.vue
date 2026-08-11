<script setup>
// ─────────────────────────────────────────────────────────────
//  Okvir vlasničkog panela
//
//  Ovde stoji i "budilnik": čim stigne nova porudžbina, oglasi se
//  zvuk i telefon zavibrira — bez obzira na kom ekranu panela je
//  osoblje. Zato listener živi u okviru, a ne u pojedinačnom ekranu.
// ─────────────────────────────────────────────────────────────

import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import DashShell from '@/components/DashShell.vue'
import { restaurant, isBlocked } from '@/stores/auth'
import { isUnread } from '@/stores/seen'
import { usePanelData, disposePanelData } from '@/composables/usePanelData'
import { supportsDinein } from '@/lib/restaurant'
import { toast, humanError } from '@/stores/toast'
import { chime, buzz, soundOn, toggleSound, unlockAudio, startAlarm, stopAlarm } from '@/lib/sound'
import {
  askNotifyPermission,
  notify,
  notifyState,
  notifySupported,
  useKeepAwake,
} from '@/lib/awake'
import WaiterCall from '@/components/WaiterCall.vue'
import { guestUrl } from '@/lib/restaurant'

const { liveOrders, chats, reviews } = usePanelData()

// Ekran ostaje budan dok je panel otvoren — uspavan ekran ućutka i zvono.
const { wakeActive, wakeSupported } = useKeepAwake()

const unread = computed(() => chats.value.filter(isUnread).length)

// Loše ocene bez odgovora — jedina stvar u panelu koja stvarno traži
// da vlasnik nešto napiše, pa zaslužuje brojku u meniju.
const unanswered = computed(
  () => reviews.value.filter((r) => r.visible !== false && !r.reply && r.rating <= 3).length
)

const nav = computed(() => {
  const n = [
    {
      to: { name: 'panel' },
      label: 'Porudžbine uživo',
      icon: '🔔',
      exact: true,
      badge: liveOrders.value.length || null,
    },
    { to: { name: 'panel-menu' }, label: 'Meni', icon: '🍽️' },
  ]
  if (supportsDinein(restaurant.value)) {
    n.push({ to: { name: 'panel-floor' }, label: 'Raspored stolova', icon: '🪑' })
  }
  n.push(
    { to: { name: 'panel-chat' }, label: 'Poruke', icon: '💬', badge: unread.value || null },
    ...(restaurant.value?.reviewsEnabled === false
      ? []
      : [{ to: { name: 'panel-reviews' }, label: 'Ocene', icon: '⭐', badge: unanswered.value || null }]),
    { to: { name: 'panel-orders' }, label: 'Istorija', icon: '📜' },
    { to: { name: 'panel-stats' }, label: 'Izveštaji', icon: '📈' },
    { to: { name: 'panel-settings' }, label: 'Podešavanja', icon: '⚙️' }
  )
  return n
})

// ── dozivanje konobara ───────────────────────────────────────
// Poziv nije porudžbina koja može da sačeka — zato dobija sopstveni
// ekran preko svega i alarm koji ne prestaje dok ga neko ne preuzme.

const waiterCalls = computed(() =>
  liveOrders.value.filter((o) => o.kind === 'call' && o.status === 'new')
)

// Neprihvaćene porudžbine — zvone isto kao doziv, samo blaže i ređe,
// dok ih neko ne prihvati. Tako osoblje ne mora da gleda u ekran.
const pending = computed(() =>
  liveOrders.value.filter((o) => o.status === 'new' && o.kind !== 'call')
)

watch(
  () => [waiterCalls.value.length, pending.value.length],
  ([calls, orders]) => {
    if (calls > 0) startAlarm('call')
    else if (orders > 0 && restaurant.value?.alarmUntilAccepted !== false) startAlarm('order')
    else stopAlarm()
  },
  { immediate: true }
)

// ── zvono za nove porudžbine ─────────────────────────────────
let known = null

watch(
  liveOrders,
  (list) => {
    const ids = new Set(list.map((o) => o.id))

    // Prvi prolaz samo pamti zatečeno stanje — inače bi panel
    // zazvonio za sve stare porudžbine pri svakom otvaranju.
    if (known === null) {
      known = ids
      return
    }

    // Doziv konobara ima svoj alarm — ovde ga preskačemo da se
    // dva zvuka ne bi preklapala.
    const fresh = list.filter(
      (o) => !known.has(o.id) && o.status === 'new' && o.kind !== 'call'
    )
    if (fresh.length) {
      chime()
      buzz()
      const where =
        fresh[0].type === 'delivery'
          ? 'dostava'
          : fresh[0].kind === 'reservation'
            ? 'rezervacija'
            : 'sto ' + (fresh[0].tableLabel || '?')
      const text =
        fresh.length === 1
          ? `Nova porudžbina ${fresh[0].code} — ${where}`
          : `${fresh.length} novih porudžbina`

      toast.info(text)
      // Probija i kad je panel u drugom tabu ili iza druge aplikacije.
      notify(restaurant.value?.name || 'RDS', text, 'rds-order')
      if (document.hidden) document.title = `(${list.length}) Nova porudžbina — RDS`
    }
    known = ids
  },
  { deep: false }
)

function onVisible() {
  if (!document.hidden) document.title = 'Porudžbine uživo · RDS'
}

const savingAccept = ref(false)

async function toggleAccepting() {
  if (isBlocked.value) return
  savingAccept.value = true
  try {
    await updateDoc(doc(db, 'restaurants', restaurant.value.id), {
      acceptingOrders: !restaurant.value.acceptingOrders,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    savingAccept.value = false
  }
}

onMounted(() => {
  window.addEventListener('pointerdown', unlockAudio, { once: true })
  document.addEventListener('visibilitychange', onVisible)
})

onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisible)
  stopAlarm()
  // Odjava ili odlazak iz panela: gasimo pretplate prethodnog naloga.
  disposePanelData()
})
</script>

<template>
  <DashShell
    :nav="nav"
    role-label="Vlasnik lokala"
    :brand-name="restaurant?.name || 'Moj lokal'"
    :brand-icon="restaurant?.logoEmoji || '🍽️'"
  >
    <template #topbar>
      <span v-if="isBlocked" class="badge badge-bad">🚫 Nalog blokiran</span>

      <label v-else class="switch accept" :title="restaurant?.acceptingOrders ? 'Lokal prima porudžbine' : 'Naručivanje je pauzirano'">
        <input
          type="checkbox"
          :checked="restaurant?.acceptingOrders"
          :disabled="savingAccept"
          @change="toggleAccepting"
        />
        <span class="track"></span>
        <span class="small hide-sm">{{ restaurant?.acceptingOrders ? 'Prima porudžbine' : 'Pauzirano' }}</span>
      </label>

      <button
        class="btn btn-ghost btn-icon"
        :title="soundOn ? 'Isključi zvuk' : 'Uključi zvuk'"
        @click="toggleSound"
      >
        {{ soundOn ? '🔔' : '🔕' }}
      </button>

      <button
        v-if="notifySupported && notifyState !== 'granted'"
        class="btn btn-soft btn-sm"
        title="Dozvoli obaveštenja da te sistem zovne i kad panel nije u prvom planu"
        @click="askNotifyPermission"
      >
        📣 <span class="hide-sm">Uključi obaveštenja</span>
      </button>

      <span
        v-else-if="wakeActive"
        class="badge badge-ok"
        title="Ekran ostaje upaljen dok je panel otvoren"
      >
        👁️ <span class="hide-sm">Ekran budan</span>
      </span>

      <a
        v-if="restaurant?.slug"
        class="btn btn-soft btn-sm"
        :href="guestUrl(restaurant.slug)"
        target="_blank"
        rel="noopener"
      >
        ↗ <span class="hide-sm">Moj meni</span>
      </a>
    </template>

    <template #overlay>
      <WaiterCall
        v-if="waiterCalls.length && restaurant"
        :calls="waiterCalls"
        :restaurant-id="restaurant.id"
      />
    </template>

    <template #side-bottom>
      <div v-if="isBlocked" class="blocked">
        <strong class="small">🚫 Nalog je blokiran</strong>
        <p class="xs">
          Podaci su vam sačuvani i vidljivi, ali izmene su zaustavljene. Javite se RDS timu.
        </p>
      </div>
    </template>
  </DashShell>
</template>

<style scoped>
.accept {
  gap: var(--s2);
}
.blocked {
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--tint-bad);
  color: var(--bad);
  line-height: 1.45;
}
.blocked p {
  margin-top: 4px;
  opacity: 0.85;
}
@media (max-width: 700px) {
  .hide-sm {
    display: none;
  }
}
</style>
