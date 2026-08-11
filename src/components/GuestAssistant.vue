<script setup>
// ─────────────────────────────────────────────────────────────
//  Pomoćnik gostu
//
//  Odgovara na pitanja o meniju i preporučuje jela. Predlozi stoje
//  kao dugmad — gost ne mora ništa da kuca da bi dobio korist.
//  Preporučeno jelo se dodaje u korpu jednim dodirom, iz razgovora.
// ─────────────────────────────────────────────────────────────

import { computed, nextTick, ref } from 'vue'
import { money } from '@/lib/format'
import { aiAnswer, buildMenuContext, localAnswer } from '@/lib/assistant'

const props = defineProps({
  rest: { type: Object, required: true },
  items: { type: Array, default: () => [] },
  categories: { type: Array, default: () => [] },
  scores: { type: Object, default: () => ({}) },
  closed: Boolean,
})

const emit = defineEmits(['add', 'open'])

const open = ref(false)
const busy = ref(false)
const text = ref('')
const stream = ref(null)

// Ime koje je vlasnik zadao; ako nije, predstavlja se imenom lokala.
const botName = computed(
  () => (props.rest?.assistantName || '').trim() || props.rest?.name || 'Pomoćnik'
)

const msgs = ref([
  {
    from: 'bot',
    text:
      `Pozdrav, ja sam ${botName.value}! ` +
      'Tu sam da vam pomognem — pitajte me šta imamo, šta bih preporučio, ' +
      'ima li nešto bez mesa ili bilo šta o lokalu. ' +
      'Ako ne budem znao, neko od zaposlenih će vam rado izaći u susret.',
    items: [],
  },
])

const QUICK = [
  'Šta mi preporučujete?',
  'Šta je bez mesa?',
  'Šta se sprema najbrže?',
  'Šta ima do 10 evra?',
]

async function ask(q) {
  const question = (q || text.value).trim()
  if (!question || busy.value) return

  msgs.value.push({ from: 'me', text: question, items: [] })
  text.value = ''
  busy.value = true
  await scroll()

  // Lokalni odgovor je uvek tu i uvek tačan — njime se i jela biraju.
  const local = localAnswer(question, {
    rest: props.rest,
    items: props.items,
    scores: props.scores,
  })

  // Ako je vlasnik uključio AI, tekst dolazi od njega; jela ostaju naša.
  let reply = null
  try {
    reply = await aiAnswer(
      question,
      buildMenuContext(props.rest, props.categories, props.items, props.scores)
    )
  } catch {
    /* svejedno — ide lokalni */
  }

  msgs.value.push({ from: 'bot', text: reply || local.text, items: local.items })
  busy.value = false
  await scroll()
}

async function scroll() {
  await nextTick()
  if (stream.value) stream.value.scrollTop = stream.value.scrollHeight
}

function toggle() {
  open.value = !open.value
  if (open.value) scroll()
}
</script>

<template>
  <!-- dugme -->
  <button v-if="!open" class="fab" aria-label="Pomoćnik" @click="toggle">
    <span class="fab-ico">💬</span>
    <span class="fab-text">Pitaj nas</span>
  </button>

  <!-- razgovor -->
  <Teleport to="body">
    <Transition name="fade">
      <div v-if="open" class="scrim" @click="open = false"></div>
    </Transition>
    <Transition name="sheet">
      <section v-if="open" class="asst" :style="{ '--b': rest.brandColor || '#e2603f' }">
        <header class="asst-head">
          <span class="asst-ava">🍽️</span>
          <div class="grow" style="min-width: 0">
            <strong class="truncate">{{ botName }}</strong>
            <span class="xs faint">odgovara o jelima, cenama i lokalu</span>
          </div>
          <button class="btn btn-ghost btn-icon btn-sm" aria-label="Zatvori" @click="open = false">✕</button>
        </header>

        <div ref="stream" class="asst-stream">
          <div v-for="(m, i) in msgs" :key="i" class="am" :class="m.from">
            <p>{{ m.text }}</p>

            <div v-if="m.items?.length" class="am-items">
              <button
                v-for="it in m.items"
                :key="it.id"
                class="am-item"
                @click="emit('open', it)"
              >
                <span class="am-thumb">
                  <img v-if="it.image" :src="it.image" :alt="it.name" loading="lazy" />
                  <span v-else>{{ it.emoji || '🍽️' }}</span>
                </span>
                <span class="grow">
                  <strong>{{ it.name }}</strong>
                  <em>{{ money(it.price, rest.currency) }}</em>
                </span>
                <span v-if="!closed" class="am-add" @click.stop="emit('add', it)">＋</span>
              </button>
            </div>
          </div>

          <div v-if="busy" class="am bot typing">
            <span></span><span></span><span></span>
          </div>
        </div>

        <div class="asst-quick">
          <button v-for="q in QUICK" :key="q" class="chip" :disabled="busy" @click="ask(q)">
            {{ q }}
          </button>
        </div>

        <!-- Sitna napomena: gost treba da zna sa čim ima posla, ali
             ne toliko krupno da ga odbije od korišćenja. -->
        <p class="asst-note">
          Pomoćnik je u probnom radu — neće znati baš sve. Osoblje je uvek tu.
        </p>

        <form class="asst-form" @submit.prevent="ask()">
          <input v-model="text" class="input" placeholder="Pitajte bilo šta o meniju…" :disabled="busy" />
          <button class="btn btn-primary btn-icon" :disabled="busy || !text.trim()" aria-label="Pošalji">
            ➤
          </button>
        </form>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.fab {
  position: fixed;
  right: var(--s4);
  bottom: calc(env(safe-area-inset-bottom) + 92px);
  z-index: 39;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 11px var(--s4);
  border-radius: var(--r-full);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  box-shadow: var(--shadow-lg);
  font-size: var(--fs-sm);
  font-weight: 650;
  transition: transform var(--fast);
}
.fab:hover {
  transform: translateY(-2px);
}
.fab-ico {
  font-size: 1.05rem;
}
@media (max-width: 420px) {
  .fab-text {
    display: none;
  }
  .fab {
    padding: 12px;
  }
}

