<script setup>
import { ref } from 'vue'
import { useRoute, useRouter, RouterLink } from 'vue-router'
import AuthShell from '@/components/AuthShell.vue'
import { login, resetPassword } from '@/stores/auth'
import { homeFor } from '@/router'
import { toast, humanError } from '@/stores/toast'

const route = useRoute()
const router = useRouter()

const email = ref('')
const password = ref('')
const show = ref(false)
const busy = ref(false)
const error = ref('')
const resetMode = ref(false)

async function submit() {
  error.value = ''
  if (!email.value.trim() || !password.value) {
    error.value = 'Unesite email i lozinku.'
    return
  }

  busy.value = true
  try {
    const r = await login(email.value, password.value)

    if (r === 'none') {
      error.value =
        'Prijava je uspela, ali ovom nalogu nije dodeljen nijedan lokal. Javite se RDS timu.'
      return
    }

    const next = route.query.next
    router.replace(typeof next === 'string' && next.startsWith('/') ? next : homeFor(r))
  } catch (e) {
    error.value = humanError(e)
  } finally {
    busy.value = false
  }
}

async function sendReset() {
  if (!email.value.trim()) {
    error.value = 'Prvo unesite email adresu.'
    return
  }
  busy.value = true
  error.value = ''
  try {
    await resetPassword(email.value)
    toast.ok('Poslali smo vam link za promenu lozinke na email.')
    resetMode.value = false
  } catch (e) {
    error.value = humanError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <AuthShell
    :title="resetMode ? 'Zaboravljena lozinka' : 'Prijava na RDS'"
    :subtitle="
      resetMode
        ? 'Unesite email adresu naloga — poslaćemo vam link za novu lozinku.'
        : 'Ista prijava za RDS tim i za vlasnike lokala. Sistem sam prepoznaje kuda idete.'
    "
  >
    <form class="col" style="gap: var(--s4)" @submit.prevent="resetMode ? sendReset() : submit()">
      <div class="field">
        <label class="label" for="email">Email adresa</label>
        <input
          id="email"
          v-model="email"
          class="input"
          :class="{ 'is-error': error }"
          type="email"
          autocomplete="username"
          placeholder="vas@email.com"
          required
        />
      </div>

      <div v-if="!resetMode" class="field">
        <div class="row-between">
          <label class="label" for="pass">Lozinka</label>
          <button type="button" class="linkish xs" @click="resetMode = true">
            Zaboravili ste?
          </button>
        </div>
        <div class="input-group">
          <input
            id="pass"
            v-model="password"
            class="input"
            :type="show ? 'text' : 'password'"
            autocomplete="current-password"
            placeholder="••••••••"
            required
          />
          <button
            type="button"
            class="addon reveal"
            :aria-label="show ? 'Sakrij lozinku' : 'Prikaži lozinku'"
            @click="show = !show"
          >
            {{ show ? '🙈' : '👁️' }}
          </button>
        </div>
      </div>

      <p v-if="error" class="note note-bad small">{{ error }}</p>

      <button class="btn btn-primary btn-lg btn-block" :class="busy && 'btn-spin'" :disabled="busy">
        {{ resetMode ? 'Pošalji link' : 'Prijavi se' }}
      </button>

      <button v-if="resetMode" type="button" class="btn btn-ghost btn-block" @click="resetMode = false">
        Nazad na prijavu
      </button>
    </form>

    <template #foot>
      <p>
        Imate kod za aktivaciju?
        <RouterLink to="/register" class="linkish">Aktivirajte nalog →</RouterLink>
      </p>
    </template>
  </AuthShell>
</template>

<style scoped>
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
