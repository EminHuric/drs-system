<script setup>
// ─────────────────────────────────────────────────────────────
//  Tabla porudžbina uživo
//
//  Ekran koji stoji upaljen ceo dan. Zato: najstarije gore, jasne
//  kolone po fazi rada, i kartica koja menja boju kako vreme ističe.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import { restaurant, isBlocked } from '@/stores/auth'
import { usePanelData } from '@/composables/usePanelData'
import { useTicker } from '@/composables/useLive'
import { markSeen, isUnread } from '@/stores/seen'
import OrderCard from '@/components/OrderCard.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import Modal from '@/components/ui/Modal.vue'
import Empty from '@/components/ui/Empty.vue'
import StatCard from '@/components/ui/StatCard.vue'
import { money, num, toDate } from '@/lib/format'
import { orderTitle } from '@/lib/orders'
import { guestUrl } from '@/lib/restaurant'

const { liveOrders, orders, loading } = usePanelData()
const now = useTicker(1000)

const typeFilter = ref('all')

const filtered = computed(() =>
  liveOrders.value.filter((o) => {
    if (typeFilter.value === 'dinein') return o.type === 'dinein'
    if (typeFilter.value === 'delivery') return o.type === 'delivery' || o.type === 'takeaway'
    return true
  })
)

const columns = computed(() => [
  {
    key: 'new',
    title: 'Nove',
    icon: '🔔',
    tone: 'brand',
    orders: filtered.value.filter((o) => o.status === 'new'),
  },
  {
    key: 'work',
    title: 'U pripremi',
    icon: '👨‍🍳',
    tone: 'warn',
    orders: filtered.value.filter((o) => o.status === 'accepted' || o.status === 'preparing'),
  },
  {
    key: 'out',
    title: 'Za isporuku',
    icon: '📦',
    tone: 'ok',
    orders: filtered.value.filter((o) =>
      ['ready', 'served', 'delivering'].includes(o.status)
    ),
  },
])

const today = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  let count = 0
  let revenue = 0
  for (const o of orders.value) {
    const d = toDate(o.createdAt)
    if (!d || d < start || o.status === 'cancelled') continue
    count++
    revenue += Number(o.total) || 0
  }
  return { count, revenue }
})

const chatOrder = ref(null)

function openChat(o) {
  chatOrder.value = o
  markSeen(o.id)
}
</script>