.asst {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 92;
  margin-inline: auto;
  width: min(520px, 100%);
  height: min(78dvh, 640px);
  display: flex;
  flex-direction: column;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-bottom: none;
  border-radius: var(--r-lg) var(--r-lg) 0 0;
  box-shadow: var(--shadow-lg);
}

.asst-head {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3) var(--s4);
  border-bottom: 1px solid var(--line);
}
.asst-head strong,
.asst-head .xs {
  display: block;
  line-height: 1.2;
}
.asst-ava {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: color-mix(in srgb, var(--b) 18%, transparent);
  flex: none;
}

.asst-stream {
  flex: 1;
  overflow-y: auto;
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}

.am {
  max-width: 88%;
}
.am p {
  margin: 0;
  padding: 10px var(--s3);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
  line-height: 1.5;
  white-space: pre-wrap;
}
.am.bot {
  align-self: flex-start;
}
.am.bot p {
  background: var(--surface-2);
  border-bottom-left-radius: 5px;
}
.am.me {
  align-self: flex-end;
}
.am.me p {
  background: var(--b);
  color: #fff;
  border-bottom-right-radius: 5px;
}

.typing {
  display: flex;
  gap: 5px;
  padding: 12px var(--s3);
  background: var(--surface-2);
  border-radius: var(--r-md);
  border-bottom-left-radius: 5px;
}
.typing span {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--faint);
  animation: dot 1.1s infinite;
}
.typing span:nth-child(2) {
  animation-delay: 0.16s;
}
.typing span:nth-child(3) {
  animation-delay: 0.32s;
}
@keyframes dot {
  0%, 60%, 100% {
    opacity: 0.35;
    transform: translateY(0);
  }
  30% {
    opacity: 1;
    transform: translateY(-4px);
  }
}

.am-items {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 6px;
}
.am-item {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: 6px;
  border-radius: var(--r);
  border: 1px solid var(--line);
  background: var(--surface);
  text-align: left;
  transition: border-color var(--fast);
}
.am-item:hover {
  border-color: var(--b);
}
.am-item strong {
  display: block;
  font-size: var(--fs-sm);
  line-height: 1.25;
}
.am-item em {
  font-style: normal;
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--b);
}
.am-thumb {
  width: 40px;
  height: 40px;
  border-radius: var(--r-sm);
  background: var(--surface-3);
  display: grid;
  place-items: center;
  overflow: hidden;
  flex: none;
}
.am-thumb img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.am-add {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--b);
  color: #fff;
  font-weight: 700;
  flex: none;
  cursor: pointer;
}

.asst-quick {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding: 0 var(--s4) var(--s2);
  scrollbar-width: none;
}
.asst-quick::-webkit-scrollbar {
  display: none;
}
.asst-quick .chip {
  flex: none;
  font-size: var(--fs-xs);
}

.asst-note {
  margin: 0;
  padding: 0 var(--s4) 6px;
  font-size: 10px;
  line-height: 1.35;
  color: var(--faint);
  text-align: center;
}

.asst-form {
  display: flex;
  gap: var(--s2);
  padding: var(--s3) var(--s4);
  padding-bottom: max(var(--s3), env(safe-area-inset-bottom));
  border-top: 1px solid var(--line);
}
.asst-form .input {
  flex: 1;
}
.asst-form .btn-icon {
  width: 42px;
  height: 42px;
  flex: none;
}
</style>
