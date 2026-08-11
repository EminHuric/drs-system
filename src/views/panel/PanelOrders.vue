<script setup>
// Istorija porudžbina — pretraga, filtriranje i izvoz u tabelu.

import { computed, ref } from 'vue'
import { restaurant } from '@/stores/auth'
import { usePanelData } from '@/composables/usePanelData'
import { useTicker } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import Modal from '@/components/ui/Modal.vue'
import Empty from '@/components/ui/Empty.vue'
import OrderCard from '@/components/OrderCard.vue'
import { dateTime, money, num, toDate } from '@/lib/format'
import { orderIcon, orderTitle } from '@/lib/orders'
import { ORDER_STATUS } from '@/lib/constants'
import { toast } from '@/stores/toast'

const { orders } = usePanelData()
const now = useTicker(60000)

const search = ref('')
const status = ref('all')
const period = ref('7')
const type = ref('all')

const filtered = computed(() => {
  const q = search.value.trim().toLowerCase()
  const days = Number(period.value)
  const from = days ? Date.now() - days * 86400000 : 0

  return orders.value.filter((o) => {
    if (status.value !== 'all' && o.status !== status.value) return false
    if (type.value !== 'all' && o.type !== type.value) return false

    if (from) {
      const d = toDate(o.createdAt)
      if (!d || d.getTime() < from) return false
    }

    if (q) {
      const hay = [
        o.code,
        o.tableLabel,
        o.guest?.name,
        o.guest?.phone,
        o.guest?.address,
        ...(o.lines || []).map((l) => l.name),
      ]
        .join(' ')
        .toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })
})

const totals = computed(() => {
  let revenue = 0
  let cancelled = 0
  for (const o of filtered.value) {
    if (o.status === 'cancelled') cancelled++
    else revenue += Number(o.total) || 0
  }
  const paid = filtered.value.length - cancelled
  return {
    count: filtered.value.length,
    revenue,
    cancelled,
    avg: paid ? revenue / paid : 0,
  }
})

const detail = ref(null)

function exportCsv() {
  if (!filtered.value.length) return toast.info('Nema porudžbina za izvoz.')

  const rows = [
    ['Broj', 'Datum', 'Tip', 'Sto/Adresa', 'Gost', 'Telefon', 'Artikli', 'Dostava', 'Ukupno', 'Status'],
  ]

  for (const o of filtered.value) {
    rows.push([
      o.code,
      dateTime(o.createdAt),
      o.type === 'delivery' ? 'Dostava' : o.type === 'takeaway' ? 'Za poneti' : 'Lokal',
      o.type === 'delivery' ? o.guest?.address || '' : o.tableLabel || '',
      o.guest?.name || '',
      o.guest?.phone ? `+${o.guest.phone}` : '',
      (o.lines || []).map((l) => `${l.qty}x ${l.name}`).join('; '),
      String(o.deliveryFee || 0).replace('.', ','),
      String(o.total || 0).replace('.', ','),
      ORDER_STATUS[o.status]?.label || o.status,
    ])
  }

  // Tačka-zarez i BOM: tako Excel na našim podešavanjima otvara
  // fajl u kolonama, sa ispravnim č/ć/š/ž.
  const csv =
    '﻿' +
    rows
      .map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';'))
      .join('\r\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `porudzbine-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(a.href)
  toast.ok('Tabela je preuzeta.')
}
</script>

<template>
  <div>
    <PageHead title="Istorija porudžbina" subtitle="Poslednjih 150 porudžbina vašeg lokala.">
      <template #actions>
        <button class="btn btn-soft btn-sm" @click="exportCsv">⬇ Izvoz u Excel (CSV)</button>
      </template>
    </PageHead>

    <div class="sums">
      <div class="sum">
        <span class="up muted">Porudžbina</span>
        <strong>{{ num(totals.count) }}</strong>
      </div>
      <div class="sum">
        <span class="up muted">Promet</span>
        <strong>{{ money(totals.revenue, restaurant?.currency) }}</strong>
      </div>
      <div class="sum">
        <span class="up muted">Prosečna korpa</span>
        <strong>{{ money(totals.avg, restaurant?.currency) }}</strong>
      </div>
      <div class="sum">
        <span class="up muted">Otkazano</span>
        <strong>{{ num(totals.cancelled) }}</strong>
      </div>
    </div>

    <div class="bar">
      <input v-model="search" class="input grow" placeholder="Broj porudžbine, gost, jelo, adresa…" />

      <select v-model="period" class="select" style="max-width: 150px">
        <option value="1">Danas</option>
        <option value="7">7 dana</option>
        <option value="30">30 dana</option>
        <option value="0">Sve</option>
      </select>

      <select v-model="type" class="select" style="max-width: 150px">
        <option value="all">Svi tipovi</option>
        <option value="dinein">🍽️ Lokal</option>
        <option value="delivery">🛵 Dostava</option>
        <option value="takeaway">🛍️ Za poneti</option>
      </select>

      <select v-model="status" class="select" style="max-width: 170px">
        <option value="all">Svi statusi</option>
        <option v-for="(s, key) in ORDER_STATUS" :key="key" :value="key">{{ s.label }}</option>
      </select>
    </div>

    <div class="panel">
      <Empty
        v-if="!filtered.length"
        icon="📜"
        :title="orders.length ? 'Nema rezultata' : 'Još nema porudžbina'"
        :text="orders.length ? 'Promenite filtere ili period.' : 'Prva porudžbina pojaviće se ovde.'"
      />

      <div v-else class="table-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Broj</th>
              <th>Vreme</th>
              <th>Odakle</th>
              <th>Gost</th>
              <th>Stavke</th>
              <th class="td-right">Iznos</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="o in filtered" :key="o.id" style="cursor: pointer" @click="detail = o">
              <td class="mono bold nowrap">{{ o.code }}</td>
              <td class="small faint nowrap">{{ dateTime(o.createdAt) }}</td>
              <td>
                <span class="nowrap">{{ orderIcon(o) }} {{ orderTitle(o) }}</span>
              </td>
              <td class="small">
                {{ o.guest?.name || '—' }}
                <span v-if="o.guest?.phone" class="xs faint" style="display: block">
                  +{{ o.guest.phone }}
                </span>
              </td>
              <td class="small faint">{{ o.lines?.length || 0 }}</td>
              <td class="td-right mono bold nowrap">{{ money(o.total, o.currency) }}</td>
              <td>
                <span class="badge" :class="'badge-' + (ORDER_STATUS[o.status]?.tone || 'muted')">
                  {{ ORDER_STATUS[o.status]?.label }}
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Modal v-if="detail" :title="`Porudžbina #${detail.code}`" @close="detail = null">
      <OrderCard :order="detail" :restaurant="restaurant" :now="now" @chat="detail = null" />
      <p class="hint">Otvoreno: {{ dateTime(detail.createdAt) }}</p>
    </Modal>
  </div>
</template>

<style scoped>
.sums {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: var(--s3);
  margin-bottom: var(--s4);
}
.sum {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: var(--s3) var(--s4);
  border-radius: var(--r);
  background: var(--surface);
  border: 1px solid var(--line);
}
.sum strong {
  font-size: var(--fs-lg);
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.02em;
}
.bar {
  display: flex;
  gap: var(--s2);
  flex-wrap: wrap;
  margin-bottom: var(--s4);
}
.bar .input {
  min-width: 220px;
}
</style>
