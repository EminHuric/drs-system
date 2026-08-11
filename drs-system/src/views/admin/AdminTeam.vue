<script setup>
// ─────────────────────────────────────────────────────────────
//  Administratori platforme
//
//  Samo vlasnik platforme (email iz .env / firestore.rules) vidi i
//  menja ovaj spisak. Administratori vode restorane, ali ne mogu
//  da prave nove administratore — to je namerno.
//
//  Nalog se pravi kroz drugu, privremenu Firebase instancu, pa
//  vlasnik ne ispada iz svoje sesije. Bez Cloud Functions, dakle
//  bez plaćenog plana.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { collection, deleteDoc, doc, orderBy, query, serverTimestamp, setDoc } from 'firebase/firestore'
import { db, createUserInSecondaryApp, SUPER_ADMIN_EMAILS } from '@/firebase'
import { user, isSuper } from '@/stores/auth'
import { useLiveCollection } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import Modal from '@/components/ui/Modal.vue'
import Confirm from '@/components/ui/Confirm.vue'
import Empty from '@/components/ui/Empty.vue'
import { toast, humanError } from '@/stores/toast'
import { tempPassword } from '@/lib/codes'
import { date, initials } from '@/lib/format'

const { items: admins, loading } = useLiveCollection(
  query(collection(db, 'platform_admins'), orderBy('createdAt', 'desc'))
)

const addOpen = ref(false)
const saving = ref(false)
const error = ref('')
const created = ref(null)

const form = ref({ name: '', email: '', password: tempPassword() })

function openAdd() {
  form.value = { name: '', email: '', password: tempPassword() }
  error.value = ''
  addOpen.value = true
}

async function addAdmin() {
  error.value = ''
  const f = form.value
  if (!f.name.trim()) return (error.value = 'Unesite ime administratora.')
  if (!f.email.trim()) return (error.value = 'Unesite email adresu.')
  if (f.password.length < 6) return (error.value = 'Lozinka mora imati najmanje 6 karaktera.')
  if (SUPER_ADMIN_EMAILS.includes(f.email.trim().toLowerCase()))
    return (error.value = 'Ova adresa je već vlasnik platforme — ima sve dozvole.')

  saving.value = true
  try {
    const uid = await createUserInSecondaryApp(f.email.trim(), f.password)

    await setDoc(doc(db, 'platform_admins', uid), {
      email: f.email.trim().toLowerCase(),
      name: f.name.trim(),
      level: 'admin',
      createdAt: serverTimestamp(),
      createdBy: user.value?.uid || null,
    })

    addOpen.value = false
    created.value = { ...f }
    toast.ok('Administrator je dodat.')
  } catch (e) {
    error.value = humanError(e)
  } finally {
    saving.value = false
  }
}

const confirmRemove = ref(null)
const removing = ref(false)

async function removeAdmin() {
  removing.value = true
  try {
    await deleteDoc(doc(db, 'platform_admins', confirmRemove.value.id))
    toast.ok('Dozvole su povučene.')
    confirmRemove.value = null
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    removing.value = false
  }
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text)
    toast.ok('Kopirano.')
  } catch {
    toast.error('Kopiranje nije uspelo.')
  }
}

const credentialsText = computed(() =>
  created.value
    ? [
        'RDS — pristup administratorskom panelu',
        '',
        `Prijava: ${window.location.origin}/login`,
        `Email: ${created.value.email}`,
        `Lozinka: ${created.value.password}`,
        '',
        'Molimo promenite lozinku posle prve prijave (Zaboravili ste lozinku → novi link).',
      ].join('\n')
    : ''
)
</script>

