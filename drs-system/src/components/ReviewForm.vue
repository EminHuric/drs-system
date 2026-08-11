<script setup>
// ─────────────────────────────────────────────────────────────
//  Ostavljanje utiska
//
//  Otvara se sa stranice lokala ili posle završene porudžbine.
//  Kad dolazi sa porudžbine, gost usput oceni i pojedina jela, a
//  recenzija dobija značku „potvrđena porudžbina" — nju pravila
//  dodeljuju samo ako je porudžbina zaista njegova.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { addDoc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '@/firebase'
import { ensureGuestSession } from '@/stores/auth'
import Modal from '@/components/ui/Modal.vue'
import StarRating from '@/components/StarRating.vue'
import { toast, humanError } from '@/stores/toast'
import { compressReviewPhoto } from '@/lib/image'
import { RATING_WORDS } from '@/lib/reviews'

const props = defineProps({
  restaurantId: { type: String, required: true },
  restaurantName: { type: String, default: '' },
  /** ako je prosleđena, recenzija se vezuje za porudžbinu */
  order: { type: Object, default: null },
})

const emit = defineEmits(['close', 'done'])

const MAX_PHOTOS = 3

const rating = ref(0)
const text = ref('')
const name = ref(props.order?.guest?.name || loadName())
const photos = ref([])
const busy = ref(false)
const imgBusy = ref(false)
const error = ref('')

// Jela iz porudžbine, bez duplikata i bez „poziva konobaru".
const orderItems = computed(() => {
  const seen = new Map()
  for (const l of props.order?.lines || []) {
    if (!l.itemId || l.itemId === 'call') continue
    if (!seen.has(l.itemId)) seen.set(l.itemId, { itemId: l.itemId, name: l.name, rating: 0 })
  }
  return [...seen.values()]
})

const itemRatings = ref(orderItems.value.map((i) => ({ ...i })))

function loadName() {
  try {
    return JSON.parse(localStorage.getItem('rds.guest') || '{}').name || ''
  } catch {
    return ''
  }
}

async function addPhotos(e) {
  const files = Array.from(e.target.files || [])
  e.target.value = ''
  if (!files.length) return

  const room = MAX_PHOTOS - photos.value.length
  if (room <= 0) return toast.info(`Najviše ${MAX_PHOTOS} fotografije.`)

  imgBusy.value = true
  try {
    for (const f of files.slice(0, room)) {
      photos.value.push(await compressReviewPhoto(f))
    }
  } catch (err) {
    toast.error(err.message || 'Fotografija nije mogla da se obradi.')
  } finally {
    imgBusy.value = false
  }
}

