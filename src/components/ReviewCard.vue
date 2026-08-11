<script setup>
// Jedna recenzija — isti izgled kod gosta i u panelu vlasnika.
// Vlasniku se dodatno pojave dugmad za odgovor i sklanjanje.

import { ref } from 'vue'
import StarRating from '@/components/StarRating.vue'
import { ago, initials } from '@/lib/format'
import { reviewerName } from '@/lib/reviews'

defineProps({
  review: { type: Object, required: true },
  now: { type: Number, default: () => Date.now() },
  canManage: Boolean,
  restaurantName: { type: String, default: '' },
})

const emit = defineEmits(['reply', 'hide', 'remove', 'photo'])

const expanded = ref(false)
const LONG = 260
</script>

<template>
  <article class="rev card" :class="{ hidden: review.visible === false }">
    <header class="head">
      <span class="ava">{{ initials(reviewerName(review)) }}</span>

      <div class="grow" style="min-width: 0">
        <div class="wrap-row" style="gap: 6px">
          <strong class="truncate">{{ reviewerName(review) }}</strong>
          <span v-if="review.verified" class="badge badge-ok xs" title="Gost je zaista poručivao">
            ✓ Potvrđena porudžbina
          </span>
          <span v-if="review.visible === false" class="badge badge-bad xs">Sakriveno</span>
        </div>
        <span class="xs faint">{{ ago(review.createdAt, now) }}</span>
      </div>

      <StarRating :model-value="review.rating" readonly :size="15" />
    </header>

    <p v-if="review.text" class="body">
      {{ expanded || review.text.length <= LONG ? review.text : review.text.slice(0, LONG) + '…' }}
      <button v-if="!expanded && review.text.length > LONG" class="more" @click="expanded = true">
        prikaži celo
      </button>
    </p>

    <!-- ── fotografije gosta ──────────────────────────────── -->
    <div v-if="review.photos?.length" class="shots">
      <button
        v-for="(p, i) in review.photos"
        :key="i"
        class="shot"
        :aria-label="`Otvori fotografiju ${i + 1}`"
        @click="emit('photo', { photos: review.photos, index: i })"
      >
        <img :src="p" alt="" loading="lazy" />
      </button>
    </div>

    <!-- ── ocene pojedinih jela ───────────────────────────── -->
    <div v-if="review.itemRatings?.length" class="items">
      <span v-for="ir in review.itemRatings" :key="ir.itemId" class="item-chip">
        {{ ir.name }}
        <StarRating :model-value="ir.rating" readonly :size="11" />
      </span>
    </div>

    <!-- ── odgovor lokala ─────────────────────────────────── -->
    <div v-if="review.reply" class="reply">
      <span class="tag">Odgovor lokala{{ restaurantName ? ' · ' + restaurantName : '' }}</span>
      <p>{{ review.reply }}</p>
    </div>

    <!-- ── radnje vlasnika ────────────────────────────────── -->
    <footer v-if="canManage" class="acts">
      <button class="btn btn-soft btn-sm" @click="emit('reply', review)">
        {{ review.reply ? '✎ Izmeni odgovor' : '↩ Odgovori' }}
      </button>
      <button class="btn btn-ghost btn-sm" @click="emit('hide', review)">
        {{ review.visible === false ? '👁️ Vrati u prikaz' : '🚫 Sakrij' }}
      </button>
      <button class="btn btn-ghost btn-sm danger" @click="emit('remove', review)">
        🗑 Obriši
      </button>
    </footer>
  </article>
</template>

<style scoped>
.acts .danger {
  color: var(--bad);
}

.rev {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding: var(--s4);
}
.rev.hidden {
  opacity: 0.6;
  border-style: dashed;
}

.head {
  display: flex;
  align-items: center;
  gap: var(--s3);
}
.head strong {
  line-height: 1.25;
}
.ava {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--surface-3);
  color: var(--ink-2);
  font-size: var(--fs-sm);
  font-weight: 700;
  flex: none;
}

.body {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.6;
  color: var(--ink-2);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.more {
  color: var(--brand-soft);
  font-weight: 600;
  font-size: var(--fs-xs);
  text-decoration: underline;
}

.shots {
  display: flex;
  gap: var(--s2);
  flex-wrap: wrap;
}
.shot {
  width: 84px;
  height: 84px;
  border-radius: var(--r-sm);
  overflow: hidden;
  border: 1px solid var(--line);
  padding: 0;
  cursor: zoom-in;
  transition: transform var(--fast), border-color var(--fast);
}
.shot:hover {
  transform: scale(1.04);
  border-color: var(--brand);
}
.shot img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.items {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.item-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 3px 9px;
  border-radius: var(--r-full);
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: var(--fs-xs);
  font-weight: 550;
}

.reply {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--s3);
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border-left: 2px solid var(--brand);
}
.reply .tag {
  font-size: var(--fs-xs);
  font-weight: 700;
  color: var(--brand-soft);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.reply p {
  margin: 0;
  font-size: var(--fs-sm);
  line-height: 1.55;
  color: var(--ink-2);
  white-space: pre-wrap;
}

.acts {
  display: flex;
  gap: var(--s2);
  padding-top: var(--s2);
  border-top: 1px solid var(--line);
}
</style>