<template>
  <div>
    <PageHead
      title="Administratori"
      subtitle="Ko sme da otvara naloge restoranima i da ih blokira."
    >
      <template #actions>
        <button v-if="isSuper" class="btn btn-primary" @click="openAdd">+ Dodaj administratora</button>
      </template>
    </PageHead>

    <div class="note note-info small" style="margin-bottom: var(--s4)">
      <div>
        <strong>Dva nivoa pristupa.</strong>
        <em>Vlasnik platforme</em> (vaša adresa iz podešavanja) može sve, uključujući dodavanje i
        uklanjanje administratora. <em>Administrator</em> vodi restorane — otvara naloge, izdaje
        kodove i blokira lokale — ali ne dira spisak administratora.
      </div>
    </div>

    <div class="panel">
      <div v-if="loading" style="padding: var(--s4)">
        <div v-for="i in 3" :key="i" class="skeleton" style="height: 56px; margin-bottom: 8px"></div>
      </div>

      <Empty
        v-else-if="!admins.length"
        icon="🛡️"
        title="Samo vi imate pristup"
        text="Dodajte administratora ako želite da vam neko pomaže oko naloga restorana."
      />

      <ul v-else class="list">
        <li v-for="a in admins" :key="a.id" class="row-item">
          <span class="avatar avatar-brand">{{ initials(a.name || a.email) }}</span>
          <div class="grow" style="min-width: 0">
            <strong class="truncate">{{ a.name || 'Bez imena' }}</strong>
            <span class="xs faint truncate">{{ a.email }}</span>
          </div>

          <span class="badge" :class="a.level === 'super' ? 'badge-brand' : 'badge-info'">
            {{ a.level === 'super' ? '👑 Vlasnik platforme' : '🛡️ Administrator' }}
          </span>

          <span class="xs faint nowrap hide-sm">{{ date(a.createdAt) }}</span>

          <button
            v-if="isSuper && a.level !== 'super' && a.id !== user?.uid"
            class="btn btn-ghost btn-sm"
            title="Povuci dozvole"
            @click="confirmRemove = a"
          >
            🗑
          </button>
          <span v-else class="btn btn-ghost btn-sm" style="visibility: hidden">🗑</span>
        </li>
      </ul>
    </div>

    <!-- ── novi administrator ──────────────────────────── -->
    <Modal v-if="addOpen" title="Novi administrator" :busy="saving" @close="addOpen = false">
      <p class="note note-warn small">
        Vi pravite nalog i prvu lozinku, pa ih prosleđujete osobi. Recite joj da odmah postavi
        svoju lozinku preko „Zaboravili ste lozinku?“ na stranici za prijavu.
      </p>

      <div class="field">
        <label class="label">Ime i prezime <span class="req">*</span></label>
        <input v-model="form.name" class="input" placeholder="Ana Anić" />
      </div>

      <div class="field">
        <label class="label">Email adresa <span class="req">*</span></label>
        <input v-model="form.email" class="input" type="email" placeholder="ana@rds.me" />
      </div>

      <div class="field">
        <label class="label">Početna lozinka <span class="req">*</span></label>
        <div class="input-group">
          <input v-model="form.password" class="input mono" />
          <button class="addon" style="cursor: pointer" @click="form.password = tempPassword()">
            ↻ Nova
          </button>
        </div>
        <span class="hint">Zapišite je — posle zatvaranja prozora više je nećete videti.</span>
      </div>

      <p v-if="error" class="note note-bad small">{{ error }}</p>

      <template #foot>
        <button class="btn btn-ghost" :disabled="saving" @click="addOpen = false">Odustani</button>
        <button class="btn btn-primary" :class="saving && 'btn-spin'" :disabled="saving" @click="addAdmin">
          Napravi nalog
        </button>
      </template>
    </Modal>

    <!-- ── pristupni podaci ────────────────────────────── -->
    <Modal v-if="created" title="Nalog je napravljen 🎉" @close="created = null">
      <div class="field">
        <label class="label">Pristupni podaci</label>
        <pre class="creds">{{ credentialsText }}</pre>
      </div>
      <button class="btn btn-primary btn-block" @click="copy(credentialsText)">
        📋 Kopiraj i pošalji
      </button>
      <p class="hint">
        RDS ne čuva lozinke u čitljivom obliku — ovo je jedini put da vidite ovu lozinku.
      </p>

      <template #foot>
        <button class="btn btn-soft" @click="created = null">Zatvori</button>
      </template>
    </Modal>

    <Confirm
      v-if="confirmRemove"
      title="Povući dozvole?"
      :text="`${confirmRemove.name || confirmRemove.email} gubi pristup administraciji. Nalog za prijavu ostaje, ali bez ijedne dozvole — obrišite ga iz Firebase konzole ako želite i to.`"
      confirm-label="Povuci dozvole"
      danger
      :busy="removing"
      @cancel="confirmRemove = null"
      @confirm="removeAdmin"
    />
  </div>
</template>

<style scoped>
.list {
  list-style: none;
  margin: 0;
  padding: 0;
}
.list li + li {
  border-top: 1px solid var(--line);
}
.row-item {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
}
.row-item strong,
.row-item .xs {
  display: block;
  line-height: 1.25;
}
.creds {
  font-family: var(--font-mono);
  font-size: var(--fs-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--r);
  padding: var(--s3);
  white-space: pre-wrap;
  overflow-x: auto;
  margin: 0;
}
@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
}
</style>
