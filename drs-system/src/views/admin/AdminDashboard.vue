<script setup>
// ─────────────────────────────────────────────────────────────
//  Pregled cele platforme
//
//  Restorani se prate uživo. Porudžbine se prvo traže jednim
//  collection-group upitom (najjeftinije), a ako taj indeks još
//  nije napravljen u Firestore-u, sistem se sam prebacuje na
//  obilazak restorana jedan po jedan — pregled radi u oba slučaja.
// ─────────────────────────────────────────────────────────────

import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  collection,
  collectionGroup,
  getDocs,
  limit,
  orderBy,
  query,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useLiveCollection, useTicker } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Empty from '@/components/ui/Empty.vue'
import { ago, money, num, toDate } from '@/lib/format'
import { ORDER_STATUS, RESTAURANT_STATUS, MODES, CLOSED_STATUSES } from '@/lib/constants'

const { items: restaurants, loading } = useLiveCollection(
  query(collection(db, 'restaurants'), orderBy('createdAt', 'desc'))
)

const now = useTicker(30000)

const recent = ref([])
const ordersLoading = ref(true)
const indexHint = ref('')

const nameById = computed(() =>
  Object.fromEntries(restaurants.value.map((r) => [r.id, r.name || 'Bez naziva']))
)

const counts = computed(() => {
  const c = { total: 0, active: 0, blocked: 0, waiting: 0, dinein: 0, delivery: 0 }
  for (const r of restaurants.value) {
    c.total++
    if (r.status === 'active') c.active++
    else if (r.status === 'blocked') c.blocked++
    else c.waiting++
    if (r.mode === 'delivery' || r.mode === 'both') c.delivery++
    if (r.mode === 'dinein' || r.mode === 'both') c.dinein++
  }
  return c
})

const todayStats = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  const t = { orders: 0, revenue: 0, live: 0 }
  for (const o of recent.value) {
    const d = toDate(o.createdAt)
    if (!d || d < start) continue
    t.orders++
    if (o.status !== 'cancelled') t.revenue += Number(o.total) || 0
    if (!CLOSED_STATUSES.includes(o.status)) t.live++
  }
  return t
})

function normalize(snapDoc) {
  const data = snapDoc.data()
  // Putanja je restaurants/{id}/orders/{orderId} — id lokala je 2 nivoa iznad.
  const restaurantId = snapDoc.ref.parent.parent?.id || ''
  return { id: snapDoc.id, restaurantId, ...data }
}

async function loadOrders() {
  ordersLoading.value = true
  try {
    const snap = await getDocs(
      query(collectionGroup(db, 'orders'), orderBy('createdAt', 'desc'), limit(60))
    )
    recent.value = snap.docs.map(normalize)
  } catch (e) {
    // Nedostaje collection-group indeks → obilazak restorana pojedinačno.
    if (e?.code === 'failed-precondition') {
      indexHint.value =
        'Za najbrži pregled napravite indeks: firebase deploy --only firestore:indexes ' +
        '(do tada se podaci prikupljaju sporijim putem).'
    }
    try {
      const all = []
      const targets = restaurants.value.slice(0, 20)
      await Promise.all(
        targets.map(async (r) => {
          const s = await getDocs(
            query(
              collection(db, 'restaurants', r.id, 'orders'),
              orderBy('createdAt', 'desc'),
              limit(15)
            )
          )
          s.docs.forEach((d) => all.push({ id: d.id, restaurantId: r.id, ...d.data() }))
        })
      )
      all.sort((a, b) => (toDate(b.createdAt)?.getTime() || 0) - (toDate(a.createdAt)?.getTime() || 0))
      recent.value = all.slice(0, 60)
    } catch {
      recent.value = []
    }
  } finally {
    ordersLoading.value = false
  }
}

// Rezervni put (obilazak restorana pojedinačno) treba spisak restorana,
// pa se čeka da prva pretplata stigne pre nego što se krene po porudžbine.
let wait = null

onMounted(() => {
  wait = setInterval(() => {
    if (!loading.value) {
      clearInterval(wait)
      wait = null
      loadOrders()
    }
  }, 60)
})

onBeforeUnmount(() => {
  if (wait) clearInterval(wait)
})
</script>

