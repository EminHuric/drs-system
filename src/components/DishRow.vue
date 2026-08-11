<script setup>
// ─────────────────────────────────────────────────────────────
//  Jelo u meniju — jedan red, puna širina
//
//  Dve kolone na telefonu daju svakom jelu oko 160px: naziv se
//  prelomi, opis se ne pročita, za oznake nema mesta. Red preko
//  cele širine daje naziv u punoj veličini, dva reda opisa, red
//  oznaka i krupnu cenu — a slika od 108px i dalje prodaje jelo.
// ─────────────────────────────────────────────────────────────

import { money } from '@/lib/format'

defineProps({
  item: { type: Object, required: true },
  currency: { type: String, default: 'RSD' },
  tags: { type: Array, default: () => [] },
  qty: { type: Number, default: 0 },
  closed: Boolean,
})

const emit = defineEmits(['open', 'add'])
</script>

<template>
  <button class="dish" @click="emit('open', item)">
    <span class="dish-body">
      <span v-if="tags.length" class="dish-tags">
        <span v-for="t in tags" :key="t.id" class="dtag" :class="'t-' + (t.tone || 'plain')">
          <template v-if="t.icon">{{ t.icon }}</template> {{ t.label }}
        </span>
      </span>

      <strong class="dish-name">{{ item.name }}</strong>
      <span v-if="item.desc" class="dish-desc">{{ item.desc }}</span>

      <span v-if="item.portion || item.prepTime" class="dish-specs">
        <span v-if="item.portion">{{ item.portion }}</span>
        <span v-if="item.prepTime">⏱ {{ item.prepTime }} min</span>
      </span>

      <span class="dish-foot">
        <span class="dish-price">{{ money(item.price, currency) }}</span>
        <s v-if="item.oldPrice > item.price" class="dish-old">
          {{ money(item.oldPrice, currency) }}
        </s>
        <span
          v-if="!closed"
          class="dish-add"
          role="button"
          tabindex="0"
          :aria-label="'Dodaj ' + item.name"
          @click.stop="emit('add', item)"
          @keydown.enter.stop="emit('add', item)"
        >＋</span>
      </span>
    </span>

    <span class="dish-photo">
      <img v-if="item.image" :src="item.image" :alt="item.name" loading="lazy" />
      <span v-else class="dish-fallback">{{ item.emoji || '🍽️' }}</span>
      <span v-if="qty" class="dish-qty">{{ qty }}</span>
    </span>
  </button>
</template>

<style scoped>
.dish {
  display: flex;
  align-items: stretch;
  gap: 0;
  min-height: 118px;
  border-radius: var(--r-md);
  background: var(--surface);
  overflow: hidden;
  text-align: left;
  box-shadow: var(--shadow-sm);
  transition: transform var(--fast), box-shadow var(--fast);
}
.dish:hover {
  box-shadow: var(--shadow);
  transform: translateY(-2px);
}
.dish:active {
  transform: scale(0.99);
}
.dish:hover .dish-photo img {
  transform: scale(1.06);
}

/* ── tekst ── */
.dish-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: var(--s3) var(--s3) var(--s3) var(--s4);
}

.dish-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 1px;
}
.dtag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  border-radius: var(--r-full);
  font-size: 10.5px;
  font-weight: 750;
  letter-spacing: -0.005em;
  white-space: nowrap;
  background: var(--surface-2);
  color: var(--muted);
}
.t-gold {
  background: color-mix(in srgb, #d9a441 16%, transparent);
  color: #a97b19;
}
.t-hot {
  background: color-mix(in srgb, #e2603f 15%, transparent);
  color: #c04a2c;
}
.t-green {
  background: color-mix(in srgb, #3aa76d 15%, transparent);
  color: #2c8154;
}
.t-new {
  background: color-mix(in srgb, #4a7dd6 15%, transparent);
  color: #3963ad;
}
.t-brand {
  background: color-mix(in srgb, var(--b) 15%, transparent);
  color: var(--b);
}
/* U tamnoj temi tamna slova na tamnoj podlozi se ne vide. */
:global([data-theme='dark']) .t-gold {
  color: #f0cd82;
}
:global([data-theme='dark']) .t-hot {
  color: #ff9d7d;
}
:global([data-theme='dark']) .t-green {
  color: #7ddba6;
}
:global([data-theme='dark']) .t-new {
  color: #96b8f0;
}

.dish-name {
  font-size: var(--fs-md);
  font-weight: 680;
  line-height: 1.25;
  letter-spacing: -0.016em;
}
.dish-desc {
  font-size: var(--fs-xs);
  color: var(--muted);
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dish-specs {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 1px;
}
.dish-specs > span {
  font-size: 10px;
  font-weight: 600;
  color: var(--faint);
  white-space: nowrap;
}
.dish-specs > span + span::before {
  content: '·';
  margin-right: 5px;
}

.dish-foot {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: auto;
  padding-top: var(--s2);
}
.dish-price {
  font-size: var(--fs-md);
  font-weight: 800;
  letter-spacing: -0.028em;
  font-variant-numeric: tabular-nums;
}
.dish-old {
  font-size: var(--fs-xs);
  color: var(--faint);
  margin-right: auto;
}
.dish-price:last-of-type {
  margin-right: auto;
}

/* Dugme stoji uz cenu, ne preko fotografije — slika ostaje čista. */
.dish-add {
  width: 38px;
  height: 38px;
  flex: none;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--b);
  color: #fff;
  font-size: 1.05rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  box-shadow: 0 6px 16px -8px var(--b);
  transition: transform var(--fast), box-shadow var(--fast), border-radius var(--fast);
}
.dish-add:hover {
  transform: translateY(-2px);
  border-radius: 17px;
  box-shadow: 0 10px 22px -8px var(--b);
}
.dish-add:active {
  transform: scale(0.9);
}

/* ── slika ── */
.dish-photo {
  position: relative;
  width: 112px;
  flex: none;
  align-self: stretch;
  background: var(--surface-3);
  display: grid;
  place-items: center;
  overflow: hidden;
}
.dish-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s var(--ease);
}
/* Bez fotografije: topla podloga u boji lokala umesto sive rupe. */
.dish-fallback {
  font-size: 2.4rem;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.18));
}
.dish-photo:has(.dish-fallback) {
  background: linear-gradient(145deg, color-mix(in srgb, var(--b) 22%, var(--surface)), var(--surface-3));
}

.dish-qty {
  position: absolute;
  top: 7px;
  right: 7px;
  min-width: 23px;
  height: 23px;
  padding: 0 7px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--ink);
  color: var(--bg);
  font-size: 11.5px;
  font-weight: 800;
}

@media (max-width: 380px) {
  .dish-photo {
    width: 96px;
  }
  .dish-body {
    padding-left: var(--s3);
  }
}
</style>
