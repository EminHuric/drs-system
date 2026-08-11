<script setup>
// ─────────────────────────────────────────────────────────────
//  Meni lokala — kategorije i artikli
//
//  Vlasnik ovde vlada svime: dodaje jela i pića, menja cene,
//  redosled, bedževe i dostupnost. Redosled se čuva kao broj u
//  polju `sort`, isti taj redosled gost vidi u meniju.
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
import Modal from '@/components/ui/Modal.vue'
import Confirm from '@/components/ui/Confirm.vue'
import Empty from '@/components/ui/Empty.vue'
import { toast, humanError } from '@/stores/toast'
import { money } from '@/lib/format'
import { BADGES, ALLERGENS } from '@/lib/constants'
import ImagePicker from '@/components/ImagePicker.vue'
import { byItem, fmtRating } from '@/lib/reviews'

const { categories, items, orders, reviews } = usePanelData()

// Prosečna ocena po jelu, iz utisaka gostiju.
const scores = computed(() => byItem(reviews.value))

// Koliko je puta artikal naručen brojimo iz porudžbina, a ne iz polja
// na artiklu: gost po pravilima ne sme da piše po meniju, pa bi takav
// brojač zauvek ostao na nuli. Ovako je uvek tačan i ne košta nijedan
// dodatni upis.
const soldCount = computed(() => {
  const m = {}
  for (const o of orders.value) {
    if (o.status === 'cancelled') continue
    for (const l of o.lines || []) {
      if (!l.itemId || l.itemId === 'call') continue
      m[l.itemId] = (m[l.itemId] || 0) + l.qty
    }
  }
  return m
})

const rid = computed(() => restaurant.value?.id)
const cur = computed(() => restaurant.value?.currency || '€')
const locked = computed(() => isBlocked.value)

const activeCat = ref('all')
const search = ref('')

const byCategory = computed(() => {
  const map = {}
  for (const c of categories.value) map[c.id] = []
  const loose = []
  for (const i of items.value) {
    if (map[i.categoryId]) map[i.categoryId].push(i)
    else loose.push(i)
  }
  return { map, loose }
})

const shownItems = computed(() => {
  const q = search.value.trim().toLowerCase()
  let list = items.value
  if (activeCat.value !== 'all') list = list.filter((i) => i.categoryId === activeCat.value)
  if (q) list = list.filter((i) => `${i.name} ${i.desc}`.toLowerCase().includes(q))
  return list
})

const stats = computed(() => ({
  cats: categories.value.length,
  total: items.value.length,
  off: items.value.filter((i) => !i.active).length,
}))

// ═══ kategorije ═══════════════════════════════════════════════

const catModal = ref(null)
const catForm = ref({ name: '', emoji: '🍽️' })
const catBusy = ref(false)

function openCat(c = null) {
  catModal.value = c || { id: null }
  catForm.value = { name: c?.name || '', emoji: c?.emoji || '🍽️' }
}