<template>
  <div>
    <PageHead
      title="Pregled platforme"
      subtitle="Stanje svih lokala i najnovije porudžbine u sistemu."
    >
      <template #actions>
        <button class="btn btn-soft btn-sm" :class="ordersLoading && 'btn-spin'" @click="loadOrders">
          ↻ Osveži
        </button>
        <RouterLink :to="{ name: 'admin-restaurants' }" class="btn btn-primary btn-sm">
          + Novi restoran
        </RouterLink>
      </template>
    </PageHead>

    <div class="stats">
      <StatCard label="Lokala ukupno" :value="counts.total" tone="brand" :hint="`${counts.dinein} sa stolovima · ${counts.delivery} sa dostavom`" />
      <StatCard label="Aktivnih" :value="counts.active" tone="ok" icon="✅" />
      <StatCard label="Čeka aktivaciju" :value="counts.waiting" tone="warn" icon="⏳" />
      <StatCard label="Blokiranih" :value="counts.blocked" tone="bad" icon="🚫" />
      <StatCard label="Porudžbina danas" :value="num(todayStats.orders)" tone="info" icon="🧾" />
      <StatCard label="U toku sada" :value="num(todayStats.live)" tone="ok" live />
    </div>

    <p v-if="indexHint" class="note note-warn small" style="margin-top: var(--s4)">
      {{ indexHint }}
    </p>

    <div class="cols">
      <!-- ── lokali ─────────────────────────────────────── -->
      <section class="panel">
        <div class="card-head">
          <h3>Lokali</h3>
          <RouterLink :to="{ name: 'admin-restaurants' }" class="btn btn-ghost btn-sm">
            Svi →
          </RouterLink>
        </div>

        <div v-if="loading" class="p">
          <div v-for="i in 4" :key="i" class="skeleton" style="height: 52px; margin-bottom: 8px"></div>
        </div>

        <Empty
          v-else-if="!restaurants.length"
          icon="🏪"
          title="Još nema nijednog lokala"
          text="Napravite prvi nalog i pošaljite vlasniku kod za aktivaciju."
        >
          <RouterLink :to="{ name: 'admin-restaurants' }" class="btn btn-primary btn-sm">
            Napravi lokal
          </RouterLink>
        </Empty>

        <ul v-else class="list">
          <li v-for="r in restaurants.slice(0, 8)" :key="r.id">
            <RouterLink :to="{ name: 'admin-restaurant', params: { id: r.id } }" class="rest">
              <span class="rest-icon" aria-hidden="true">{{ r.logoEmoji || '🍽️' }}</span>
              <div class="grow" style="min-width: 0">
                <strong class="truncate">{{ r.name }}</strong>
                <span class="xs faint">
                  {{ MODES[r.mode]?.short || '—' }} · /r/{{ r.slug }}
                </span>
              </div>
              <span class="badge" :class="'badge-' + (RESTAURANT_STATUS[r.status]?.tone || 'muted')">
                {{ RESTAURANT_STATUS[r.status]?.label || r.status }}
              </span>
            </RouterLink>
          </li>
        </ul>
      </section>

      <!-- ── porudžbine ─────────────────────────────────── -->
      <section class="panel">
        <div class="card-head">
          <h3>Najnovije porudžbine</h3>
          <span class="xs faint">{{ recent.length }} poslednjih</span>
        </div>

        <div v-if="ordersLoading" class="p">
          <div v-for="i in 5" :key="i" class="skeleton" style="height: 44px; margin-bottom: 8px"></div>
        </div>

        <Empty
          v-else-if="!recent.length"
          icon="🧾"
          title="Nema porudžbina"
          text="Čim gosti počnu da naručuju, ovde se pojavljuju u realnom vremenu."
        />

        <ul v-else class="list">
          <li v-for="o in recent.slice(0, 10)" :key="o.restaurantId + o.id">
            <RouterLink
              :to="{ name: 'admin-restaurant', params: { id: o.restaurantId } }"
              class="ord"
            >
              <span class="ord-icon" aria-hidden="true">
                {{ o.type === 'delivery' ? '🛵' : o.type === 'takeaway' ? '🛍️' : '🍽️' }}
              </span>
              <div class="grow" style="min-width: 0">
                <strong class="truncate small">{{ nameById[o.restaurantId] || 'Lokal' }}</strong>
                <span class="xs faint">
                  {{ o.code }} · {{ ago(o.createdAt, now) }}
                </span>
              </div>
              <div class="ord-right">
                <strong class="small mono">{{ money(o.total, o.currency) }}</strong>
                <span class="badge xs" :class="'badge-' + (ORDER_STATUS[o.status]?.tone || 'muted')">
                  {{ ORDER_STATUS[o.status]?.label || o.status }}
                </span>
              </div>
            </RouterLink>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr));
  gap: var(--s3);
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(330px, 100%), 1fr));
  gap: var(--s4);
  margin-top: var(--s5);
  align-items: start;
}
.p {
  padding: var(--s4);
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
}
.list li + li {
  border-top: 1px solid var(--line);
}
.rest,
.ord {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  transition: background var(--fast);
}
.rest:hover,
.ord:hover {
  background: var(--hover);
}
.rest strong,
.ord strong {
  display: block;
  line-height: 1.25;
}
.rest-icon,
.ord-icon {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  flex: none;
}
.ord-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 3px;
  flex: none;
}
</style>