async function submit() {
  error.value = ''
  if (!rating.value) return (error.value = 'Izaberite ocenu od 1 do 5 zvezdica.')

  busy.value = true
  try {
    const u = await ensureGuestSession()
    const rated = itemRatings.value.filter((i) => i.rating > 0)

    await addDoc(collection(db, 'restaurants', props.restaurantId, 'reviews'), {
      guestUid: u.uid,
      guestName: name.value.trim().slice(0, 40),
      rating: rating.value,
      text: text.value.trim().slice(0, 1500),
      photos: photos.value,
      itemRatings: rated.map((i) => ({ itemId: i.itemId, name: i.name, rating: i.rating })),
      orderId: props.order?.id || '',
      orderCode: props.order?.code || '',
      verified: Boolean(props.order?.id),
      visible: true,
      reply: '',
      replyAt: null,
      createdAt: serverTimestamp(),
    })

    // Zapamti ime da ga ne kuca svaki put.
    try {
      const g = JSON.parse(localStorage.getItem('rds.guest') || '{}')
      localStorage.setItem('rds.guest', JSON.stringify({ ...g, name: name.value.trim() }))
      if (props.order?.id) localStorage.setItem(`rds.reviewed.${props.order.id}`, '1')
    } catch {
      /* privatni režim */
    }

    toast.ok('Hvala na utisku!')
    emit('done')
  } catch (e) {
    error.value = humanError(e)
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Modal title="Kakav je bio vaš utisak?" :busy="busy" @close="emit('close')">
    <div class="rate">
      <StarRating v-model="rating" :size="34" label="Ukupna ocena" />
      <p v-if="rating" class="small muted">{{ RATING_WORDS[rating] }}</p>
      <p v-else class="hint">Dodirnite zvezdice</p>
    </div>

    <div v-if="order" class="note note-ok small">
      <div>
        Recenzija se vezuje za porudžbinu <strong>#{{ order.code }}</strong> i dobija oznaku
        <strong>„Potvrđena porudžbina"</strong> — gosti tako znaju da je stvarna.
      </div>
    </div>

    <div class="field">
      <label class="label">Napišite par reči</label>
      <textarea
        v-model="text"
        class="textarea"
        maxlength="1500"
        placeholder="Kakva je bila hrana, usluga, ambijent? Šta biste preporučili drugima?"
      ></textarea>
      <span class="hint">{{ text.length }} / 1500</span>
    </div>

    <!-- ── fotografije ────────────────────────────────────── -->
    <div class="field">
      <label class="label">Fotografije <span class="faint">(do {{ MAX_PHOTOS }})</span></label>

      <div class="shots">
        <div v-for="(p, i) in photos" :key="i" class="shot">
          <img :src="p" alt="" />
          <button class="rm" aria-label="Ukloni fotografiju" @click="photos.splice(i, 1)">✕</button>
        </div>

        <label v-if="photos.length < MAX_PHOTOS" class="add" :class="{ busy: imgBusy }">
          <span v-if="imgBusy" class="spinner"></span>
          <template v-else>
            <span class="plus">📷</span>
            <span class="xs">Dodaj</span>
          </template>
          <input type="file" accept="image/*" multiple hidden :disabled="imgBusy" @change="addPhotos" />
        </label>
      </div>
      <span class="hint">Slika jela govori više od opisa — i najviše pomaže drugim gostima.</span>
    </div>

    <!-- ── ocene jela iz porudžbine ───────────────────────── -->
    <div v-if="itemRatings.length" class="field">
      <label class="label">Ocenite šta ste jeli <span class="faint">(nije obavezno)</span></label>
      <ul class="items">
        <li v-for="it in itemRatings" :key="it.itemId">
          <span class="grow truncate small">{{ it.name }}</span>
          <StarRating v-model="it.rating" :size="17" :label="`Ocena za ${it.name}`" />
        </li>
      </ul>
    </div>

    <div class="field">
      <label class="label">Vaše ime</label>
      <input v-model="name" class="input" maxlength="40" placeholder="Marko" />
      <span class="hint">Prikazuje se uz recenziju. Ostavite prazno i pisaće „Gost".</span>
    </div>

    <p v-if="error" class="note note-bad small">{{ error }}</p>

    <template #foot>
      <button class="btn btn-ghost" :disabled="busy" @click="emit('close')">Odustani</button>
      <button
        class="btn btn-primary grow"
        :class="busy && 'btn-spin'"
        :disabled="busy || !rating"
        @click="submit"
      >
        Objavi utisak
      </button>
    </template>
  </Modal>
</template>

<style scoped>
.rate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s2);
  padding: var(--s4) 0 var(--s2);
}

.shots {
  display: flex;
  flex-wrap: wrap;
  gap: var(--s2);
}
.shot {
  position: relative;
  width: 88px;
  height: 88px;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 1px solid var(--line);
}
.shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.rm {
  position: absolute;
  top: 3px;
  right: 3px;
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(0, 0, 0, 0.62);
  color: #fff;
  font-size: 11px;
}
.rm:hover {
  background: var(--bad);
}

.add {
  width: 88px;
  height: 88px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-radius: var(--r-sm);
  border: 1px dashed var(--line-strong);
  background: var(--surface-2);
  color: var(--muted);
  cursor: pointer;
  transition: all var(--fast);
}
.add:hover {
  border-color: var(--brand);
  color: var(--brand-soft);
}
.add.busy {
  cursor: wait;
}
.plus {
  font-size: 1.3rem;
}

.items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}
.items li {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2) var(--s3);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
</style>
