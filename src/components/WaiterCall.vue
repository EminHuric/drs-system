<script setup>
// ─────────────────────────────────────────────────────────────
//  Doziv konobara — ekran koji se ne može prevideti
//
//  Preklapa ceo panel, zvoni i vibrira dok neko ne pritisne „Idem".
//  Namerno nema dugme za zatvaranje: poziv se sklanja tek kad ga
//  neko stvarno preuzme, inače bi se izgubio među porudžbinama.
// ─────────────────────────────────────────────────────────────

import { ref } from 'vue'
import { setStatus } from '@/lib/orders'
import { toast, humanError } from '@/stores/toast'
import { ago } from '@/lib/format'
import { useTicker } from '@/composables/useLive'

const props = defineProps({
  calls: { type: Array, required: true },
  restaurantId: { type: String, required: true },
})

const emit = defineEmits(['accepted'])

const now = useTicker(1000)
const busy = ref('')

async function accept(call) {
  busy.value = call.id
  try {
    await setStatus(props.restaurantId, call, 'done')
    toast.ok(`Sto ${call.tableLabel} — poziv preuzet.`)
    emit('accepted', call)
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = ''
  }
}
</script>

<template>
  <Teleport to="body">
    <div class="call-scrim" role="alertdialog" aria-modal="true" aria-label="Gost doziva konobara">
      <div class="call-box">
        <div class="pulse" aria-hidden="true">
          <span class="bell">🔔</span>
        </div>

        <h2>{{ calls.length === 1 ? 'Gost doziva konobara' : `${calls.length} gostiju doziva konobara` }}</h2>

        <ul class="list">
          <li v-for="c in calls" :key="c.id">
            <div class="grow">
              <strong>Sto {{ c.tableLabel || '—' }}</strong>
              <span class="xs">
                {{ c.zoneName ? c.zoneName + ' · ' : '' }}{{ ago(c.createdAt, now) }}
                <template v-if="c.guest?.name"> · {{ c.guest.name }}</template>
              </span>
            </div>
            <button
              class="btn btn-lg go"
              :class="busy === c.id && 'btn-spin'"
              :disabled="busy === c.id"
              @click="accept(c)"
            >
              Idem
            </button>
          </li>
        </ul>

        <p class="xs note-line">
          Zvoni dok neko ne preuzme poziv. Pritisnite <strong>Idem</strong> kad krenete do stola.
        </p>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.call-scrim {
  position: fixed;
  inset: 0;
  z-index: 400;
  display: grid;
  place-items: center;
  padding: var(--s4);
  background: rgba(8, 4, 4, 0.9);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  animation: fade-in 0.2s var(--ease);
}

.call-box {
  width: min(560px, 100%);
  max-height: 92dvh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s4);
  padding: var(--s6) var(--s5);
  border-radius: var(--r-lg);
  background: var(--surface);
  border: 2px solid var(--warn);
  box-shadow: 0 0 80px -20px var(--warn), var(--shadow-lg);
  text-align: center;
}

.pulse {
  position: relative;
  width: 88px;
  height: 88px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--tint-warn);
  flex: none;
}
/* Prsten koji se širi — pokret privlači oko i sa druge strane sale. */
.pulse::before,
.pulse::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--warn);
  animation: ring 1.8s ease-out infinite;
}
.pulse::after {
  animation-delay: 0.9s;
}
@keyframes ring {
  0% {
    transform: scale(1);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.9);
    opacity: 0;
  }
}
.bell {
  font-size: 2.4rem;
  animation: shake 1.1s ease-in-out infinite;
}
@keyframes shake {
  0%, 100% { transform: rotate(0); }
  20% { transform: rotate(14deg); }
  40% { transform: rotate(-12deg); }
  60% { transform: rotate(8deg); }
  80% { transform: rotate(-5deg); }
}

h2 {
  font-size: var(--fs-xl);
  color: var(--ink);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}
.list li {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-radius: var(--r);
  background: var(--surface-2);
  border: 1px solid var(--line);
  text-align: left;
}
.list strong {
  display: block;
  font-size: var(--fs-lg);
  line-height: 1.2;
}
.list .xs {
  color: var(--muted);
}

.go {
  background: var(--warn);
  color: #24170a;
  font-weight: 750;
  flex: none;
  min-width: 104px;
}
.go:hover:not(:disabled) {
  filter: brightness(1.08);
}

.note-line {
  color: var(--muted);
  max-width: 44ch;
}

@media (max-width: 480px) {
  .call-box {
    padding: var(--s5) var(--s4);
  }
  .list li {
    flex-direction: column;
    align-items: stretch;
    gap: var(--s2);
  }
  .go {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .pulse::before,
  .pulse::after,
  .bell {
    animation: none;
  }
}
</style>
