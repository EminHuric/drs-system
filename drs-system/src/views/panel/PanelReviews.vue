<script setup>
// ─────────────────────────────────────────────────────────────
//  Ocene i utisci gostiju
//
//  Vlasnik odgovara i sklanja neprimereno, ali NE može da obriše
//  recenziju — to je namerno. Ocene koje se mogu brisati ne vrede
//  ništa ni gostima ni lokalu.
// ─────────────────────────────────────────────────────────────

import { computed, ref } from 'vue'
import { doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '@/firebase'
import { restaurant, isBlocked } from '@/stores/auth'
import { usePanelData } from '@/composables/usePanelData'
import { useTicker } from '@/composables/useLive'
import PageHead from '@/components/ui/PageHead.vue'
import StatCard from '@/components/ui/StatCard.vue'
import Empty from '@/components/ui/Empty.vue'
import Modal from '@/components/ui/Modal.vue'
import StarRating from '@/components/StarRating.vue'
import ReviewCard from '@/components/ReviewCard.vue'
import PhotoViewer from '@/components/PhotoViewer.vue'
import { toast, humanError } from '@/stores/toast'
import { num } from '@/lib/format'
import { byItem, fmtRating, summarize } from '@/lib/reviews'
import { guestUrl } from '@/lib/restaurant'

const { reviews, items, reviewsError } = usePanelData()

const off = computed(() => restaurant.value?.reviewsEnabled === false)
const rulesMissing = computed(() => reviewsError.value?.code === 'permission-denied')
const now = useTicker(60000)

const filter = ref('all')

const stats = computed(() => summarize(reviews.value))

const needsReply = computed(() =>
  reviews.value.filter((r) => r.visible !== false && !r.reply && r.rating <= 3)
)

const shown = computed(() => {
  if (filter.value === 'unanswered') return reviews.value.filter((r) => !r.reply && r.visible !== false)
  if (filter.value === 'low') return reviews.value.filter((r) => r.rating <= 3)
  if (filter.value === 'photos') return reviews.value.filter((r) => r.photos?.length)
  if (filter.value === 'hidden') return reviews.value.filter((r) => r.visible === false)
  return reviews.value.filter((r) => r.visible !== false)
})

// Najbolje i najslabije ocenjena jela — direktan povod da vlasnik
// nekom jelu doda bedž „Najbolje ocenjeno" ili da ga skloni iz ponude.
const itemScores = computed(() => {
  const map = byItem(reviews.value)
  const named = Object.entries(map).map(([id, v]) => ({
    id,
    name: items.value.find((i) => i.id === id)?.name || v.name || 'Artikal',
    avg: v.avg,
    count: v.count,
  }))
  return named.filter((i) => i.count >= 1).sort((a, b) => b.avg - a.avg)
})

// ── odgovor ──────────────────────────────────────────────────

const replyTo = ref(null)
const replyText = ref('')
const busy = ref(false)

function openReply(r) {
  replyTo.value = r
  replyText.value = r.reply || ''
}

async function saveReply() {
  busy.value = true
  try {
    await updateDoc(doc(db, 'restaurants', restaurant.value.id, 'reviews', replyTo.value.id), {
      reply: replyText.value.trim().slice(0, 1000),
      replyAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    })
    toast.ok('Odgovor je objavljen.')
    replyTo.value = null
  } catch (e) {
    toast.error(humanError(e))
  } finally {
    busy.value = false
  }
}

async function toggleHide(r) {
  try {
    await updateDoc(doc(db, 'restaurants', restaurant.value.id, 'reviews', r.id), {
      visible: r.visible === false,
      updatedAt: serverTimestamp(),
    })
    toast.ok(r.visible === false ? 'Recenzija je vraćena u prikaz.' : 'Recenzija je sakrivena.')
  } catch (e) {
    toast.error(humanError(e))
  }
}

const viewer = ref(null)

const QUICK = [
  'Hvala vam na poseti i na utisku! 🙏',
  'Hvala na oceni — radujemo se sledećoj poseti.',
  'Žao nam je zbog lošeg iskustva. Javite nam se da ispravimo.',
  'Hvala na iskrenoj kritici — prosledili smo je kuhinji.',
]
</script>

<template>
  <div>
    <PageHead title="Ocene i utisci" subtitle="Šta gosti pišu o vašem lokalu — i vaš odgovor na to.">
      <template #actions>
        <a
          v-if="restaurant?.slug"
          class="btn btn-soft btn-sm"
          :href="guestUrl(restaurant.slug) + '#ocene'"
          target="_blank"
          rel="noopener"
        >
          ↗ Kako gosti vide
        </a>
      </template>
    </PageHead>

    <div v-if="isBlocked" class="note note-bad" style="margin-bottom: var(--s4)">
      <div><strong>Nalog je blokiran</strong> — recenzije možete da čitate, ali ne i da odgovarate.</div>
    </div>

    <div v-if="off" class="note note-warn" style="margin-bottom: var(--s4)">
      <div>
        <strong>Ocene su isključene.</strong> Gosti ih ne vide i ne mogu da ih ostave. Uključuju se
        u Podešavanjima → Izgled za goste. Sve ostalo u lokalu radi normalno.
      </div>
    </div>

    <div v-else-if="rulesMissing" class="note note-info" style="margin-bottom: var(--s4)">
      <div>
        <strong>Ocene još nisu aktivirane na bazi.</strong> Naručivanje radi normalno — ovaj
        odeljak proradi sam čim RDS tim objavi pravila za ocene. Ne morate ništa da radite.
      </div>
    </div>

    <!-- ── brojke ──────────────────────────────────────── -->
    <div class="stats">
      <StatCard
        label="Prosečna ocena"
        :value="stats.count ? fmtRating(stats.avg) + ' / 5' : '—'"
        tone="brand"
        :hint="stats.count ? stats.count + ' ocena' : 'još nema ocena'"
      />
      <StatCard label="Ukupno utisaka" :value="num(stats.count)" tone="info" icon="💬" />
      <StatCard label="Sa fotografijom" :value="num(stats.withPhotos)" icon="📷" />
      <StatCard
        label="Čeka odgovor"
        :value="num(needsReply.length)"
        :tone="needsReply.length ? 'warn' : ''"
        icon="↩"
      />
    </div>

    <Empty
      v-if="!reviews.length"
      icon="⭐"
      title="Još nema nijedne ocene"
      text="Gosti ostavljaju utisak sa stranice vašeg menija i posle svake završene porudžbine. Prve ocene obično stignu istog dana kad počnete da radite."
      class="panel"
      style="margin-top: var(--s5)"
    />

    <div v-else class="layout">
      <div class="main">
        <!-- ── filteri ─────────────────────────────────── -->
        <div class="seg" style="margin-bottom: var(--s4)">
          <button :class="{ on: filter === 'all' }" @click="filter = 'all'">
            Sve <span class="faint">{{ stats.count }}</span>
          </button>
          <button :class="{ on: filter === 'unanswered' }" @click="filter = 'unanswered'">
            Bez odgovora
          </button>
          <button :class="{ on: filter === 'low' }" @click="filter = 'low'">Niske ocene</button>
          <button :class="{ on: filter === 'photos' }" @click="filter = 'photos'">Sa slikama</button>
          <button :class="{ on: filter === 'hidden' }" @click="filter = 'hidden'">Sakrivene</button>
        </div>

        <Empty v-if="!shown.length" icon="🔍" title="Nema recenzija u ovom filteru" />

        <div v-else class="list">
          <ReviewCard
            v-for="r in shown"
            :key="r.id"
            :review="r"
            :now="now"
            :restaurant-name="restaurant?.name"
            :can-manage="!isBlocked"
            @reply="openReply"
            @hide="toggleHide"
            @photo="viewer = $event"
          />
        </div>
      </div>

      <!-- ── bočno ───────────────────────────────────── -->
      <aside class="side">
        <section class="panel">
          <div class="card-head"><h4>Raspodela ocena</h4></div>
          <div class="dist">
            <div v-for="n in [5, 4, 3, 2, 1]" :key="n" class="dist-row">
              <span class="dist-n small">{{ n }} ★</span>
              <span class="dist-track">
                <span
                  class="dist-fill"
                  :style="{ width: (stats.count ? (stats.dist[n] / stats.count) * 100 : 0) + '%' }"
                ></span>
              </span>
              <span class="dist-c xs faint">{{ stats.dist[n] }}</span>
            </div>
          </div>
        </section>

        <section v-if="itemScores.length" class="panel">
          <div class="card-head"><h4>Ocene po jelu</h4></div>
          <ul class="scores">
            <li v-for="i in itemScores.slice(0, 10)" :key="i.id">
              <span class="grow truncate small">{{ i.name }}</span>
              <StarRating :model-value="i.avg" readonly precise :size="12" />
              <span class="xs faint mono">{{ fmtRating(i.avg) }} · {{ i.count }}</span>
            </li>
          </ul>
          <p class="hint" style="padding: 0 var(--s4) var(--s4)">
            Jelu na vrhu vredi dodati bedž <strong>„Najbolje ocenjeno"</strong> u Meniju — gosti ga
            tada prvo primete.
          </p>
        </section>
      </aside>
    </div>

    <!-- ── odgovor ─────────────────────────────────────── -->
    <Modal v-if="replyTo" title="Odgovor na recenziju" :busy="busy" @close="replyTo = null">
      <div class="quoted">
        <StarRating :model-value="replyTo.rating" readonly :size="14" />
        <p class="small muted">{{ replyTo.text || '(bez teksta)' }}</p>
      </div>

      <div class="field">
        <label class="label">Vaš odgovor</label>
        <textarea
          v-model="replyText"
          class="textarea"
          maxlength="1000"
          placeholder="Hvala vam na utisku…"
        ></textarea>
        <span class="hint">Odgovor je javan i stoji ispod recenzije. {{ replyText.length }} / 1000</span>
      </div>

      <div class="wrap-row">
        <button v-for="q in QUICK" :key="q" class="chip" @click="replyText = q">{{ q }}</button>
      </div>

      <div class="note note-info small">
        <div>
          Odgovor na lošu ocenu često vredi više od same ocene — gosti gledaju kako lokal reaguje
          kad nešto ne valja.
        </div>
      </div>

      <template #foot>
        <button class="btn btn-ghost" :disabled="busy" @click="replyTo = null">Odustani</button>
        <button
          class="btn btn-primary"
          :class="busy && 'btn-spin'"
          :disabled="busy || !replyText.trim()"
          @click="saveReply"
        >
          Objavi odgovor
        </button>
      </template>
    </Modal>

    <PhotoViewer
      v-if="viewer"
      :photos="viewer.photos"
      :start="viewer.index"
      @close="viewer = null"
    />
  </div>
</template>

<style scoped>
.stats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(168px, 100%), 1fr));
  gap: var(--s3);
  margin-bottom: var(--s5);
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
.main {
  min-width: 0;
}
.list {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
}
.side {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  position: sticky;
  top: calc(var(--header-h) + var(--s4));
}

.dist {
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.dist-row {
  display: flex;
  align-items: center;
  gap: var(--s2);
}
.dist-n {
  width: 30px;
  flex: none;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.dist-track {
  flex: 1;
  height: 7px;
  border-radius: var(--r-full);
  background: var(--surface-2);
  overflow: hidden;
}
.dist-fill {
  display: block;
  height: 100%;
  background: var(--gold);
  border-radius: var(--r-full);
  transition: width var(--slow);
}
.dist-c {
  width: 22px;
  text-align: right;
  flex: none;
  font-variant-numeric: tabular-nums;
}

.scores {
  list-style: none;
  margin: 0;
  padding: var(--s4);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}
.scores li {
  display: flex;
  align-items: center;
  gap: var(--s2);
}

.quoted {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
  border-left: 2px solid var(--line-strong);
}
.quoted p {
  white-space: pre-wrap;
}
</style>
