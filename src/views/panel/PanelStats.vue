<script setup>
// ─────────────────────────────────────────────────────────────
//  Izveštaji
//
//  Svi prikazi su jednoserijski i identitet nose natpisi, ne boja —
//  zato rade i za daltoniste, i u crno-beloj štampi. Podaci su iz
//  poslednjih 150 porudžbina koje panel ionako već drži uživo, pa
//  ovaj ekran ne troši nijedno dodatno čitanje baze.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { restaurant } from '@/stores/auth'
import { usePanelData } from '@/composables/usePanelData'
import PageHead from '@/components/ui/PageHead.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Empty from '@/components/ui/Empty.vue'
import { money, num, toDate } from '@/lib/format'

const { orders, items } = usePanelData()

const days = ref(14)
const cur = computed(() => restaurant?.value?.currency || '€')

const paid = computed(() =>
  orders.value.filter((o) => o.status !== 'cancelled')
)

const inRange = computed(() => {
  const from = Date.now() - days.value * 86400000
  return paid.value.filter((o) => {
    const d = toDate(o.createdAt)
    return d && d.getTime() >= from
  })
})

const summary = computed(() => {
  const list = inRange.value
  const revenue = list.reduce((s, o) => s + (Number(o.total) || 0), 0)
  const cancelled = orders.value.filter((o) => {
    const d = toDate(o.createdAt)
    return o.status === 'cancelled' && d && d.getTime() >= Date.now() - days.value * 86400000
  }).length
  return {
    revenue,
    count: list.length,
    avg: list.length ? revenue / list.length : 0,
    cancelled,
  }
})

// ── promet po danima ─────────────────────────────────────────

const byDay = computed(() => {
  const buckets = []
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  for (let i = days.value - 1; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(d.getDate() - i)
    buckets.push({ date: d, revenue: 0, count: 0 })
  }

  const index = new Map(buckets.map((b, i) => [b.date.toDateString(), i]))
  for (const o of inRange.value) {
    const d = toDate(o.createdAt)
    if (!d) continue
    const key = new Date(d.getFullYear(), d.getMonth(), d.getDate()).toDateString()
    const i = index.get(key)
    if (i === undefined) continue
    buckets[i].revenue += Number(o.total) || 0
    buckets[i].count++
  }
  return buckets
})

const maxDay = computed(() => Math.max(1, ...byDay.value.map((b) => b.revenue)))
const peakIndex = computed(() => byDay.value.findIndex((b) => b.revenue === maxDay.value))

const DAY_SHORT = ['ned', 'pon', 'uto', 'sre', 'čet', 'pet', 'sub']

function dayLabel(d) {
  return `${DAY_SHORT[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`
}

// ── najprodavaniji artikli ───────────────────────────────────

const topItems = computed(() => {
  const map = new Map()
  for (const o of inRange.value) {
    for (const l of o.lines || []) {
      const key = l.itemId || l.name
      const e = map.get(key) || { name: l.name, qty: 0, revenue: 0 }
      e.qty += l.qty
      e.revenue += l.price * l.qty
      map.set(key, e)
    }
  }
  return [...map.values()].sort((a, b) => b.qty - a.qty).slice(0, 8)
})

const maxQty = computed(() => Math.max(1, ...topItems.value.map((i) => i.qty)))

// ── odakle porudžbine ────────────────────────────────────────

const byType = computed(() => {
  const t = { dinein: 0, delivery: 0, takeaway: 0 }
  for (const o of inRange.value) if (t[o.type] !== undefined) t[o.type]++
  const total = inRange.value.length || 1
  return [
    { key: 'dinein', label: '🍽️ U lokalu', count: t.dinein, pct: (t.dinein / total) * 100 },
    { key: 'delivery', label: '🛵 Dostava', count: t.delivery, pct: (t.delivery / total) * 100 },
    { key: 'takeaway', label: '🛍️ Za poneti', count: t.takeaway, pct: (t.takeaway / total) * 100 },
  ].filter((x) => x.count > 0)
})

// ── najprometniji sati ───────────────────────────────────────

const byHour = computed(() => {
  const h = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }))
  for (const o of inRange.value) {
    const d = toDate(o.createdAt)
    if (d) h[d.getHours()].count++
  }
  // Lokali retko rade u 4 ujutru — sečemo prazan početak i kraj dana.
  const first = h.findIndex((x) => x.count > 0)
  const last = h.length - 1 - [...h].reverse().findIndex((x) => x.count > 0)
  return first === -1 ? [] : h.slice(Math.max(0, first - 1), Math.min(24, last + 2))
})

