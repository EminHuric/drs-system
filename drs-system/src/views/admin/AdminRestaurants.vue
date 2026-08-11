<script setup>
// ─────────────────────────────────────────────────────────────
//  Nalozi restorana
//
//  Ovde RDS tim otvara lokal i izdaje kod za aktivaciju. Lozinku
//  vlasnika nikada ne vidimo — on je sam pravi kada iskoristi kod.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { RouterLink } from 'vue-router'
import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '@/firebase'
import { user } from '@/stores/auth'
import { useLiveCollection } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import Modal from '@/components/ui/Modal.vue'
import Confirm from '@/components/ui/Confirm.vue'
import Empty from '@/components/ui/Empty.vue'
import { toast, humanError } from '@/stores/toast'
import { inviteCode } from '@/lib/codes'
import { slugify, isValidSlug, RESERVED_SLUGS } from '@/lib/slug'
import { defaultRestaurant, guestUrl } from '@/lib/restaurant'
import { deleteRestaurant, setBlocked } from '@/lib/adminActions'
import { normalizePhone, date } from '@/lib/format'
import { MODES, RESTAURANT_STATUS, CURRENCIES, BRAND_COLORS } from '@/lib/constants'

const { items: restaurants, loading } = useLiveCollection(
  query(collection(db, 'restaurants'), orderBy('createdAt', 'desc'))
)

const search = ref('')
const filter = ref('all')

const shown = computed(() => {
  const q = search.value.trim().toLowerCase()
  return restaurants.value.filter((r) => {
    if (filter.value !== 'all' && r.status !== filter.value) return false
    if (!q) return true
    return [r.name, r.slug, r.city, r.ownerEmail].some((v) =>
      String(v || '').toLowerCase().includes(q)
    )
  })
})

const tally = computed(() => {
  const t = { all: restaurants.value.length, active: 0, pending: 0, onboarding: 0, blocked: 0 }
  for (const r of restaurants.value) if (t[r.status] !== undefined) t[r.status]++
  return t
})

// ── pravljenje novog lokala ──────────────────────────────────

const createOpen = ref(false)
const saving = ref(false)
const formError = ref('')
const slugTouched = ref(false)

const form = ref(blankForm())

function blankForm() {
  return {
    name: '',
    slug: '',
    mode: 'both',
    city: '',
    address: '',
    ownerName: '',
    ownerEmail: '',
    phone: '',
    whatsappNumber: '',
    currency: '€',
    logoEmoji: '🍽️',
    brandColor: '#e2603f',
    tagline: '',
  }
}

function openCreate() {
  form.value = blankForm()
  formError.value = ''
  slugTouched.value = false
  createOpen.value = true
}

function onNameInput() {
  if (!slugTouched.value) form.value.slug = slugify(form.value.name)
}

const issued = ref(null) // { code, restaurant }

