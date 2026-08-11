<script setup>
// Detaljan uvid u jedan lokal — sve što RDS timu treba za podršku:
// stanje naloga, promet, meni i porudžbine uživo.

import { computed, ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { useLiveDoc, useLiveCollection, useTicker } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Loader from '@/components/ui/Loader.vue'
import Empty from '@/components/ui/Empty.vue'
import Modal from '@/components/ui/Modal.vue'
import Confirm from '@/components/ui/Confirm.vue'
import QrCode from '@/components/QrCode.vue'
import { toast, humanError } from '@/stores/toast'
import { ago, date, money, num, prettyPhone, toDate } from '@/lib/format'
import { guestUrl } from '@/lib/restaurant'
import { deleteRestaurant, detachOwner, setBlocked } from '@/lib/adminActions'
import {
  MODES,
  RESTAURANT_STATUS,
  ORDER_STATUS,
  CLOSED_STATUSES,
} from '@/lib/constants'

const route = useRoute()
const router = useRouter()
const id = route.params.id

const { data: rest, loading } = useLiveDoc(doc(db, 'restaurants', id))
const { items: orders } = useLiveCollection(
  query(collection(db, 'restaurants', id, 'orders'), orderBy('createdAt', 'desc'), limit(80))
)
const { items: items_ } = useLiveCollection(collection(db, 'restaurants', id, 'items'))
const { items: tables } = useLiveCollection(collection(db, 'restaurants', id, 'tables'))

const now = useTicker(30000)

const stats = computed(() => {
  const start = new Date()
  start.setHours(0, 0, 0, 0)
  let today = 0
  let todayRevenue = 0
  let revenue = 0
  let live = 0
  for (const o of orders.value) {
    const cancelled = o.status === 'cancelled'
    if (!cancelled) revenue += Number(o.total) || 0
    if (!CLOSED_STATUSES.includes(o.status)) live++
    const d = toDate(o.createdAt)
    if (d && d >= start) {
      today++
      if (!cancelled) todayRevenue += Number(o.total) || 0
    }
  }
  return { today, todayRevenue, revenue, live }
})

const blockOpen = ref(false)
const qrOpen = ref(false)
const busy = ref(false)

async function toggleBlock() {
  busy.value = true
  try {
    const wasBlocked = rest.value.status === 'blocked'
    await setBlocked(rest.value, !wasBlocked)
    toast.ok(wasBlocked ? 'Lokal je odblokiran.' : 'Lokal je blokiran.')
    blockOpen.value = false
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

// ── brisanje i odvezivanje vlasnika ──────────────────────────

const deleteOpen = ref(false)
const deleteText = ref('')
const deleteStep = ref('')

async function removeRestaurant() {
  busy.value = true
  try {
    await deleteRestaurant({ id, slug: rest.value.slug }, (s) => (deleteStep.value = s))
    toast.ok('Lokal je obrisan.')
    router.replace({ name: 'admin-restaurants' })
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
    deleteStep.value = ''
  }
}

const detachOpen = ref(false)

async function releaseOwner() {
  busy.value = true
  try {
    await detachOwner({ id })
    toast.ok('Vlasnik je odvezan. Izdajte novi kod da lokal preuzme neko drugi.')
    detachOpen.value = false
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

async function setMode(mode) {
  busy.value = true
  try {
    await updateDoc(doc(db, 'restaurants', id), { mode, updatedAt: serverTimestamp() })
    toast.ok('Namena naloga je promenjena.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

async function toggleAccepting() {
  busy.value = true
  try {
    await updateDoc(doc(db, 'restaurants', id), {
      acceptingOrders: !rest.value.acceptingOrders,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Loader v-if="loading" />

  <Empty
    v-else-if="!rest"
    icon="🚫"
    title="Lokal ne postoji"
    text="Možda je obrisan ili je adresa pogrešna."
  >
    <RouterLink :to="{ name: 'admin-restaurants' }" class="btn btn-primary btn-sm">
      Nazad na spisak
    </RouterLink>
  </Empty>

  <div v-else>
    <RouterLink :to="{ name: 'admin-restaurants' }" class="back small muted">
      ← Svi restorani
    </RouterLink>

    <PageHead :title="rest.name" :subtitle="rest.tagline || rest.address || '—'">
      <template #actions>
        <a class="btn btn-soft btn-sm" :href="guestUrl(rest.slug)" target="_blank" rel="noopener">
          ↗ Gost aplikacija
        </a>
        <button class="btn btn-soft btn-sm" @click="qrOpen = true">📱 QR kod</button>
        <button
          class="btn btn-sm"
          :class="rest.status === 'blocked' ? 'btn-ok' : 'btn-danger'"
          @click="blockOpen = true"
        >
          {{ rest.status === 'blocked' ? '🔓 Odblokiraj' : '🚫 Blokiraj' }}
        </button>
      </template>
    </PageHead>

    <div v-if="rest.status === 'blocked'" class="note note-bad" style="margin-bottom: var(--s4)">
      <div>
        <strong>Lokal je blokiran.</strong> Ne prima porudžbine, a vlasnik može samo da gleda svoj
        panel — ništa ne može da menja.
      </div>
    </div>

    <div class="stats">
      <StatCard label="Status naloga" :value="RESTAURANT_STATUS[rest.status]?.label || rest.status" :tone="RESTAURANT_STATUS[rest.status]?.tone" :hint="RESTAURANT_STATUS[rest.status]?.hint" />
      <StatCard label="U toku sada" :value="num(stats.live)" tone="ok" live />
      <StatCard label="Porudžbina danas" :value="num(stats.today)" tone="info" icon="🧾" />
      <StatCard label="Promet danas" :value="money(stats.todayRevenue, rest.currency)" tone="brand" icon="💶" />
      <StatCard label="Artikala u meniju" :value="num(items_.length)" icon="🍽️" />
      <StatCard label="Stolova" :value="num(tables.length)" icon="🪑" />
    </div>

    <div class="cols">
      <!-- ── podaci ─────────────────────────────────────── -->
      <section class="panel">
        <div class="card-head"><h3>Podaci o nalogu</h3></div>
        <dl class="dl">
          <div><dt>Web adresa</dt><dd class="mono small">/r/{{ rest.slug }}</dd></div>
          <div><dt>Namena</dt><dd>{{ MODES[rest.mode]?.label }}</dd></div>
          <div><dt>WhatsApp</dt><dd class="mono small">{{ prettyPhone(rest.whatsappNumber) || '—' }}</dd></div>
          <div><dt>Grad</dt><dd>{{ rest.city || '—' }}</dd></div>
          <div><dt>Adresa</dt><dd>{{ rest.address || '—' }}</dd></div>
          <div><dt>Vlasnik</dt><dd>{{ rest.ownerName || '—' }}</dd></div>
          <div><dt>Email vlasnika</dt><dd class="small">{{ rest.ownerEmail || '—' }}</dd></div>
          <div>
            <dt>Aktivacija</dt>
            <dd>
              <span v-if="rest.ownerUid" class="badge badge-ok">Nalog preuzet</span>
              <span v-else class="badge badge-warn">Čeka vlasnika</span>
            </dd>
          </div>
          <div><dt>Otvoren</dt><dd class="small">{{ date(rest.createdAt) }}</dd></div>
        </dl>

        <div class="card-head" style="border-top: 1px solid var(--line); border-bottom: none">
          <h4>Radnje platforme</h4>
        </div>
        <div class="acts">
          <div class="field">
            <label class="label">Namena naloga</label>
            <div class="seg" style="width: fit-content">
              <button
                v-for="(m, key) in MODES"
                :key="key"
                :class="{ on: rest.mode === key }"
                :disabled="busy"
                @click="setMode(key)"
              >
                {{ m.icon }} {{ m.short }}
              </button>
            </div>
            <span class="hint">Određuje da li lokal nudi stolove, dostavu ili oboje.</span>
          </div>

          <label class="switch">
            <input type="checkbox" :checked="rest.acceptingOrders" :disabled="busy" @change="toggleAccepting" />
            <span class="track"></span>
            <span>
              <strong class="small">Prima porudžbine</strong>
              <span class="xs faint" style="display: block">
                Kad je isključeno, gost vidi meni ali ne može da poruči.
              </span>
            </span>
          </label>
        </div>

        <!-- ── opasna zona ────────────────────────────── -->
        <div class="card-head danger-head">
          <h4>Opasna zona</h4>
        </div>
        <div class="acts">
          <div class="danger-row">
            <div class="grow">
              <strong class="small">Odveži vlasnika</strong>
              <p class="xs faint">
                Lokal ostaje sa svim podacima, ali gubi vlasnika i vraća se na „čeka aktivaciju“.
                Izdate novi kod i preuzima ga neko drugi.
              </p>
            </div>
            <button class="btn btn-soft btn-sm" :disabled="busy || !rest.ownerUid" @click="detachOpen = true">
              Odveži
            </button>
          </div>

          <div class="danger-row">
            <div class="grow">
              <strong class="small">Obriši nalog</strong>
              <p class="xs faint">
                Trajno uklanja lokal i sve što ide uz njega. Adresa /r/{{ rest.slug }} se oslobađa.
              </p>
            </div>
            <button class="btn btn-danger btn-sm" :disabled="busy" @click="((deleteOpen = true), (deleteText = ''))">
              🗑 Obriši
            </button>
          </div>
        </div>
      </section>

      <!-- ── porudžbine ─────────────────────────────────── -->
      <section class="panel">
        <div class="card-head">
          <h3>Porudžbine</h3>
          <span class="xs faint">{{ orders.length }} poslednjih</span>
        </div>

        <Empty
          v-if="!orders.length"
          icon="🧾"
          title="Nema porudžbina"
          text="Lokal još nije primio nijednu porudžbinu preko sistema."
        />

        <ul v-else class="list">
          <li v-for="o in orders.slice(0, 25)" :key="o.id" class="ord">
            <span class="ord-ico">
              {{ o.type === 'delivery' ? '🛵' : o.type === 'takeaway' ? '🛍️' : '🍽️' }}
            </span>
            <div class="grow" style="min-width: 0">
              <strong class="small">
                {{ o.code }}
                <span class="faint" style="font-weight: 400">
                  · {{ o.type === 'delivery' ? o.guest?.address || 'dostava' : 'sto ' + (o.tableLabel || '—') }}
                </span>
              </strong>
              <span class="xs faint">{{ ago(o.createdAt, now) }} · {{ o.lines?.length || 0 }} stavki</span>
            </div>
            <div style="text-align: right; flex: none">
              <strong class="small mono">{{ money(o.total, o.currency || rest.currency) }}</strong>
              <span class="badge xs" :class="'badge-' + (ORDER_STATUS[o.status]?.tone || 'muted')">
                {{ ORDER_STATUS[o.status]?.label || o.status }}
              </span>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <!-- ── QR ─────────────────────────────────────────── -->
    <Modal v-if="qrOpen" title="QR kod lokala" @close="qrOpen = false">
      <QrCode :text="guestUrl(rest.slug)" :label="rest.name" />
      <p class="hint center">
        Ovaj kod vodi na meni bez unapred izabranog stola. Kodove po stolovima vlasnik pravi
        u svom panelu, u odeljku „Raspored stolova“.
      </p>
    </Modal>

    <!-- ── brisanje ───────────────────────────────────── -->
    <Modal v-if="deleteOpen" title="Trajno obrisati lokal?" :busy="busy" @close="deleteOpen = false">
      <div class="note note-bad small">
        <div>
          Brišu se <strong>nalog, meni, stolovi, ocene, poruke i sve porudžbine</strong> lokala
          „{{ rest.name }}“. Web adresa <strong>/r/{{ rest.slug }}</strong> se oslobađa za nekog
          drugog. Ovo se ne može poništiti.
        </div>
      </div>

      <p v-if="rest.ownerEmail" class="hint">
        Nalog za prijavu ({{ rest.ownerEmail }}) ostaje u Firebase-u, ali bez lokala nema pristup
        ničemu. Obrišite ga u Authentication → Users ako želite i to.
      </p>

      <div class="field">
        <label class="label">Za potvrdu prepišite naziv lokala</label>
        <input v-model="deleteText" class="input" :placeholder="rest.name" />
      </div>

      <p v-if="deleteStep" class="small muted">{{ deleteStep }}…</p>

      <template #foot>
        <button class="btn btn-ghost" :disabled="busy" @click="deleteOpen = false">Odustani</button>
        <button
          class="btn btn-danger"
          :class="busy && 'btn-spin'"
          :disabled="busy || deleteText.trim() !== rest.name"
          @click="removeRestaurant"
        >
          Obriši zauvek
        </button>
      </template>
    </Modal>

    <Confirm
      v-if="detachOpen"
      title="Odvezati vlasnika?"
      :text="`${rest.ownerEmail || 'Vlasnik'} gubi pristup panelu, a lokal se vraća na „čeka aktivaciju“. Meni, stolovi i porudžbine ostaju netaknuti.`"
      confirm-label="Odveži vlasnika"
      danger
      :busy="busy"
      @cancel="detachOpen = false"
      @confirm="releaseOwner"
    />

    <Confirm
      v-if="blockOpen"
      :title="rest.status === 'blocked' ? 'Odblokirati lokal?' : 'Blokirati lokal?'"
      :text="
        rest.status === 'blocked'
          ? 'Lokal ponovo prima porudžbine, a vlasnik dobija pun pristup panelu.'
          : 'Lokal prestaje da prima porudžbine. Vlasnik i dalje vidi podatke, ali ne može ništa da menja.'
      "
      :confirm-label="rest.status === 'blocked' ? 'Odblokiraj' : 'Blokiraj'"
      :danger="rest.status !== 'blocked'"
      :busy="busy"
      @cancel="blockOpen = false"
      @confirm="toggleBlock"
    />
  </div>
</template>

<style scoped>
.back {
  display: inline-block;
  margin-bottom: var(--s3);
}
.back:hover {
  color: var(--ink);
}
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr));
  gap: var(--s3);
}
.cols {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(340px, 100%), 1fr));
  gap: var(--s4);
  margin-top: var(--s5);
  align-items: start;
}
.dl {
  margin: 0;
  padding: var(--s4) var(--s5);
  display: grid;
  gap: var(--s3);
}
.dl > div {
  display: flex;
  justify-content: space-between;
  gap: var(--s4);
  align-items: baseline;
}
.dl dt {
  color: var(--muted);
  font-size: var(--fs-sm);
  flex: none;
}
.dl dd {
  margin: 0;
  text-align: right;
  min-width: 0;
  overflow-wrap: anywhere;
}
.acts {
  padding: var(--s4) var(--s5);
  display: flex;
  flex-direction: column;
  gap: var(--s4);
}
.danger-head {
  border-top: 1px solid var(--line);
  border-bottom: none;
}
.danger-head h4 {
  color: var(--bad);
}
.danger-row {
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.danger-row strong {
  display: block;
}
.danger-row p {
  margin-top: 2px;
  line-height: 1.45;
  max-width: 44ch;
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  max-height: 620px;
  overflow-y: auto;
}
.list li + li {
  border-top: 1px solid var(--line);
}
.ord {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
}
.ord strong {
  display: block;
  line-height: 1.25;
}
.ord-ico {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  flex: none;
}
</style>