const maxHour = computed(() => Math.max(1, ...byHour.value.map((x) => x.count)))

// ── neaktivni artikli ────────────────────────────────────────

const neverOrdered = computed(() => {
  const sold = new Set()
  for (const o of paid.value) for (const l of o.lines || []) sold.add(l.itemId)
  return items.value.filter((i) => i.active !== false && !sold.has(i.id))
})
</script>

<template>
  <div>
    <PageHead title="Izveštaji" subtitle="Kako lokal posluje — promet, hitovi i najjači sati.">
      <template #actions>
        <div class="seg">
          <button :class="{ on: days === 7 }" @click="days = 7">7 dana</button>
          <button :class="{ on: days === 14 }" @click="days = 14">14 dana</button>
          <button :class="{ on: days === 30 }" @click="days = 30">30 dana</button>
        </div>
      </template>
    </PageHead>

    <div class="stats">
      <StatCard label="Promet" :value="money(summary.revenue, cur)" tone="brand" :hint="`poslednjih ${days} dana`" />
      <StatCard label="Porudžbina" :value="num(summary.count)" tone="info" icon="🧾" />
      <StatCard label="Prosečna korpa" :value="money(summary.avg, cur)" tone="ok" icon="🛒" />
      <StatCard label="Otkazano" :value="num(summary.cancelled)" :tone="summary.cancelled ? 'warn' : ''" icon="✖️" />
    </div>

    <Empty
      v-if="!inRange.length"
      icon="📈"
      title="Nema podataka za ovaj period"
      text="Izveštaji se popunjavaju sami, čim krenu porudžbine."
      class="panel"
      style="margin-top: var(--s5)"
    />

    <template v-else>
      <!-- ── promet po danima ──────────────────────────── -->
      <section class="panel chart-card">
        <div class="card-head">
          <h3>Promet po danima</h3>
          <span class="xs faint">najviši dan: {{ money(maxDay, cur) }}</span>
        </div>

        <div class="chart">
          <div class="bars" role="img" :aria-label="`Promet po danima, poslednjih ${days} dana`">
            <div v-for="(b, i) in byDay" :key="i" class="bar-col">
              <span v-if="i === peakIndex && b.revenue > 0" class="bar-value xs">
                {{ money(b.revenue, cur) }}
              </span>
              <div class="bar-track">
                <div
                  class="bar-fill"
                  :style="{ height: (b.revenue / maxDay) * 100 + '%' }"
                  :title="`${dayLabel(b.date)} — ${money(b.revenue, cur)}, ${b.count} porudžbina`"
                ></div>
              </div>
              <span class="bar-label xs">{{ b.date.getDate() }}</span>
            </div>
          </div>
        </div>

        <details class="tbl-toggle">
          <summary class="small muted">Prikaži kao tabelu</summary>
          <div class="table-scroll">
            <table class="tbl">
              <thead>
                <tr><th>Dan</th><th class="td-right">Porudžbina</th><th class="td-right">Promet</th></tr>
              </thead>
              <tbody>
                <tr v-for="(b, i) in byDay" :key="i">
                  <td>{{ dayLabel(b.date) }}</td>
                  <td class="td-right mono">{{ b.count }}</td>
                  <td class="td-right mono">{{ money(b.revenue, cur) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
      </section>

      <div class="two">
        <!-- ── hitovi ──────────────────────────────────── -->
        <section class="panel">
          <div class="card-head">
            <h3>Najprodavanije</h3>
            <span class="xs faint">po broju komada</span>
          </div>

          <Empty v-if="!topItems.length" icon="🍽️" title="Još nema prodaje" />

          <ul v-else class="ranked">
            <li v-for="(it, i) in topItems" :key="it.name">
              <div class="row-between">
                <span class="small truncate"><strong class="rank">{{ i + 1 }}.</strong> {{ it.name }}</span>
                <span class="small mono nowrap">{{ it.qty }}× · {{ money(it.revenue, cur) }}</span>
              </div>
              <div class="hbar-track">
                <div class="hbar-fill" :style="{ width: (it.qty / maxQty) * 100 + '%' }"></div>
              </div>
            </li>
          </ul>

          <p class="hint" style="padding: 0 var(--s4) var(--s4)">
            Ono što je na vrhu zaslužuje bedž „Hit“ u meniju — gosti to najbrže primete.
          </p>
        </section>

        <!-- ── odakle i kada ───────────────────────────── -->
        <section class="panel">
          <div class="card-head"><h3>Odakle stižu porudžbine</h3></div>

          <ul class="ranked">
            <li v-for="t in byType" :key="t.key">
              <div class="row-between">
                <span class="small">{{ t.label }}</span>
                <span class="small mono nowrap">{{ t.count }} · {{ Math.round(t.pct) }}%</span>
              </div>
              <div class="hbar-track">
                <div class="hbar-fill" :style="{ width: t.pct + '%' }"></div>
              </div>
            </li>
          </ul>

          <div class="card-head" style="border-top: 1px solid var(--line)">
            <h4>Najjači sati</h4>
          </div>

          <div class="hours">
            <div v-for="h in byHour" :key="h.hour" class="bar-col">
              <div class="bar-track" style="height: 76px">
                <div
                  class="bar-fill"
                  :style="{ height: (h.count / maxHour) * 100 + '%' }"
                  :title="`${h.hour}:00 — ${h.count} porudžbina`"
                ></div>
              </div>
              <span class="bar-label xs">{{ h.hour }}</span>
            </div>
          </div>
        </section>
      </div>

      <!-- ── nikad naručeno ────────────────────────────── -->
      <section v-if="neverOrdered.length" class="panel" style="margin-top: var(--s4)">
        <div class="card-head">
          <h3>Nijednom naručeno</h3>
          <span class="badge badge-warn">{{ neverOrdered.length }}</span>
        </div>
        <p class="small muted" style="padding: 0 var(--s5) var(--s3)">
          Ovi artikli su u ponudi, ali ih niko nije naručio u posmatranom periodu. Razmislite o
          drugoj ceni, boljem opisu ili slici — ili ih privremeno sklonite.
        </p>
        <div class="chips-pad">
          <span v-for="i in neverOrdered.slice(0, 30)" :key="i.id" class="badge">
            {{ i.emoji }} {{ i.name }}
          </span>
        </div>
      </section>
    </template>
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr));
  gap: var(--s3);
}
.two {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(320px, 100%), 1fr));
  gap: var(--s4);
  margin-top: var(--s4);
  align-items: start;
}
.chart-card {
  margin-top: var(--s5);
}
.chart {
  padding: var(--s5) var(--s4) var(--s3);
}