async function createRestaurant() {
  formError.value = ''
  const f = form.value

  if (!f.name.trim()) return (formError.value = 'Unesite naziv lokala.')
  const slug = slugify(f.slug || f.name)
  if (!isValidSlug(slug))
    return (formError.value = 'Web adresa mora imati bar 2 znaka: slova, brojevi i crtice.')
  if (RESERVED_SLUGS.includes(slug))
    return (formError.value = `Adresa „${slug}“ je rezervisana. Izaberite drugu.`)
  if (!f.whatsappNumber.trim())
    return (formError.value = 'Unesite WhatsApp broj na koji stižu porudžbine.')

  saving.value = true
  try {
    // Id pravimo unapred da bismo istim id-jem rezervisali i adresu.
    const restRef = doc(collection(db, 'restaurants'))
    const code = inviteCode()

    // Rezervacija adrese. Pravila zabranjuju upis preko postojećeg
    // dokumenta, pa ovaj poziv pada ako je adresa već zauzeta.
    try {
      await setDoc(doc(db, 'slugs', slug), {
        restaurantId: restRef.id,
        createdAt: serverTimestamp(),
      })
    } catch {
      formError.value = `Adresa „/r/${slug}“ je već zauzeta. Izaberite drugu.`
      return
    }

    const data = defaultRestaurant({
      name: f.name.trim(),
      slug,
      tagline: f.tagline.trim(),
      mode: f.mode,
      city: f.city.trim(),
      address: f.address.trim(),
      ownerName: f.ownerName.trim(),
      ownerEmail: f.ownerEmail.trim().toLowerCase(),
      phone: normalizePhone(f.phone),
      whatsappNumber: normalizePhone(f.whatsappNumber),
      currency: f.currency,
      logoEmoji: f.logoEmoji || '🍽️',
      brandColor: f.brandColor,
      status: 'pending',
    })

    await setDoc(restRef, {
      ...data,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: user.value?.uid || null,
    })

    await setDoc(doc(db, 'invites', code), {
      code,
      restaurantId: restRef.id,
      restaurantName: data.name,
      email: data.ownerEmail || '',
      used: false,
      createdAt: serverTimestamp(),
      createdBy: user.value?.uid || null,
    })

    createOpen.value = false
    issued.value = { code, restaurant: { id: restRef.id, ...data } }
    toast.ok('Nalog je otvoren. Pošaljite vlasniku kod za aktivaciju.')
  } catch (e) {
    formError.value = humanError(e)
  } finally {
    saving.value = false
  }
}

// ── kod: kopiranje, slanje, ponovno izdavanje ────────────────

const codeModal = ref(null) // { code, restaurant }
const codeBusy = ref(false)

async function showCode(r) {
  codeBusy.value = true
  try {
    // Kod se ne čuva na restoranu (bio bi javan) — traži se u pozivnicama.
    const snap = await getDocs(
      query(collection(db, 'invites'), where('restaurantId', '==', r.id), limit(5))
    )
    const open = snap.docs.map((d) => ({ id: d.id, ...d.data() })).find((i) => !i.used)
    if (!open) {
      toast.info('Za ovaj lokal nema neiskorišćenog koda. Možete izdati novi.')
      codeModal.value = { code: '', restaurant: r }
    } else {
      codeModal.value = { code: open.code, restaurant: r }
    }
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    codeBusy.value = false
  }
}

async function reissueCode(r) {
  codeBusy.value = true
  try {
    const code = inviteCode()
    await setDoc(doc(db, 'invites', code), {
      code,
      restaurantId: r.id,
      restaurantName: r.name,
      email: r.ownerEmail || '',
      used: false,
      createdAt: serverTimestamp(),
      createdBy: user.value?.uid || null,
    })
    codeModal.value = { code, restaurant: r }
    toast.ok('Novi kod je izdat.')
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    codeBusy.value = false
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.ok('Kopirano.')
  } catch {
    toast.error('Kopiranje nije uspelo — označite tekst i kopirajte ručno.')
  }
}

function inviteMessage(m) {
  const link = `${window.location.origin}/register?kod=${m.code}`
  return [
    `Dobar dan${m.restaurant.ownerName ? ' ' + m.restaurant.ownerName : ''},`,
    '',
    `nalog za *${m.restaurant.name}* je otvoren na RDS platformi.`,
    '',
    `🔑 Kod za aktivaciju: *${m.code}*`,
    `🔗 Aktivacija: ${link}`,
    '',
    `Vaš meni će biti na adresi: ${guestUrl(m.restaurant.slug)}`,
    '',
    'Pozdrav, RDS tim',
  ].join('\n')
}

function sendInviteWhatsApp(m) {
  const to = m.restaurant.whatsappNumber || ''
  window.open(`https://wa.me/${to}?text=${encodeURIComponent(inviteMessage(m))}`, '_blank')
}

// ── blokiranje i brisanje ────────────────────────────────────

const confirmBlock = ref(null)
const confirmDelete = ref(null)
const deleteText = ref('')
const actionBusy = ref(false)

async function toggleBlock() {
  const r = confirmBlock.value
  actionBusy.value = true
  try {
    const wasBlocked = r.status === 'blocked'
    await setBlocked(r, !wasBlocked)
    toast.ok(wasBlocked ? 'Lokal je odblokiran.' : 'Lokal je blokiran.')
    confirmBlock.value = null
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    actionBusy.value = false
  }
}