async function saveCat() {
  if (!catForm.value.name.trim()) return toast.error('Unesite naziv kategorije.')
  catBusy.value = true
  try {
    if (catModal.value.id) {
      await updateDoc(doc(db, 'restaurants', rid.value, 'categories', catModal.value.id), {
        name: catForm.value.name.trim(),
        emoji: catForm.value.emoji,
        updatedAt: serverTimestamp(),
      })
    } else {
      await addDoc(collection(db, 'restaurants', rid.value, 'categories'), {
        name: catForm.value.name.trim(),
        emoji: catForm.value.emoji,
        sort: categories.value.length,
        active: true,
        createdAt: serverTimestamp(),
      })
    }
    catModal.value = null
    toast.ok('Sačuvano.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    catBusy.value = false
  }
}

const catDelete = ref(null)
const catDelBusy = ref(false)

async function removeCat() {
  catDelBusy.value = true
  try {
    const inside = byCategory.value.map[catDelete.value.id] || []
    // Artikli iz obrisane kategorije se brišu zajedno s njom — inače bi
    // ostali nevidljivi i u meniju i u panelu.
    if (inside.length) {
      const batch = writeBatch(db)
      inside.forEach((i) => batch.delete(doc(db, 'restaurants', rid.value, 'items', i.id)))
      await batch.commit()
    }
    await deleteDoc(doc(db, 'restaurants', rid.value, 'categories', catDelete.value.id))
    if (activeCat.value === catDelete.value.id) activeCat.value = 'all'
    catDelete.value = null
    toast.ok('Kategorija je obrisana.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    catDelBusy.value = false
  }
}

async function moveCat(c, dir) {
  const list = [...categories.value]
  const i = list.findIndex((x) => x.id === c.id)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  try {
    const batch = writeBatch(db)
    list.forEach((x, idx) =>
      batch.update(doc(db, 'restaurants', rid.value, 'categories', x.id), { sort: idx })
    )
    await batch.commit()
  } catch (e) {
    toast.error(humanError(e))
  }
}

// ═══ artikli ══════════════════════════════════════════════════

const itemModal = ref(null)
const itemBusy = ref(false)
const itemForm = ref(blankItem())

function blankItem() {
  return {
    name: '',
    desc: '',
    ingredients: '',
    portion: '',
    price: 0,
    oldPrice: 0,
    emoji: '🍽️',
    image: '',
    categoryId: '',
    badges: [],
    allergens: [],
    prepTime: 0,
    active: true,
    featured: false,
  }
}

function openItem(it = null) {
  itemModal.value = it || { id: null }
  itemForm.value = it
    ? {
        name: it.name || '',
        desc: it.desc || '',
        ingredients: it.ingredients || '',
        portion: it.portion || '',
        price: Number(it.price) || 0,
        oldPrice: Number(it.oldPrice) || 0,
        emoji: it.emoji || '🍽️',
        image: it.image || '',
        categoryId: it.categoryId || '',
        badges: [...(it.badges || [])],
        allergens: [...(it.allergens || [])],
        prepTime: Number(it.prepTime) || 0,
        active: it.active !== false,
        featured: Boolean(it.featured),
      }
    : {
        ...blankItem(),
        categoryId: activeCat.value !== 'all' ? activeCat.value : categories.value[0]?.id || '',
      }
}

async function saveItem() {
  const f = itemForm.value
  if (!f.name.trim()) return toast.error('Unesite naziv artikla.')
  if (!f.categoryId) return toast.error('Izaberite kategoriju.')
  if (!(Number(f.price) >= 0)) return toast.error('Cena nije ispravna.')

  itemBusy.value = true
  try {
    const payload = {
      name: f.name.trim(),
      desc: f.desc.trim(),
      ingredients: f.ingredients.trim(),
      portion: f.portion.trim(),
      price: Number(f.price) || 0,
      oldPrice: Number(f.oldPrice) || 0,
      emoji: f.emoji || '🍽️',
      image: f.image || '',
      categoryId: f.categoryId,
      badges: f.badges,
      allergens: f.allergens,
      prepTime: Number(f.prepTime) || 0,
      active: f.active,
      featured: f.featured,
      updatedAt: serverTimestamp(),
    }

    if (itemModal.value.id) {
      await updateDoc(doc(db, 'restaurants', rid.value, 'items', itemModal.value.id), payload)
    } else {
      const inCat = byCategory.value.map[f.categoryId] || []
      await addDoc(collection(db, 'restaurants', rid.value, 'items'), {
        ...payload,
        sort: inCat.length,
        ordersCount: 0,
        rating: 0,
        ratingCount: 0,
        createdAt: serverTimestamp(),
      })
    }

    itemModal.value = null
    toast.ok('Sačuvano.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    itemBusy.value = false
  }
}

const itemDelete = ref(null)
const itemDelBusy = ref(false)

async function removeItem() {
  itemDelBusy.value = true
  try {
    await deleteDoc(doc(db, 'restaurants', rid.value, 'items', itemDelete.value.id))
    itemDelete.value = null
    toast.ok('Artikal je obrisan.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    itemDelBusy.value = false
  }
}

async function toggleActive(it) {
  try {
    await updateDoc(doc(db, 'restaurants', rid.value, 'items', it.id), {
      active: !(it.active !== false),
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    toast.error(humanError(e))
  }
}

async function toggleFeatured(it) {
  try {
    await updateDoc(doc(db, 'restaurants', rid.value, 'items', it.id), {
      featured: !it.featured,
      updatedAt: serverTimestamp(),
    })
  } catch (e) {
    toast.error(humanError(e))
  }
}

async function duplicate(it) {
  try {
    const { id, createdAt, updatedAt, ...rest } = it
    await addDoc(collection(db, 'restaurants', rid.value, 'items'), {
      ...rest,
      name: `${it.name} (kopija)`,
      sort: (Number(it.sort) || 0) + 1,
      ordersCount: 0,
      createdAt: serverTimestamp(),
    })
    toast.ok('Kopija je napravljena.')
  } catch (e) {
    toast.error(humanError(e))
  }
}

/** Pomeranje unutar kategorije — vlasnik tako "diže" ono što želi da istakne. */
async function moveItem(it, dir) {
  const list = (byCategory.value.map[it.categoryId] || []).slice()
  const i = list.findIndex((x) => x.id === it.id)
  const j = i + dir
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  try {
    const batch = writeBatch(db)
    list.forEach((x, idx) =>
      batch.update(doc(db, 'restaurants', rid.value, 'items', x.id), { sort: idx })
    )
    await batch.commit()
  } catch (e) {
    toast.error(humanError(e))
  }
}

function toggleIn(list, value) {
  const i = list.indexOf(value)
  if (i === -1) list.push(value)
  else list.splice(i, 1)
}

const EMOJIS = [
  '🍽️', '🥙', '🍔', '🍕', '🍟', '🥗', '🍜', '🍝', '🍣', '🐟', '🦑', '🍖', '🍗', '🥩',
  '🍲', '🥘', '🧀', '🥐', '🍞', '🥞', '🍰', '🍨', '🍯', '☕', '🍵', '🥤', '🧃', '💧',
  '🍺', '🍷', '🥃', '🍸', '🍋', '🍊', '🌶️', '🫒', '🥦', '🍫',
]
</script>

<template>
  <div>
    <PageHead
      title="Meni"
      :subtitle="`${stats.cats} kategorija · ${stats.total} artikala${stats.off ? ' · ' + stats.off + ' nedostupno' : ''}`"
    >
      <template #actions>
        <button class="btn btn-soft" :disabled="locked" @click="openCat()">+ Kategorija</button>
        <button class="btn btn-primary" :disabled="locked || !categories.length" @click="openItem()">
          + Artikal
        </button>
      </template>
    </PageHead>

    <div v-if="locked" class="note note-bad" style="margin-bottom: var(--s4)">
      <div><strong>Nalog je blokiran</strong> — meni možete da pregledate, ali ne i da menjate.</div>
    </div>

    <Empty
      v-if="!categories.length"
      icon="🍽️"
      title="Meni je još prazan"
      text="Krenite od kategorije (npr. „Predjela“, „Pića“), pa u nju dodajte artikle."
    >
      <button class="btn btn-primary" :disabled="locked" @click="openCat()">
        Napravi prvu kategoriju
      </button>
    </Empty>

    <div v-else class="layout">
      <!-- ── kategorije ─────────────────────────────────── -->
      <aside class="cats panel">
        <div class="card-head"><h4>Kategorije</h4></div>

        <button class="cat" :class="{ on: activeCat === 'all' }" @click="activeCat = 'all'">
          <span class="cat-ico">📋</span>
          <span class="grow truncate">Sve</span>
          <span class="xs faint">{{ items.length }}</span>
        </button>

        <div v-for="(c, idx) in categories" :key="c.id" class="cat-row">
          <button class="cat grow" :class="{ on: activeCat === c.id }" @click="activeCat = c.id">
            <span class="cat-ico">{{ c.emoji }}</span>
            <span class="grow truncate">{{ c.name }}</span>
            <span class="xs faint">{{ (byCategory.map[c.id] || []).length }}</span>
          </button>

          <div class="cat-acts">
            <button class="mini" :disabled="locked || idx === 0" title="Gore" @click="moveCat(c, -1)">↑</button>
            <button
              class="mini"
              :disabled="locked || idx === categories.length - 1"
              title="Dole"
              @click="moveCat(c, 1)"
            >
              ↓
            </button>
            <button class="mini" :disabled="locked" title="Izmeni" @click="openCat(c)">✎</button>
            <button class="mini" :disabled="locked" title="Obriši" @click="catDelete = c">🗑</button>
          </div>
        </div>

        <div v-if="byCategory.loose.length" class="note note-warn xs" style="margin: var(--s3)">
          {{ byCategory.loose.length }} artikala nema kategoriju — izmenite ih da bi se pojavili u meniju.
        </div>
      </aside>

      <!-- ── artikli ────────────────────────────────────── -->
      <section class="panel">
        <div class="card-head">
          <input v-model="search" class="input" placeholder="Pretraga artikala…" style="max-width: 280px" />
          <span class="xs faint">{{ shownItems.length }} prikazano</span>
        </div>

        <Empty
          v-if="!shownItems.length"
          icon="🔍"
          :title="search ? 'Nema rezultata' : 'Ova kategorija je prazna'"
          :text="search ? 'Probajte drugu reč.' : 'Dodajte prvi artikal u ovu kategoriju.'"
        >
          <button v-if="!search" class="btn btn-primary btn-sm" :disabled="locked" @click="openItem()">
            + Dodaj artikal
          </button>
        </Empty>

        <ul v-else class="items">
          <li v-for="(it, idx) in shownItems" :key="it.id" class="item" :class="{ off: it.active === false }">
            <span class="thumb">
              <img v-if="it.image" :src="it.image" :alt="it.name" />
              <span v-else aria-hidden="true">{{ it.emoji || '🍽️' }}</span>
            </span>

            <div class="grow" style="min-width: 0">
              <div class="wrap-row" style="gap: 6px">
                <strong class="truncate">{{ it.name }}</strong>
                <span v-if="it.featured" class="badge badge-gold xs">📌 Istaknuto</span>
                <span v-for="b in it.badges || []" :key="b" class="badge xs" :class="'badge-' + (BADGES[b]?.tone || '')">
                  {{ BADGES[b]?.icon }} {{ BADGES[b]?.label }}
                </span>
                <span v-if="soldCount[it.id]" class="badge xs badge-muted">
                  🧾 {{ soldCount[it.id] }}× naručeno
                </span>
                <span v-if="scores[it.id]?.count" class="badge xs badge-gold" title="Prosečna ocena gostiju">
                  ★ {{ fmtRating(scores[it.id].avg) }} ({{ scores[it.id].count }})
                </span>
              </div>
              <p v-if="it.desc" class="xs faint truncate">{{ it.desc }}</p>
            </div>

            <div class="price">
              <strong class="mono">{{ money(it.price, cur) }}</strong>
              <s v-if="it.oldPrice > it.price" class="xs faint mono">{{ money(it.oldPrice, cur) }}</s>
            </div>

            <div class="acts">
              <button class="mini" :disabled="locked || idx === 0" title="Podigni" @click="moveItem(it, -1)">↑</button>
              <button class="mini" :disabled="locked" title="Spusti" @click="moveItem(it, 1)">↓</button>
              <button
                class="mini"
                :disabled="locked"
                :title="it.featured ? 'Skini isticanje' : 'Istakni'"
                @click="toggleFeatured(it)"
              >
                {{ it.featured ? '📌' : '📍' }}
              </button>
              <button
                class="mini"
                :disabled="locked"
                :title="it.active === false ? 'Vrati u ponudu' : 'Privremeno skloni'"
                @click="toggleActive(it)"
              >
                {{ it.active === false ? '🚫' : '👁️' }}
              </button>
              <button class="mini" :disabled="locked" title="Izmeni" @click="openItem(it)">✎</button>
              <button class="mini" :disabled="locked" title="Kopiraj" @click="duplicate(it)">⧉</button>
              <button class="mini" :disabled="locked" title="Obriši" @click="itemDelete = it">🗑</button>
            </div>
          </li>
        </ul>
      </section>
    </div>

    <!-- ── kategorija ──────────────────────────────────── -->
    <Modal
      v-if="catModal"
      :title="catModal.id ? 'Izmena kategorije' : 'Nova kategorija'"
      :busy="catBusy"
      @close="catModal = null"
    >
      <div class="field">
        <label class="label">Naziv <span class="req">*</span></label>
        <input v-model="catForm.name" class="input" placeholder="Predjela" />
      </div>
      <div class="field">
        <label class="label">Znak</label>
        <div class="emojis">
          <button
            v-for="e in EMOJIS.slice(0, 24)"
            :key="e"
            class="emoji"
            :class="{ on: catForm.emoji === e }"
            @click="catForm.emoji = e"
          >
            {{ e }}
          </button>
        </div>
      </div>

      <template #foot>
        <button class="btn btn-ghost" @click="catModal = null">Odustani</button>
        <button class="btn btn-primary" :class="catBusy && 'btn-spin'" :disabled="catBusy" @click="saveCat">
          Sačuvaj
        </button>
      </template>
    </Modal>

    <Confirm
      v-if="catDelete"
      title="Obrisati kategoriju?"
      :text="`Brišu se „${catDelete.name}“ i svi artikli u njoj (${(byCategory.map[catDelete.id] || []).length}). Ovo se ne može poništiti.`"
      confirm-label="Obriši"
      danger
      :busy="catDelBusy"
      @cancel="catDelete = null"
      @confirm="removeCat"
    />

    <!-- ── artikal ─────────────────────────────────────── -->
    <Modal
      v-if="itemModal"
      :title="itemModal.id ? 'Izmena artikla' : 'Novi artikal'"
      wide
      :busy="itemBusy"
      @close="itemModal = null"
    >
      <div class="form">
        <!-- Slika je prvo polje namerno: ona najviše prodaje jelo,
             pa vlasnik ne sme da je preskoči jer je „negde dole". -->
        <div class="span2">
          <ImagePicker
            v-model="itemForm.image"
            preset="dish"
            label="Fotografija jela"
            ratio="16 / 9"
            placeholder="🍽️"
            hint="Vaša slika, sa telefona ili računara. Automatski se smanjuje na ~90 KB da bi se meni brzo otvarao i na slabom internetu."
          />
        </div>

        <div class="field span2">
          <label class="label">Naziv <span class="req">*</span></label>
          <input v-model="itemForm.name" class="input" placeholder="Ćevapi u lepinji" />
        </div>

        <div class="field span2">
          <label class="label">Opis</label>
          <textarea
            v-model="itemForm.desc"
            class="textarea"
            style="min-height: 62px"
            placeholder="Sa žara, uz domaću lepinju i kajmak"
          ></textarea>
          <span class="hint">Kratko — jedna do dve rečenice. Gost ovo vidi već na kartici.</span>
        </div>

        <div class="field span2">
          <label class="label">Sastojci</label>
          <textarea
            v-model="itemForm.ingredients"
            class="textarea"
            style="min-height: 56px"
            placeholder="Junetina, jagnjetina, luk, so, biber, kajmak, lepinja"
          ></textarea>
          <span class="hint">
            Prikazuje se kad gost otvori jelo. Gosti sa alergijama i posebnom ishranom ovo prvo traže.
          </span>
        </div>

        <div class="field">
          <label class="label">Količina</label>
          <input v-model="itemForm.portion" class="input" placeholder="npr. 300 g · 0,5 l · 10 kom" />
        </div>

        <div class="field">
          <label class="label">Cena <span class="req">*</span></label>
          <div class="input-group">
            <input v-model.number="itemForm.price" class="input" type="number" min="0" step="0.1" />
            <span class="addon">{{ cur }}</span>
          </div>
        </div>

        <div class="field">
          <label class="label">Stara cena</label>
          <div class="input-group">
            <input v-model.number="itemForm.oldPrice" class="input" type="number" min="0" step="0.1" />
            <span class="addon">{{ cur }}</span>
          </div>
          <span class="hint">Ako je veća od cene, gost vidi precrtanu cenu i akciju.</span>
        </div>

        <div class="field">
          <label class="label">Kategorija <span class="req">*</span></label>
          <select v-model="itemForm.categoryId" class="select">
            <option v-for="c in categories" :key="c.id" :value="c.id">
              {{ c.emoji }} {{ c.name }}
            </option>
          </select>
        </div>

        <div class="field">
          <label class="label">Vreme pripreme</label>
          <div class="input-group">
            <input v-model.number="itemForm.prepTime" class="input" type="number" min="0" max="180" />
            <span class="addon">min</span>
          </div>
        </div>

        <div v-if="!itemForm.image" class="field span2">
          <label class="label">Znak <span class="faint">(dok nema fotografije)</span></label>
          <div class="emojis">
            <button
              v-for="e in EMOJIS"
              :key="e"
              class="emoji"
              :class="{ on: itemForm.emoji === e }"
              @click="itemForm.emoji = e"
            >
              {{ e }}
            </button>
          </div>
        </div>

        <div class="field span2">
          <label class="label">Bedževi</label>
          <div class="wrap-row">
            <button
              v-for="(b, key) in BADGES"
              :key="key"
              class="chip"
              :class="{ on: itemForm.badges.includes(key) }"
              @click="toggleIn(itemForm.badges, key)"
            >
              {{ b.icon }} {{ b.label }}
            </button>
          </div>
          <span class="hint">Bedž je najbrži način da gost primeti baš ono što želite da prodate.</span>
        </div>

        <div class="field span2">
          <label class="label">Alergeni</label>
          <div class="wrap-row">
            <button
              v-for="a in ALLERGENS"
              :key="a"
              class="chip"
              :class="{ on: itemForm.allergens.includes(a) }"
              @click="toggleIn(itemForm.allergens, a)"
            >
              {{ a }}
            </button>
          </div>
        </div>

        <div class="field span2 switches">
          <label class="switch">
            <input v-model="itemForm.active" type="checkbox" />
            <span class="track"></span>
            <span class="small">Dostupno gostima</span>
          </label>

          <label class="switch">
            <input v-model="itemForm.featured" type="checkbox" />
            <span class="track"></span>
            <span class="small">Istakni na vrhu menija</span>
          </label>
        </div>
      </div>

      <template #foot>
        <button class="btn btn-ghost" :disabled="itemBusy" @click="itemModal = null">Odustani</button>
        <button class="btn btn-primary" :class="itemBusy && 'btn-spin'" :disabled="itemBusy" @click="saveItem">
          Sačuvaj
        </button>
      </template>
    </Modal>

    <Confirm
      v-if="itemDelete"
      title="Obrisati artikal?"
      :text="`„${itemDelete.name}“ nestaje iz menija. Ako je samo privremeno rasprodat, radije ga privremeno sklonite — ostaje vam u meniju za kasnije.`"
      confirm-label="Obriši"
      danger
      :busy="itemDelBusy"
      @cancel="itemDelete = null"
      @confirm="removeItem"
    />
  </div>
</template>

<style scoped>
.layout {
  display: grid;
  grid-template-columns: 260px minmax(0, 1fr);
  gap: var(--s4);
  align-items: start;
}
@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

.cats {
  padding-bottom: var(--s2);
}
.cat {
  display: flex;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  padding: 9px var(--s4);
  font-size: var(--fs-sm);
  color: var(--ink-2);
  transition: background var(--fast);
  text-align: left;
}
.cat:hover {
  background: var(--hover);
}
.cat.on {
  background: var(--tint-brand);
  color: var(--brand-soft);
  font-weight: 650;
}
.cat-ico {
  flex: none;
}
.cat-row {
  display: flex;
  align-items: center;
}
.cat-acts {
  display: none;
  gap: 1px;
  padding-right: var(--s2);
}
.cat-row:hover .cat-acts,
.cat-row:focus-within .cat-acts {
  display: flex;
}

.mini {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  font-size: 12px;
  color: var(--muted);
  transition: all var(--fast);
}
.mini:hover:not(:disabled) {
  background: var(--active);
  color: var(--ink);
}
.mini:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
}
.items li + li {
  border-top: 1px solid var(--line);
}
.item {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  transition: background var(--fast);
}
.item:hover {
  background: var(--hover);
}
.item.off {
  opacity: 0.5;
}
.item strong {
  line-height: 1.3;
}

.thumb {
  width: 44px;
  height: 44px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
  font-size: 1.15rem;
}
.thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.thumb.big {
  width: 88px;
  height: 88px;
  font-size: 2rem;
}

.price {
  text-align: right;
  flex: none;
}
.price strong {
  display: block;
}

.acts {
  display: flex;
  gap: 1px;
  flex: none;
}
@media (max-width: 700px) {
  .item {
    flex-wrap: wrap;
  }
  .acts {
    width: 100%;
    justify-content: flex-end;
  }
}

.form {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
}
.span2 {
  grid-column: 1 / -1;
}
@media (max-width: 560px) {
  .form {
    grid-template-columns: 1fr;
  }
}

.emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  max-height: 132px;
  overflow-y: auto;
}
.emoji {
  width: 38px;
  height: 38px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 1.1rem;
  flex: none;
  transition: all var(--fast);
}
.emoji.on {
  border-color: var(--brand);
  background: var(--tint-brand);
}

.img-row {
  display: flex;
  gap: var(--s3);
  align-items: flex-start;
}
.switches {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s5);
}
</style>