<template>
  <div>
    <!-- ── stanje naloga ───────────────────────────────── -->
    <div v-if="isBlocked" class="note note-bad" style="margin-bottom: var(--s4)">
      <div>
        <strong>Nalog je blokiran.</strong> Lokal ne prima nove porudžbine i izmene su zaustavljene.
        Postojeće porudžbine i dalje vidite. Za odblokiranje se javite RDS timu.
      </div>
    </div>

    <div
      v-else-if="restaurant && !restaurant.acceptingOrders"
      class="note note-warn"
      style="margin-bottom: var(--s4)"
    >
      <div>
        <strong>Naručivanje je pauzirano.</strong> Gosti vide meni, ali ne mogu da pošalju
        porudžbinu. Uključite prekidač gore desno kad budete spremni.
      </div>
    </div>

    <!-- ── brojke ──────────────────────────────────────── -->
    <div class="stats">
      <StatCard label="U toku" :value="num(liveOrders.length)" tone="brand" live />
      <StatCard
        label="Nove"
        :value="num(columns[0].orders.length)"
        :tone="columns[0].orders.length ? 'warn' : ''"
        icon="🔔"
      />
      <StatCard label="Danas" :value="num(today.count)" tone="info" icon="🧾" />
      <StatCard
        label="Promet danas"
        :value="money(today.revenue, restaurant?.currency)"
        tone="ok"
        icon="💶"
      />
    </div>

    <!-- ── filter ──────────────────────────────────────── -->
    <div class="bar">
      <div class="seg">
        <button :class="{ on: typeFilter === 'all' }" @click="typeFilter = 'all'">Sve</button>
        <button :class="{ on: typeFilter === 'dinein' }" @click="typeFilter = 'dinein'">
          🍽️ Lokal
        </button>
        <button :class="{ on: typeFilter === 'delivery' }" @click="typeFilter = 'delivery'">
          🛵 Dostava
        </button>
      </div>
      <div class="spacer"></div>
      <a
        v-if="restaurant?.slug"
        class="btn btn-soft btn-sm"
        :href="guestUrl(restaurant.slug)"
        target="_blank"
        rel="noopener"
      >
        ↗ Otvori meni kao gost
      </a>
    </div>

    <!-- ── učitavanje ──────────────────────────────────── -->
    <div v-if="loading" class="board">
      <div v-for="i in 3" :key="i" class="col">
        <div class="skeleton" style="height: 34px; margin-bottom: 12px"></div>
        <div class="skeleton" style="height: 200px; margin-bottom: 12px"></div>
        <div class="skeleton" style="height: 160px"></div>
      </div>
    </div>

    <!-- ── prazna tabla ────────────────────────────────── -->
    <div v-else-if="!liveOrders.length" class="panel">
      <Empty
        icon="😌"
        title="Trenutno nema porudžbina u toku"
        text="Čim gost pošalje porudžbinu, pojaviće se ovde — uz zvučni signal, i kad panel nije u prvom planu."
      >
        <div class="wrap-row" style="justify-content: center; margin-top: var(--s2)">
          <RouterLink :to="{ name: 'panel-menu' }" class="btn btn-soft btn-sm">
            Uredi meni
          </RouterLink>
          <RouterLink :to="{ name: 'panel-orders' }" class="btn btn-ghost btn-sm">
            Istorija porudžbina
          </RouterLink>
        </div>
      </Empty>
    </div>

    <!-- ── tabla ───────────────────────────────────────── -->
    <div v-else class="board">
      <section v-for="c in columns" :key="c.key" class="col">
        <header class="col-head">
          <span aria-hidden="true">{{ c.icon }}</span>
          <strong class="grow">{{ c.title }}</strong>
          <span class="badge" :class="c.orders.length ? 'badge-' + c.tone : ''">
            {{ c.orders.length }}
          </span>
        </header>

        <p v-if="!c.orders.length" class="col-empty xs faint">—</p>

        <TransitionGroup v-else name="list" tag="div" class="col-list">
          <OrderCard
            v-for="o in c.orders"
            :key="o.id"
            :order="o"
            :restaurant="restaurant"
            :now="now"
            :unread="isUnread(o)"
            compact
            @chat="openChat"
          />
        </TransitionGroup>
      </section>
    </div>

    <!-- ── ćaskanje ────────────────────────────────────── -->
    <Modal
      v-if="chatOrder"
      :title="`Poruke · ${orderTitle(chatOrder)} (#${chatOrder.code})`"
      @close="chatOrder = null"
    >
      <div style="height: min(58dvh, 480px); display: flex">
        <ChatPanel
          :restaurant-id="restaurant.id"
          :order-id="chatOrder.id"
          side="staff"
          :disabled="isBlocked"
          placeholder="Odgovorite gostu…"
        />
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(160px, 100%), 1fr));
  gap: var(--s3);
  margin-bottom: var(--s4);
}
.bar {
  display: flex;
  align-items: center;
  gap: var(--s3);
  margin-bottom: var(--s4);
  flex-wrap: wrap;
}

.board {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--s4);
  align-items: start;
}
@media (max-width: 1100px) {
  .board {
    grid-template-columns: repeat(auto-fit, minmax(min(300px, 100%), 1fr));
  }
}

.col {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  min-width: 0;
}
.col-head {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s3);
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line);
  position: sticky;
  top: calc(var(--header-h) + var(--s2));
  z-index: 5;
}
.col-list {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  position: relative;
}
.col-empty {
  padding: var(--s5);
  text-align: center;
  border: 1px dashed var(--line);
  border-radius: var(--r);
}
</style>
