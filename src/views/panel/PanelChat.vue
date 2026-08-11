<script setup>
// Poruke sa gostima — jedan razgovor po porudžbini.
// Razgovor postoji dok postoji porudžbina, pa je uvek jasno o čemu se priča.

import { computed, ref, watch } from 'vue'
import { restaurant, isBlocked } from '@/stores/auth'
import { usePanelData } from '@/composables/usePanelData'
import { markSeen, isUnread } from '@/stores/seen'
import { useTicker } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import ChatPanel from '@/components/ChatPanel.vue'
import Empty from '@/components/ui/Empty.vue'
import { ago, money } from '@/lib/format'
import { orderIcon, orderTitle } from '@/lib/orders'
import { ORDER_STATUS, LIVE_STATUSES } from '@/lib/constants'

const { chats, liveOrders } = usePanelData()
const now = useTicker(30000)

const onlyOpen = ref(false)

// Porudžbine u toku bez ijedne poruke svejedno nudimo — osoblje
// često prvo želi da javi „stiže za 10 minuta“.
const list = computed(() => {
  const withMsgs = chats.value
  const ids = new Set(withMsgs.map((o) => o.id))
  const silent = liveOrders.value.filter((o) => !ids.has(o.id))
  const all = [...withMsgs, ...silent]
  return onlyOpen.value ? all.filter((o) => LIVE_STATUSES.includes(o.status)) : all
})

const activeId = ref('')
const active = computed(() => list.value.find((o) => o.id === activeId.value) || null)

// Prvi razgovor se otvara sam — na desktopu je prazan desni panel ružan.
watch(
  list,
  (l) => {
    if (!activeId.value && l.length && window.innerWidth > 900) open(l[0])
  },
  { immediate: true }
)

function open(o) {
  activeId.value = o.id
  markSeen(o.id)
}
</script>

<template>
  <div>
    <PageHead title="Poruke" subtitle="Razgovor sa gostom, vezan za njegovu porudžbinu.">
      <template #actions>
        <label class="switch">
          <input v-model="onlyOpen" type="checkbox" />
          <span class="track"></span>
          <span class="small">Samo porudžbine u toku</span>
        </label>
      </template>
    </PageHead>

    <div v-if="!list.length" class="panel">
      <Empty
        icon="💬"
        title="Još nema razgovora"
        text="Kada gost pošalje porudžbinu, ovde možete da mu pišete — vidi vašu poruku odmah, bez razmene brojeva telefona."
      />
    </div>

    <div v-else class="layout">
      <!-- ── spisak ─────────────────────────────────────── -->
      <aside class="panel list-panel" :class="{ 'hide-mobile': activeId }">
        <ul class="list">
          <li v-for="o in list" :key="o.id">
            <button class="row" :class="{ on: activeId === o.id }" @click="open(o)">
              <span class="ico">{{ orderIcon(o) }}</span>
              <div class="grow" style="min-width: 0">
                <div class="row-between" style="gap: var(--s2)">
                  <strong class="truncate small">{{ orderTitle(o) }}</strong>
                  <span class="xs faint nowrap">{{ ago(o.lastMsgAt || o.createdAt, now) }}</span>
                </div>
                <span class="xs faint truncate">
                  #{{ o.code }} · {{ ORDER_STATUS[o.status]?.label }} ·
                  {{ money(o.total, o.currency) }}
                </span>
              </div>
              <span v-if="isUnread(o)" class="pip"></span>
            </button>
          </li>
        </ul>
      </aside>

      <!-- ── razgovor ───────────────────────────────────── -->
      <section class="panel chat-panel" :class="{ 'hide-mobile': !activeId }">
        <template v-if="active">
          <div class="card-head">
            <button class="btn btn-ghost btn-icon btn-sm only-mobile" @click="activeId = ''">←</button>
            <div class="grow" style="min-width: 0">
              <strong class="truncate">{{ orderIcon(active) }} {{ orderTitle(active) }}</strong>
              <span class="xs faint">
                #{{ active.code }} · {{ active.guest?.name || 'Gost' }} ·
                {{ money(active.total, active.currency) }}
              </span>
            </div>
            <span class="badge" :class="'badge-' + (ORDER_STATUS[active.status]?.tone || 'muted')">
              {{ ORDER_STATUS[active.status]?.label }}
            </span>
          </div>

          <div class="chat-body">
            <ChatPanel
              :key="active.id"
              :restaurant-id="restaurant.id"
              :order-id="active.id"
              side="staff"
              :disabled="isBlocked"
              placeholder="Odgovorite gostu…"
            />
          </div>
        </template>

        <Empty v-else icon="👈" title="Izaberite razgovor" text="Sa spiska levo." />
      </section>
    </div>
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: var(--s4);
  align-items: stretch;
  height: calc(100dvh - var(--header-h) - 150px);
  min-height: 460px;
}
.list-panel {
  overflow-y: auto;
}
.chat-panel {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.chat-panel .card-head strong,
.chat-panel .card-head .xs {
  display: block;
  line-height: 1.25;
}
.chat-body {
  flex: 1;
  min-height: 0;
  padding: var(--s4);
  display: flex;
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li + li {
  border-top: 1px solid var(--line);
}
.row {
  display: flex;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  padding: var(--s3) var(--s4);
  text-align: left;
  transition: background var(--fast);
}
.row:hover {
  background: var(--hover);
}
.row.on {
  background: var(--tint-brand);
}
.row strong,
.row .xs {
  display: block;
}
.ico {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  flex: none;
}
.pip {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--bad);
  flex: none;
}

.only-mobile {
  display: none;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
    height: auto;
  }
  .hide-mobile {
    display: none;
  }
  .only-mobile {
    display: inline-flex;
  }
  .chat-body {
    height: 62dvh;
  }
}
</style>