const deleteStep = ref('')

async function removeRestaurant() {
  actionBusy.value = true
  try {
    await deleteRestaurant(confirmDelete.value, (s) => (deleteStep.value = s))
    toast.ok('Lokal je obrisan.')
    confirmDelete.value = null
    deleteText.value = ''
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    actionBusy.value = false
    deleteStep.value = ''
  }
}

const EMOJIS = ['🍽️', '🍕', '🍔', '🍣', '🥙', '🍜', '☕', '🍺', '🍷', '🏮', '🥐', '🍰', '🌮', '🥗']
</script>

<template>
  <div>
    <PageHead title="Restorani" subtitle="Nalozi lokala, kodovi za aktivaciju i pristup sistemu.">
      <template #actions>
        <button class="btn btn-primary" @click="openCreate">+ Novi restoran</button>
      </template>
    </PageHead>

    <!-- ── traka za pretragu ───────────────────────────── -->
    <div class="bar">
      <input v-model="search" class="input grow" placeholder="Pretraga po nazivu, adresi ili gradu…" />
      <div class="seg">
        <button :class="{ on: filter === 'all' }" @click="filter = 'all'">
          Svi <span class="faint">{{ tally.all }}</span>
        </button>
        <button :class="{ on: filter === 'active' }" @click="filter = 'active'">
          Aktivni <span class="faint">{{ tally.active }}</span>
        </button>
        <button :class="{ on: filter === 'pending' }" @click="filter = 'pending'">
          Čekaju <span class="faint">{{ tally.pending + tally.onboarding }}</span>
        </button>
        <button :class="{ on: filter === 'blocked' }" @click="filter = 'blocked'">
          Blokirani <span class="faint">{{ tally.blocked }}</span>
        </button>
      </div>
    </div>

    <!-- ── spisak ──────────────────────────────────────── -->
    <div class="panel">
      <div v-if="loading" style="padding: var(--s4)">
        <div v-for="i in 5" :key="i" class="skeleton" style="height: 56px; margin-bottom: 8px"></div>
      </div>

      <Empty
        v-else-if="!shown.length"
        icon="🏪"
        :title="restaurants.length ? 'Nema rezultata' : 'Još nema nijednog lokala'"
        :text="
          restaurants.length
            ? 'Promenite pretragu ili filter.'
            : 'Otvorite prvi nalog — dobićete kod koji šaljete vlasniku lokala.'
        "
      >
        <button v-if="!restaurants.length" class="btn btn-primary btn-sm" @click="openCreate">
          Napravi prvi lokal
        </button>
      </Empty>

      <div v-else class="table-scroll">
        <table class="tbl">
          <thead>
            <tr>
              <th>Lokal</th>
              <th>Namena</th>
              <th>Status</th>
              <th>Vlasnik</th>
              <th>Otvoren</th>
              <th class="td-right">Radnje</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in shown" :key="r.id">
              <td>
                <RouterLink :to="{ name: 'admin-restaurant', params: { id: r.id } }" class="cell-main">
                  <span class="ico" aria-hidden="true">{{ r.logoEmoji || '🍽️' }}</span>
                  <span style="min-width: 0">
                    <strong class="truncate">{{ r.name }}</strong>
                    <span class="xs faint truncate">/r/{{ r.slug }}{{ r.city ? ' · ' + r.city : '' }}</span>
                  </span>
                </RouterLink>
              </td>
              <td>
                <span class="badge">{{ MODES[r.mode]?.icon }} {{ MODES[r.mode]?.short }}</span>
              </td>
              <td>
                <span class="badge" :class="'badge-' + (RESTAURANT_STATUS[r.status]?.tone || 'muted')">
                  {{ RESTAURANT_STATUS[r.status]?.label || r.status }}
                </span>
              </td>
              <td class="small">
                <span v-if="r.ownerEmail" class="truncate" style="max-width: 22ch; display: block">
                  {{ r.ownerEmail }}
                </span>
                <span v-else class="faint">—</span>
              </td>
              <td class="small faint nowrap">{{ date(r.createdAt) }}</td>
              <td class="td-right">
                <div class="acts">
                  <button
                    v-if="!r.ownerUid"
                    class="btn btn-soft btn-sm"
                    title="Prikaži kod za aktivaciju"
                    @click="showCode(r)"
                  >
                    🔑 Kod
                  </button>
                  <a
                    class="btn btn-ghost btn-sm"
                    :href="guestUrl(r.slug)"
                    target="_blank"
                    rel="noopener"
                    title="Otvori gost aplikaciju"
                  >
                    ↗
                  </a>
                  <button
                    class="btn btn-sm"
                    :class="r.status === 'blocked' ? 'btn-ok' : 'btn-ghost'"
                    :title="r.status === 'blocked' ? 'Odblokiraj' : 'Blokiraj'"
                    @click="confirmBlock = r"
                  >
                    {{ r.status === 'blocked' ? '🔓' : '🚫' }}
                  </button>
                  <button
                    class="btn btn-ghost btn-sm"
                    title="Obriši lokal"
                    @click="((confirmDelete = r), (deleteText = ''))"
                  >
                    🗑
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- ── novi lokal ──────────────────────────────────── -->
    <Modal v-if="createOpen" title="Novi restoran" wide :busy="saving" @close="createOpen = false">
      <p class="note note-info small">
        Vi otvarate nalog i birate namenu. Vlasnik dobija kod, sam pravi lozinku i posle toga
        menja meni, izgled i podešavanja svog lokala.
      </p>

      <div class="form-grid">
        <div class="field span2">
          <label class="label">Naziv lokala <span class="req">*</span></label>
          <input v-model="form.name" class="input" placeholder="Konoba Lanterna" @input="onNameInput" />
        </div>

        <div class="field span2">
          <label class="label">Web adresa menija</label>
          <div class="input-group">
            <span class="addon">{{ ' ' }}/r/</span>
            <input
              v-model="form.slug"
              class="input"
              placeholder="konoba-lanterna"
              @input="((slugTouched = true), (form.slug = slugify(form.slug)))"
            />
          </div>
          <span class="hint">Ovo gost vidi u adresi i u QR kodu. Kasnije se ne menja.</span>
        </div>

        <div class="field span2">
          <label class="label">Namena naloga <span class="req">*</span></label>
          <div class="modes">
            <button
              v-for="(m, key) in MODES"
              :key="key"
              type="button"
              class="mode"
              :class="{ on: form.mode === key }"
              @click="form.mode = key"
            >
              <span class="mode-ico">{{ m.icon }}</span>
              <strong class="small">{{ m.label }}</strong>
            </button>
          </div>
        </div>

        <div class="field span2">
          <label class="label">WhatsApp broj za porudžbine <span class="req">*</span></label>
          <input v-model="form.whatsappNumber" class="input" placeholder="+382 69 123 456" />
          <span class="hint">
            Na ovaj broj gost šalje porudžbinu. Vlasnik ga kasnije može promeniti sam.
          </span>
        </div>

        <div class="field">
          <label class="label">Grad</label>
          <input v-model="form.city" class="input" placeholder="Bar" />
        </div>

        <div class="field">
          <label class="label">Valuta</label>
          <select v-model="form.currency" class="select">
            <option v-for="c in CURRENCIES" :key="c" :value="c">{{ c }}</option>
          </select>
        </div>

        <div class="field span2">
          <label class="label">Adresa lokala</label>
          <input v-model="form.address" class="input" placeholder="Obala 12, Bar" />
        </div>

        <div class="field">
          <label class="label">Ime vlasnika</label>
          <input v-model="form.ownerName" class="input" placeholder="Marko Marković" />
        </div>

        <div class="field">
          <label class="label">Email vlasnika</label>
          <input v-model="form.ownerEmail" class="input" type="email" placeholder="vlasnik@email.com" />
          <span class="hint">Samo predlog — vlasnik pri aktivaciji može uneti drugi.</span>
        </div>

        <div class="field span2">
          <label class="label">Znak lokala</label>
          <div class="emojis">
            <button
              v-for="e in EMOJIS"
              :key="e"
              type="button"
              class="emoji"
              :class="{ on: form.logoEmoji === e }"
              @click="form.logoEmoji = e"
            >
              {{ e }}
            </button>
          </div>
        </div>

        <div class="field span2">
          <label class="label">Boja brenda</label>
          <div class="colors">
            <button
              v-for="c in BRAND_COLORS"
              :key="c.value"
              type="button"
              class="color"
              :class="{ on: form.brandColor === c.value }"
              :style="{ background: c.value }"
              :title="c.name"
              :aria-label="c.name"
              @click="form.brandColor = c.value"
            ></button>
          </div>
        </div>
      </div>

      <p v-if="formError" class="note note-bad small">{{ formError }}</p>

      <template #foot>
        <button class="btn btn-ghost" :disabled="saving" @click="createOpen = false">Odustani</button>
        <button class="btn btn-primary" :class="saving && 'btn-spin'" :disabled="saving" @click="createRestaurant">
          Otvori nalog i izdaj kod
        </button>
      </template>
    </Modal>

    <!-- ── izdati kod ──────────────────────────────────── -->
    <Modal
      v-if="issued || codeModal"
      :title="issued ? 'Nalog je otvoren 🎉' : 'Kod za aktivaciju'"
      @close="((issued = null), (codeModal = null))"
    >
      <template v-for="m in [issued || codeModal]" :key="m.restaurant.id">
        <div class="issued">
          <span class="issued-ico">{{ m.restaurant.logoEmoji || '🍽️' }}</span>
          <div>
            <strong>{{ m.restaurant.name }}</strong>
            <p class="xs muted">{{ MODES[m.restaurant.mode]?.label }}</p>
          </div>
        </div>

        <div v-if="m.code" class="field">
          <label class="label">Kod za vlasnika</label>
          <div class="code-box">{{ m.code }}</div>
          <span class="hint">Kod važi dok se jednom ne iskoristi. Posle toga postaje neupotrebljiv.</span>
        </div>

        <div v-else class="note note-warn small">
          Svi izdati kodovi za ovaj lokal su iskorišćeni ili povučeni. Izdajte novi ako vlasnik
          još nije aktivirao nalog.
        </div>

        <div class="field">
          <label class="label">Adresa menija</label>
          <div class="input-group">
            <input class="input mono small" :value="guestUrl(m.restaurant.slug)" readonly />
            <button class="addon" style="cursor: pointer" @click="copy(guestUrl(m.restaurant.slug))">
              Kopiraj
            </button>
          </div>
        </div>

        <div class="wrap-row">
          <button v-if="m.code" class="btn btn-soft btn-sm" @click="copy(m.code)">📋 Kopiraj kod</button>
          <button v-if="m.code" class="btn btn-soft btn-sm" @click="copy(inviteMessage(m))">
            📄 Kopiraj celu poruku
          </button>
          <button
            v-if="m.code && m.restaurant.whatsappNumber"
            class="btn btn-wa btn-sm"
            @click="sendInviteWhatsApp(m)"
          >
            Pošalji na WhatsApp
          </button>
          <button class="btn btn-outline btn-sm" :class="codeBusy && 'btn-spin'" :disabled="codeBusy" @click="reissueCode(m.restaurant)">
            ↻ Izdaj novi kod
          </button>
        </div>
      </template>

      <template #foot>
        <button class="btn btn-primary" @click="((issued = null), (codeModal = null))">Gotovo</button>
      </template>
    </Modal>

    <!-- ── blokiranje ──────────────────────────────────── -->
    <Confirm
      v-if="confirmBlock"
      :title="confirmBlock.status === 'blocked' ? 'Odblokirati lokal?' : 'Blokirati lokal?'"
      :text="
        confirmBlock.status === 'blocked'
          ? `„${confirmBlock.name}“ ponovo počinje da prima porudžbine, a vlasnik dobija pun pristup panelu.`
          : `„${confirmBlock.name}“ prestaje da prima porudžbine. Vlasnik i dalje vidi svoje podatke, ali ne može ništa da menja dok ga ne odblokirate.`
      "
      :confirm-label="confirmBlock.status === 'blocked' ? 'Odblokiraj' : 'Blokiraj'"
      :danger="confirmBlock.status !== 'blocked'"
      :busy="actionBusy"
      @cancel="confirmBlock = null"
      @confirm="toggleBlock"
    />

    <!-- ── brisanje ────────────────────────────────────── -->
    <Modal v-if="confirmDelete" title="Trajno obrisati lokal?" :busy="actionBusy" @close="confirmDelete = null">
      <div class="note note-bad small">
        <div>
          Brišu se <strong>nalog, meni, raspored stolova, ocene, poruke i sve porudžbine</strong>
          lokala „{{ confirmDelete.name }}“, kao i web adresa <strong>/r/{{ confirmDelete.slug }}</strong>
          koja se posle toga oslobađa. Ovo se ne može poništiti.
          <br /><br />
          Ako želite samo da zaustavite rad lokala, koristite <strong>blokiranje</strong> — podaci
          ostaju sačuvani.
        </div>
      </div>

      <p v-if="confirmDelete.ownerEmail" class="hint">
        Nalog za prijavu vlasnika ({{ confirmDelete.ownerEmail }}) ostaje u Firebase-u, ali bez
        ijednog lokala nema pristup ničemu. Obrišite ga u Firebase konzoli → Authentication → Users
        ako želite i to.
      </p>

      <div class="field">
        <label class="label">Za potvrdu prepišite naziv lokala</label>
        <input v-model="deleteText" class="input" :placeholder="confirmDelete.name" />
      </div>

      <p v-if="deleteStep" class="small muted">{{ deleteStep }}…</p>

      <template #foot>
        <button class="btn btn-ghost" :disabled="actionBusy" @click="confirmDelete = null">
          Odustani
        </button>
        <button
          class="btn btn-danger"
          :class="actionBusy && 'btn-spin'"
          :disabled="actionBusy || deleteText.trim() !== confirmDelete.name"
          @click="removeRestaurant"
        >
          Obriši zauvek
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.bar {
  display: flex;
  gap: var(--s3);
  margin-bottom: var(--s4);
  flex-wrap: wrap;
}
.bar .seg {
  flex: none;
}

