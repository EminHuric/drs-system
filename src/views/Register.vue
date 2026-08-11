<script setup>
// ─────────────────────────────────────────────────────────────
//  Aktivacija naloga vlasnika
//
//  RDS tim otvara lokal i izdaje kod. Vlasnik ovde tim kodom
//  "preuzima" svoj restoran: pravi sopstvenu lozinku, upisuje se
//  kao ownerUid i troši kod da ga niko drugi ne bi iskoristio.
//
//  Zato platforma nikada ne zna lozinku vlasnika.
// ─────────────────────────────────────────────────────────────

import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import { doc, getDoc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import AuthShell from '@/components/AuthShell.vue'
import { registerOwner, refreshRole, signOut } from '@/stores/auth'
import { humanError, toast } from '@/stores/toast'
import { normalizeInvite } from '@/lib/codes'
import { MODES } from '@/lib/constants'

const route = useRoute()
const router = useRouter()

const step = ref(1)
const code = ref('')
const invite = ref(null)
const rest = ref(null)

const name = ref('')
const email = ref('')
const password = ref('')
const password2 = ref('')
const show = ref(false)

const busy = ref(false)
const error = ref('')

const modeLabel = computed(() => MODES[rest.value?.mode]?.label || '—')

onMounted(() => {
  const fromLink = route.query.kod || route.query.code
  if (typeof fromLink === 'string' && fromLink) {
    code.value = normalizeInvite(fromLink)
    checkCode()
  }
})

async function checkCode() {
  error.value = ''
  const c = normalizeInvite(code.value)
  code.value = c

  if (!c || c.length < 8) {
    error.value = 'Kod nije potpun. Izgleda ovako: RDS-7K2M-9QX4'
    return
  }

  busy.value = true
  try {
    const snap = await getDoc(doc(db, 'invites', c))
    if (!snap.exists()) {
      error.value = 'Ovaj kod ne postoji. Proverite da li ste ga tačno prepisali.'
      return
    }

    const data = snap.data()
    if (data.used) {
      error.value = 'Ovaj kod je već iskorišćen. Ako je nalog vaš, prijavite se lozinkom.'
      return
    }

    const rSnap = await getDoc(doc(db, 'restaurants', data.restaurantId))
    if (!rSnap.exists()) {
      error.value = 'Lokal vezan za ovaj kod više ne postoji. Javite se RDS timu.'
      return
    }
    const r = { id: rSnap.id, ...rSnap.data() }
    if (r.ownerUid) {
      error.value = 'Ovaj lokal već ima vlasnika. Prijavite se svojom lozinkom.'
      return
    }

    invite.value = { id: snap.id, ...data }
    rest.value = r
    email.value = data.email || r.ownerEmail || ''
    name.value = r.ownerName || ''
    step.value = 2
  } catch (e) {
    error.value = humanError(e)
  } finally {
    busy.value = false
  }
}

async function activate() {
  error.value = ''

  if (!name.value.trim()) return (error.value = 'Unesite svoje ime i prezime.')
  if (!email.value.trim()) return (error.value = 'Unesite email adresu.')
  if (password.value.length < 6)
    return (error.value = 'Lozinka mora imati najmanje 6 karaktera.')
  if (password.value !== password2.value)
    return (error.value = 'Lozinke se ne poklapaju.')

  busy.value = true
  try {
    // 1) Nalog. Od ovog trenutka je vlasnik prijavljen.
    const u = await registerOwner(email.value, password.value, name.value.trim())

    // 2) Preuzimanje lokala. Pravila dozvoljavaju samo dok je ownerUid prazan.
    try {
      await updateDoc(doc(db, 'restaurants', rest.value.id), {
        ownerUid: u.uid,
        ownerEmail: email.value.trim().toLowerCase(),
        ownerName: name.value.trim(),
        status: 'onboarding',
        updatedAt: serverTimestamp(),
      })
    } catch (e) {
      // Neko je bio brži ili je kod u međuvremenu povučen — nalog bez
      // lokala nikome ne koristi, pa se odjavljujemo i vraćamo na korak 1.
      await signOut().catch(() => {})
      step.value = 1
      error.value =
        'Lokal nije mogao da se poveže sa vašim nalogom (kod je možda upravo iskorišćen). ' +
        'Javite se RDS timu.'
      return
    }

    // 3) Kod se troši. Ako ovo ne uspe, lokal je već preuzet i zaštićen
    //    pravilima, pa aktivacija ne sme da padne zbog toga.
    updateDoc(doc(db, 'invites', invite.value.id), {
      used: true,
      usedBy: u.uid,
      usedAt: serverTimestamp(),
    }).catch(() => {})

    await refreshRole()
    toast.ok('Nalog je aktiviran. Hajde da podesimo vaš lokal.')
    router.replace({ name: 'onboarding' })
  } catch (e) {
    error.value = humanError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell
    :title="step === 1 ? 'Aktivacija naloga' : 'Napravite svoju lozinku'"
    :subtitle="
      step === 1
        ? 'Unesite kod koji ste dobili od RDS tima.'
        : 'Ovim podacima ćete ubuduće ulaziti u svoj panel.'
    "
  >
    <!-- ── korak 1: kod ─────────────────────────────────── -->
    <form v-if="step === 1" class="col" style="gap: var(--s4)" @submit.prevent="checkCode">
      <div class="field">
        <label class="label" for="code">Kod za aktivaciju</label>
        <input
          id="code"
          v-model="code"
          class="input code-input"
          :class="{ 'is-error': error }"
          placeholder="RDS-XXXX-XXXX"
          autocomplete="off"
          spellcheck="false"
          @input="code = code.toUpperCase()"
        />
        <span class="hint">Velika i mala slova nisu bitna — crtice takođe.</span>
      </div>

      <p v-if="error" class="note note-bad small">{{ error }}</p>

      <button class="btn btn-primary btn-lg btn-block" :class="busy && 'btn-spin'" :disabled="busy">
        Proveri kod
      </button>
    </form>

    <!-- ── korak 2: nalog ───────────────────────────────── -->
    <template v-else>
      <div class="found">
        <span class="found-icon" aria-hidden="true">{{ rest.logoEmoji || '🍽️' }}</span>
        <div class="grow">
          <strong>{{ rest.name }}</strong>
          <p class="xs muted">{{ modeLabel }} · rds.app/r/{{ rest.slug }}</p>
        </div>
        <span class="badge badge-ok">Kod važi</span>
      </div>

      <form class="col" style="gap: var(--s4)" @submit.prevent="activate">
        <div class="field">
          <label class="label" for="ime">Vaše ime i prezime <span class="req">*</span></label>
          <input id="ime" v-model="name" class="input" placeholder="Marko Marković" required />
        </div>

        <div class="field">
          <label class="label" for="mail">Email adresa <span class="req">*</span></label>
          <input
            id="mail"
            v-model="email"
            class="input"
            type="email"
            autocomplete="username"
            placeholder="vas@email.com"
            required
          />
          <span class="hint">Ovim emailom se prijavljujete i njime vraćate zaboravljenu lozinku.</span>
        </div>

        <div class="field">
          <label class="label" for="p1">Lozinka <span class="req">*</span></label>
          <div class="input-group">
            <input
              id="p1"
              v-model="password"
              class="input"
              :type="show ? 'text' : 'password'"
              autocomplete="new-password"
              placeholder="najmanje 6 karaktera"
              required
            />
            <button type="button" class="addon reveal" @click="show = !show">
              {{ show ? '🙈' : '👁️' }}
            </button>
          </div>
        </div>

        <div class="field">
          <label class="label" for="p2">Ponovite lozinku <span class="req">*</span></label>
          <input
            id="p2"
            v-model="password2"
            class="input"
            :type="show ? 'text' : 'password'"
            autocomplete="new-password"
            required
          />
        </div>

        <p v-if="error" class="note note-bad small">{{ error }}</p>

        <button class="btn btn-primary btn-lg btn-block" :class="busy && 'btn-spin'" :disabled="busy">
          Aktiviraj nalog
        </button>

        <button type="button" class="btn btn-ghost btn-block" :disabled="busy" @click="step = 1">
          ← Nazad na kod
        </button>
      </form>
    </template>

    <template #foot>
      <p>
        Već imate nalog?
        <RouterLink to="/login" class="linkish">Prijavite se →</RouterLink>
      </p>
    </template>
  </AuthShell>
</template>

<style scoped>
.code-input {
  font-family: var(--font-mono);
  font-size: var(--fs-lg);
  letter-spacing: 0.12em;
  text-align: center;
  height: 54px;
  font-weight: 700;
}
.found {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--tint-ok);
}
.found strong {
  display: block;
  line-height: 1.2;
}
.found-icon {
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface);
  font-size: 1.3rem;
  flex: none;
}
.linkish {
  color: var(--brand-soft);
  font-weight: 600;
}
.linkish:hover {
  text-decoration: underline;
}
.reveal {
  cursor: pointer;
  background: transparent;
}
.reveal:hover {
  background: var(--hover);
}
</style>
