<script setup>
// ─────────────────────────────────────────────────────────────
//  Ćaskanje uz porudžbinu — ista komponenta za obe strane.
//
//  Poruke su podkolekcija same porudžbine, pa Firestore pravila
//  jednim uslovom rešavaju ko sme da čita: vlasnik lokala i gost
//  koji je tu porudžbinu napravio. Niko treći.
// ─────────────────────────────────────────────────────────────

import { computed, nextTick, ref, watch } from 'vue'
import {
  addDoc,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db, auth } from '@/firebase'
import { useLiveCollection } from '@/composables/useLive'
import { time } from '@/lib/format'
import { toast, humanError } from '@/stores/toast'
import { blip } from '@/lib/sound'
import { notify } from '@/lib/awake'

const props = defineProps({
  restaurantId: { type: String, required: true },
  orderId: { type: String, required: true },
  /** 'staff' kad piše lokal, 'guest' kad piše gost */
  side: { type: String, required: true },
  disabled: Boolean,
  placeholder: { type: String, default: 'Napišite poruku…' },
  /** naziv koji ide u naslov sistemskog obaveštenja */
  title: { type: String, default: '' },
})

const msgQuery = computed(() =>
  props.restaurantId && props.orderId
    ? query(
        collection(db, 'restaurants', props.restaurantId, 'orders', props.orderId, 'messages'),
        orderBy('createdAt', 'asc'),
        limit(200)
      )
    : null
)

const { items: messages, loading } = useLiveCollection(msgQuery)

const text = ref('')
const sending = ref(false)
const scroller = ref(null)

let lastCount = 0

watch(
  messages,
  async (list) => {
    // Zvuk samo za tuđu poruku, i ne pri prvom učitavanju istorije.
    const last = list[list.length - 1]
    if (lastCount && list.length > lastCount && last && last.from !== props.side) {
      blip()
      // Gost retko drži ekran otvoren dok čeka jelo — sistemsko
      // obaveštenje ga dozove i kad je u drugoj aplikaciji.
      notify(
        props.side === 'guest' ? props.title || 'Poruka iz restorana' : 'Poruka od gosta',
        last.text.slice(0, 120),
        'rds-chat-' + props.orderId
      )
    }
    lastCount = list.length

    await nextTick()
    if (scroller.value) scroller.value.scrollTop = scroller.value.scrollHeight
  },
  { immediate: true }
)

async function send() {
  const body = text.value.trim()
  if (!body || sending.value || props.disabled) return

  sending.value = true
  try {
    await addDoc(
      collection(db, 'restaurants', props.restaurantId, 'orders', props.orderId, 'messages'),
      {
        text: body.slice(0, 2000),
        from: props.side,
        uid: auth.currentUser?.uid || '',
        createdAt: serverTimestamp(),
      }
    )

    // Trag na samoj porudžbini: po njemu se pravi spisak ćaskanja i
    // brojka nepročitanih, bez čitanja svih poruka svih porudžbina.
    updateDoc(doc(db, 'restaurants', props.restaurantId, 'orders', props.orderId), {
      lastMsgAt: serverTimestamp(),
      lastMsgFrom: props.side,
      updatedAt: serverTimestamp(),
    }).catch(() => {})

    text.value = ''
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    sending.value = false
  }
}

const quick =
  props.side === 'staff'
    ? ['Primili smo porudžbinu ✅', 'Stiže za 10 minuta', 'Stiže za 20 minuta', 'Nažalost, to nam je trenutno rasprodato 🙏']
    : ['Hvala!', 'Koliko još treba?', 'Molim vas bez luka', 'Da li može račun?']

function useQuick(q) {
  text.value = q
  send()
}
</script>

<template>
  <div class="chat">
    <div ref="scroller" class="stream">
      <div v-if="loading" class="center muted small" style="padding: var(--s5)">Učitavanje…</div>

      <div v-else-if="!messages.length" class="hello">
        <span aria-hidden="true">💬</span>
        <p class="small muted">
          {{
            side === 'staff'
              ? 'Ovde možete pisati gostu — vidi vašu poruku odmah, bez razmene brojeva.'
              : 'Pitajte osoblje bilo šta o svojoj porudžbini. Odgovor stiže ovde.'
          }}
        </p>
      </div>

      <TransitionGroup v-else name="list" tag="div" class="msgs">
        <div
          v-for="m in messages"
          :key="m.id"
          class="msg"
          :class="m.from === side ? 'mine' : 'theirs'"
        >
          <p>{{ m.text }}</p>
          <span class="xs stamp">{{ time(m.createdAt) }}</span>
        </div>
      </TransitionGroup>
    </div>

    <div v-if="!disabled" class="quick">
      <button v-for="q in quick" :key="q" class="chip" @click="useQuick(q)">{{ q }}</button>
    </div>

    <form class="composer" @submit.prevent="send">
      <input
        v-model="text"
        class="input"
        :placeholder="disabled ? 'Ćaskanje je zatvoreno' : placeholder"
        :disabled="disabled || sending"
        maxlength="2000"
      />
      <button
        class="btn btn-primary btn-icon"
        :class="sending && 'btn-spin'"
        :disabled="disabled || sending || !text.trim()"
        aria-label="Pošalji"
      >
        ➤
      </button>
    </form>
  </div>
</template>

<style scoped>
.chat {
  display: flex;
  flex-direction: column;
  min-height: 0;
  height: 100%;
  gap: var(--s3);
}

.stream {
  flex: 1;
  overflow-y: auto;
  min-height: 160px;
  padding: var(--s3);
  background: var(--surface-2);
  border-radius: var(--r);
  border: 1px solid var(--line);
}

.hello {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s6) var(--s4);
  text-align: center;
}
.hello span {
  font-size: 2rem;
  opacity: 0.55;
}
.hello p {
  max-width: 34ch;
}

.msgs {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.msg {
  max-width: 78%;
  padding: var(--s2) var(--s3);
  border-radius: var(--r-md);
  font-size: var(--fs-sm);
  line-height: 1.45;
  position: relative;
  word-break: break-word;
}
.msg p {
  margin: 0;
  white-space: pre-wrap;
}
.mine {
  align-self: flex-end;
  background: var(--brand);
  color: #fff;
  border-bottom-right-radius: 5px;
}
.theirs {
  align-self: flex-start;
  background: var(--surface-3);
  color: var(--ink);
  border-bottom-left-radius: 5px;
}
.stamp {
  display: block;
  text-align: right;
  opacity: 0.65;
  margin-top: 2px;
}

.quick {
  display: flex;
  gap: 6px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}
.quick::-webkit-scrollbar {
  display: none;
}
.quick .chip {
  flex: none;
  font-size: var(--fs-xs);
}

.composer {
  display: flex;
  gap: var(--s2);
}
.composer .input {
  flex: 1;
}
.composer .btn-icon {
  width: 42px;
  height: 42px;
  flex: none;
}
</style>
