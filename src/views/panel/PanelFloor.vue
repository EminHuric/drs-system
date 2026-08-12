<script setup>
// ─────────────────────────────────────────────────────────────
//  Raspored stolova
//
//  Vlasnik nacrta svoj lokal onako kako stvarno izgleda, po
//  prostorima (sala, bašta, sprat). Gost onda na istoj toj skici
//  dodirne sto za kojim sedi — i porudžbina stiže sa tačnim brojem.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { restaurant, isBlocked } from '@/stores/auth'
import { usePanelData } from '@/composables/usePanelData'
import PageHead from '@/components/ui/PageHead.vue'
import FloorPlan from '@/components/FloorPlan.vue'
import Modal from '@/components/ui/Modal.vue'
import Confirm from '@/components/ui/Confirm.vue'
import QrCode from '@/components/QrCode.vue'
import { toast, humanError } from '@/stores/toast'
import { guestUrl } from '@/lib/restaurant'
import { LIVE_STATUSES } from '@/lib/constants'

const { tables, liveOrders } = usePanelData()

const rid = computed(() => restaurant.value?.id)
const locked = computed(() => isBlocked.value)

const zones = computed(() =>
  restaurant.value?.floorZones?.length ? restaurant.value.floorZones : [{ id: 'sala', name: 'Sala' }]
)
const zoneId = ref('')

const currentZone = computed(
  () => zones.value.find((z) => z.id === zoneId.value) || zones.value[0]
)

// Zauzeti stolovi — da vlasnik na skici odmah vidi gde se nešto dešava.
const occupied = computed(() => {
  const m = {}
  for (const o of liveOrders.value) {
    if (o.tableId && LIVE_STATUSES.includes(o.status)) m[o.tableId] = true
  }
  return m
})

const zoneTables = computed(() =>
  tables.value.filter((t) => (t.zoneId || 'sala') === (currentZone.value?.id || 'sala'))
)

const selectedId = ref('')
const selected = computed(() => tables.value.find((t) => t.id === selectedId.value) || null)

// ── stolovi ──────────────────────────────────────────────────

async function addTable(at = null) {
  if (locked.value) return
  try {
    // Sledeći slobodan broj — vlasnik retko želi rupe u numeraciji.
    const used = new Set(tables.value.map((t) => Number(t.label)).filter((n) => !Number.isNaN(n)))
    let n = 1
    while (used.has(n)) n++

    const ref_ = await addDoc(collection(db, 'restaurants', rid.value, 'tables'), {
      label: String(n),
      zoneId: currentZone.value?.id || 'sala',
      shape: 'rect',
      seats: 4,
      x: at?.x ?? 40,
      y: at?.y ?? 44,
      w: 12,
      h: 12,
      sort: tables.value.length,
      active: true,
      createdAt: serverTimestamp(),
    })
    selectedId.value = ref_.id
  } catch (e) {
    toast.error(humanError(e))
  }
}

async function moveTable(patch) {
  if (locked.value) return
  try {
    const { id, ...rest } = patch
    await updateDoc(doc(db, 'restaurants', rid.value, 'tables', id), rest)
  } catch (e) {
    toast.error(humanError(e))
  }
}

async function patchSelected(patch) {
  if (!selected.value || locked.value) return
  try {
    await updateDoc(doc(db, 'restaurants', rid.value, 'tables', selected.value.id), patch)
  } catch (e) {
    toast.error(humanError(e))
  }
}

const tableDelete = ref(null)
const delBusy = ref(false)