.cell-main {
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-width: 0;
}
.cell-main strong,
.cell-main .xs {
  display: block;
  line-height: 1.25;
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
.acts {
  display: inline-flex;
  gap: 4px;
  justify-content: flex-end;
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--s4);
}
.span2 {
  grid-column: 1 / -1;
}
@media (max-width: 560px) {
  .form-grid {
    grid-template-columns: 1fr;
  }
}

.modes {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--s2);
}
.mode {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: var(--s3);
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface-2);
  text-align: center;
  transition: all var(--fast);
}
.mode:hover {
  border-color: var(--line-strong);
}
.mode.on {
  border-color: var(--brand);
  background: var(--tint-brand);
  color: var(--brand-soft);
}
.mode-ico {
  font-size: 1.2rem;
}
@media (max-width: 480px) {
  .modes {
    grid-template-columns: 1fr;
  }
  .mode {
    flex-direction: row;
    justify-content: flex-start;
    gap: var(--s3);
  }
}

.emojis {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.emoji {
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  border: 1px solid var(--line);
  background: var(--surface-2);
  font-size: 1.15rem;
  transition: all var(--fast);
}
.emoji:hover {
  border-color: var(--line-strong);
}
.emoji.on {
  border-color: var(--brand);
  background: var(--tint-brand);
}

.colors {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}
.color {
  width: 34px;
  height: 34px;
  border-radius: var(--r-sm);
  border: 2px solid transparent;
  transition: all var(--fast);
}
.color.on {
  border-color: var(--ink);
  transform: scale(1.1);
}

.issued {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
}
.issued strong {
  display: block;
  line-height: 1.2;
}
.issued-ico {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--tint-brand);
  font-size: 1.3rem;
  flex: none;
}
</style>