/* Stubići: tanke marke, zaobljen vrh, 2px razmak površine između njih. */
.bars {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  height: 190px;
}
.bar-col {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  gap: 5px;
  height: 100%;
}
.bar-track {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: flex-end;
  /* Nenametljiva podloga umesto mreže linija preko podataka. */
  background: var(--surface-2);
  border-radius: 4px 4px 2px 2px;
  overflow: hidden;
}
.bar-fill {
  width: 100%;
  min-height: 2px;
  background: var(--brand);
  border-radius: 4px 4px 0 0;
  transition: height var(--slow);
}
.bar-fill:hover {
  background: var(--brand-soft);
}
.bar-label {
  color: var(--faint);
  font-variant-numeric: tabular-nums;
}
.bar-value {
  color: var(--ink-2);
  font-weight: 650;
  white-space: nowrap;
}

.hours {
  display: flex;
  align-items: flex-end;
  gap: 2px;
  padding: var(--s4);
}

/* Vodoravne rang-trake */
.ranked {
  list-style: none;
  margin: 0;
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}
.rank {
  color: var(--faint);
  font-variant-numeric: tabular-nums;
  margin-right: 2px;
}
.hbar-track {
  height: 7px;
  border-radius: var(--r-full);
  background: var(--surface-2);
  margin-top: 5px;
  overflow: hidden;
}
.hbar-fill {
  height: 100%;
  background: var(--brand);
  border-radius: var(--r-full);
  transition: width var(--slow);
}

.tbl-toggle {
  border-top: 1px solid var(--line);
}
.tbl-toggle summary {
  padding: var(--s3) var(--s5);
  cursor: pointer;
  user-select: none;
}
.tbl-toggle summary:hover {
  color: var(--ink);
}

.chips-pad {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding: 0 var(--s5) var(--s5);
}
</style>