async function removeTable() {
  delBusy.value = true
  try {
    await deleteDoc(doc(db, 'restaurants', rid.value, 'tables', tableDelete.value.id))
    if (selectedId.value === tableDelete.value.id) selectedId.value = ''
    tableDelete.value = null
    toast.ok('Sto je obrisan.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    delBusy.value = false
  }
}

/** Uredna mreža — koristi se kad se raspored "zapetlja". */
async function autoArrange() {
  if (locked.value) return
  const list = zoneTables.value
  if (!list.length) return
  try {
    const cols = Math.ceil(Math.sqrt(list.length))
    const rows = Math.ceil(list.length / cols)
    const w = Math.min(16, 76 / cols)
    const h = Math.min(16, 76 / rows)
    const batch = writeBatch(db)
    list.forEach((t, i) => {
      const c = i % cols
      const r = Math.floor(i / cols)
      batch.update(doc(db, 'restaurants', rid.value, 'tables', t.id), {
        x: Math.round((8 + c * (84 / cols)) * 10) / 10,
        y: Math.round((8 + r * (84 / rows)) * 10) / 10,
        w,
        h,
      })
    })
    await batch.commit()
    toast.ok('Stolovi su poređani u mrežu.')
  } catch (e) {
    toast.error(humanError(e))
  }
}

// ── prostori ─────────────────────────────────────────────────

const zoneModal = ref(false)
const zoneName = ref('')
const zoneBusy = ref(false)

async function addZone() {
  const name = zoneName.value.trim()
  if (!name) return toast.error('Unesite naziv prostora.')
  zoneBusy.value = true
  try {
    const id = 'z' + Date.now().toString(36)
    await updateDoc(doc(db, 'restaurants', rid.value), {
      floorZones: [...zones.value, { id, name }],
      updatedAt: serverTimestamp(),
    })
    zoneId.value = id
    zoneName.value = ''
    zoneModal.value = false
    toast.ok('Prostor je dodat.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    zoneBusy.value = false
  }
}

const zoneDelete = ref(null)

async function removeZone() {
  const z = zoneDelete.value
  zoneBusy.value = true
  try {
    const inside = tables.value.filter((t) => (t.zoneId || 'sala') === z.id)
    if (inside.length) {
      const batch = writeBatch(db)
      inside.forEach((t) =>
        batch.delete(doc(db, 'restaurants', rid.value, 'tables', t.id))
      )
      await batch.commit()
    }
    await updateDoc(doc(db, 'restaurants', rid.value), {
      floorZones: zones.value.filter((x) => x.id !== z.id),
      updatedAt: serverTimestamp(),
    })
    zoneId.value = ''
    zoneDelete.value = null
    toast.ok('Prostor je obrisan.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    zoneBusy.value = false
  }
}

// ── QR kodovi ────────────────────────────────────────────────

const qrTable = ref(null)
const qrAll = ref(false)

const printableTables = computed(() => zoneTables.value.slice().sort(byLabel))

function byLabel(a, b) {
  const na = Number(a.label)
  const nb = Number(b.label)
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
  return String(a.label).localeCompare(String(b.label), 'sr')
}
</script>

<template>
  <div>
    <PageHead
      title="Raspored stolova"
      subtitle="Nacrtajte svoj lokal. Gost dodiruje sto na ovoj istoj skici."
    >
      <template #actions>
        <button class="btn btn-soft btn-sm" :disabled="locked || !zoneTables.length" @click="autoArrange">
          ▦ Poređaj u mrežu
        </button>
        <button class="btn btn-soft btn-sm" :disabled="!zoneTables.length" @click="qrAll = true">
          📱 QR kodovi
        </button>
        <button class="btn btn-primary btn-sm" :disabled="locked" @click="addTable()">+ Sto</button>
      </template>
    </PageHead>

    <div v-if="locked" class="note note-bad" style="margin-bottom: var(--s4)">
      <div><strong>Nalog je blokiran</strong> — raspored možete da gledate, ali ne i da menjate.</div>
    </div>

    <!-- ── prostori ────────────────────────────────────── -->
    <div class="bar">
      <div class="seg">
        <button
          v-for="z in zones"
          :key="z.id"
          :class="{ on: (currentZone?.id || '') === z.id }"
          @click="((zoneId = z.id), (selectedId = ''))"
        >
          {{ z.name }}
          <span class="faint">
            {{ tables.filter((t) => (t.zoneId || 'sala') === z.id).length }}
          </span>
        </button>
      </div>
      <button class="btn btn-ghost btn-sm" :disabled="locked" @click="zoneModal = true">
        + Prostor
      </button>
      <button
        v-if="zones.length > 1"
        class="btn btn-ghost btn-sm"
        :disabled="locked"
        title="Obriši ovaj prostor"
        @click="zoneDelete = currentZone"
      >
        🗑
      </button>
      <div class="spacer"></div>
      <span class="xs faint">{{ zoneTables.length }} stolova u prostoru „{{ currentZone?.name }}“</span>
    </div>

    <div class="layout">
      <!-- ── platno ─────────────────────────────────────── -->
      <div class="panel" style="padding: var(--s4)">
        <FloorPlan
          :tables="tables"
          :zone-id="currentZone?.id || 'sala'"
          :editable="!locked"
          :selected-id="selectedId"
          :occupied="occupied"
          :brand-color="restaurant?.brandColor"
          @select="selectedId = $event.id"
          @move="moveTable"
          @add="addTable"
        />
      </div>

      <!-- ── izabrani sto ───────────────────────────────── -->
      <aside class="panel side">
        <div class="card-head">
          <h4>{{ selected ? `Sto ${selected.label}` : 'Izabrani sto' }}</h4>
        </div>

        <div v-if="!selected" class="pick">
          <span aria-hidden="true">🪑</span>
          <p class="small muted">
            Kliknite na sto da mu promenite broj, oblik i broj mesta — ili na prazan deo platna da
            dodate novi.
          </p>
        </div>

        <div v-else class="col" style="padding: var(--s4); gap: var(--s4)">
          <div class="field">
            <label class="label">Oznaka stola</label>
            <input
              class="input"
              :value="selected.label"
              :disabled="locked"
              maxlength="6"
              @change="patchSelected({ label: $event.target.value.trim() || selected.label })"
            />
            <span class="hint">Broj ili naziv — npr. „12“ ili „Bašta 3“.</span>
          </div>

          <div class="two">
            <div class="field">
              <label class="label">Broj mesta</label>
              <input
                class="input"
                type="number"
                min="0"
                max="30"
                :value="selected.seats"
                :disabled="locked"
                @change="patchSelected({ seats: Number($event.target.value) || 0 })"
              />
            </div>

            <div class="field">
              <label class="label">Oblik</label>
              <div class="seg" style="width: 100%">
                <button
                  class="grow"
                  :class="{ on: selected.shape !== 'circle' }"
                  :disabled="locked"
                  @click="patchSelected({ shape: 'rect' })"
                >
                  ▭
                </button>
                <button
                  class="grow"
                  :class="{ on: selected.shape === 'circle' }"
                  :disabled="locked"
                  @click="patchSelected({ shape: 'circle' })"
                >
                  ◯
                </button>
              </div>
            </div>
          </div>

          <div class="field">
            <label class="label">Prostor</label>
            <select
              class="select"
              :value="selected.zoneId || 'sala'"
              :disabled="locked"
              @change="patchSelected({ zoneId: $event.target.value })"
            >
              <option v-for="z in zones" :key="z.id" :value="z.id">{{ z.name }}</option>
            </select>
          </div>

          <label class="switch">
            <input
              type="checkbox"
              :checked="selected.active !== false"
              :disabled="locked"
              @change="patchSelected({ active: $event.target.checked })"
            />
            <span class="track"></span>
            <span class="small">Sto je u upotrebi</span>
          </label>

          <div v-if="occupied[selected.id]" class="note note-warn xs">
            Za ovim stolom je porudžbina u toku.
          </div>

          <div class="wrap-row">
            <button class="btn btn-soft btn-sm grow" @click="qrTable = selected">📱 QR kod</button>
            <button class="btn btn-danger btn-sm" :disabled="locked" @click="tableDelete = selected">
              🗑 Obriši
            </button>
          </div>
        </div>
      </aside>
    </div>

    <!-- ── novi prostor ────────────────────────────────── -->
    <Modal v-if="zoneModal" title="Novi prostor" :busy="zoneBusy" @close="zoneModal = false">
      <div class="field">
        <label class="label">Naziv prostora</label>
        <input v-model="zoneName" class="input" placeholder="Bašta" @keyup.enter="addZone" />
        <span class="hint">Npr. Sala, Bašta, Sprat, Terasa. Svaki prostor ima svoju skicu.</span>
      </div>

      <template #foot>
        <button class="btn btn-ghost" @click="zoneModal = false">Odustani</button>
        <button class="btn btn-primary" :class="zoneBusy && 'btn-spin'" :disabled="zoneBusy" @click="addZone">
          Dodaj
        </button>
      </template>
    </Modal>

    <Confirm
      v-if="zoneDelete"
      title="Obrisati prostor?"
      :text="`Brišu se prostor „${zoneDelete.name}“ i svi stolovi u njemu.`"
      confirm-label="Obriši"
      danger
      :busy="zoneBusy"
      @cancel="zoneDelete = null"
      @confirm="removeZone"
    />

    <Confirm
      v-if="tableDelete"
      title="Obrisati sto?"
      :text="`Sto ${tableDelete.label} nestaje sa skice. QR kodovi odštampani za taj sto prestaju da rade.`"
      confirm-label="Obriši"
      danger
      :busy="delBusy"
      @cancel="tableDelete = null"
      @confirm="removeTable"
    />

    <!-- ── QR jednog stola ─────────────────────────────── -->
    <Modal v-if="qrTable" :title="`QR kod · sto ${qrTable.label}`" @close="qrTable = null">
      <QrCode
        :text="guestUrl(restaurant.slug, qrTable.label, restaurant.id)"
        :label="`${restaurant.name} · Sto ${qrTable.label}`"
      />
      <p class="hint center">
        Gost skenira ovaj kod i sto se sam popunjava — ne mora ništa da bira.
      </p>
    </Modal>

    <!-- ── QR za sve stolove ───────────────────────────── -->
    <Modal v-if="qrAll" title="QR kodovi za stolove" wide @close="qrAll = false">
      <p class="note note-info small">
        Svaki sto ima svoj kod. Odštampajte ih, plastificirajte i stavite na stolove — gost skenira
        i odmah gleda vaš meni, sa već izabranim stolom.
      </p>

      <div class="qr-grid">
        <div v-for="t in printableTables" :key="t.id" class="qr-item">
          <QrCode
            :text="guestUrl(restaurant.slug, t.label, restaurant.id)"
            :size="150"
            :label="`Sto ${t.label}`"
          />
        </div>
      </div>
    </Modal>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  align-items: center;
  gap: var(--s2);
  margin-bottom: var(--s4);
  flex-wrap: wrap;
}

.layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 300px;
  gap: var(--s4);
  align-items: start;
}
@media (max-width: 1000px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.side {
  position: sticky;
  top: calc(var(--header-h) + var(--s4));
}
.pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s6) var(--s4);
  text-align: center;
}
.pick span {
  font-size: 2rem;
  opacity: 0.5;
}
.pick p {
  max-width: 30ch;
}

.two {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s3);
}

.qr-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(190px, 100%), 1fr));
  gap: var(--s4);
}
.qr-item {
  padding: var(--s3);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
}
</style>
