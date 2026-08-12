<script setup>
// ─────────────────────────────────────────────────────────────
//  Jelo u meniju — jedan red, krupna fotografija
//
//  Fotografija je kvadrat, ne kolona rastegnuta na visinu kartice:
//  rastegnuta kolona je sekla široke fotografije u portret i od
//  tanjira ostajala trećina. Kvadrat seče podjednako sa obe strane
//  i jelo se vidi celo.
//
//  Slika stoji levo jer hranu prodaje slika — gost je vidi prvu,
//  a cena i „＋" ostaju desno, pod palcem.
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
  <!--
    Namerno <div role="button">, a ne <button>: Chrome sadržaj dugmeta
    meri po najširem redu i ne da mu da se skupi, pa je naziv jela
    bežao van kartice na uskom ekranu. Tastatura radi isto preko
    role/tabindex/keydown.
  -->
  <div
    class="dish"
    role="button"
    tabindex="0"
    @click="emit('open', item)"
    @keydown.enter="emit('open', item)"
    @keydown.space.prevent="emit('open', item)"
  >
    <span class="dish-photo">
      <img v-if="item.image" :src="item.image" :alt="item.name" loading="lazy" decoding="async" />
      <!--
        Bez fotografije: ako je vlasnik izabrao znak, stoji znak; ako
        nije, stoji početno slovo jela krupno i tiho. Deset istih
        tanjirića jedan ispod drugog izgleda kao da slika fali —
        slovo izgleda kao da je tako i zamišljeno.
      -->
      <span v-else-if="item.emoji" class="dish-fallback">{{ item.emoji }}</span>
      <span v-else class="dish-letter" aria-hidden="true">{{ (item.name || '?').trim().charAt(0) }}</span>
      <span v-if="qty" class="dish-qty">{{ qty }}</span>
    </span>

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
  </div>
</template>

<style scoped>
.dish {
  display: flex;
  align-items: center;
  gap: var(--s3);
  width: 100%;
  min-width: 0;
  padding: 10px;
  border-radius: 22px;
  background: var(--surface);
  border: 1px solid var(--line);
  text-align: left;
  cursor: pointer;
  transition: border-color var(--fast), box-shadow var(--fast), transform var(--fast);
}
.dish:focus-visible {
  outline: 2px solid var(--b);
  outline-offset: 2px;
}
.dish:hover {
  border-color: color-mix(in srgb, var(--b) 35%, var(--line));
  box-shadow: 0 12px 30px -22px rgba(0, 0, 0, 0.55);
  transform: translateY(-1px);
}
.dish:active {
  transform: scale(0.994);
}
.dish:hover .dish-photo img {
  transform: scale(1.05);
}

/* ── fotografija ──────────────────────────────────────
   Kvadrat koji raste sa ekranom: na uskom telefonu ne guta
   tekst, na širokom se ne pretvori u sličicu. */
.dish-photo {
  position: relative;
  width: 124px;
  aspect-ratio: 1;
  flex: none;
  align-self: center;
  border-radius: 17px;
  overflow: hidden;
  background: var(--surface-3);
  display: grid;
  place-items: center;
}
.dish-photo img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: transform 0.55s var(--ease);
}
/* Tanka unutrašnja ivica — fotografija dobija okvir i ne curi
   u pozadinu kartice kad su joj ivice svetle. */
.dish-photo::after {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.07);
  pointer-events: none;
}

/* Bez fotografije: topla podloga u boji lokala umesto sive rupe. */
.dish-fallback {
  font-size: 2.6rem;
  filter: drop-shadow(0 3px 8px rgba(0, 0, 0, 0.18));
}
.dish-photo:has(.dish-fallback),
.dish-photo:has(.dish-letter) {
  background: linear-gradient(145deg, color-mix(in srgb, var(--b) 20%, var(--surface)), var(--surface-3));
}
.dish-letter {
  font-family: var(--font-display, var(--font));
  font-size: 3rem;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.04em;
  color: color-mix(in srgb, var(--b) 55%, transparent);
  text-transform: uppercase;
  user-select: none;
}

.dish-qty {
  position: absolute;
  top: 7px;
  left: 7px;
  min-width: 24px;
  height: 24px;
  padding: 0 7px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--ink);
  color: var(--bg);
  font-size: 12px;
  font-weight: 800;
}

/* ── tekst ── */
.dish-body {
  flex: 1;
  min-width: 0;
  align-self: stretch;
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 2px var(--s2) 2px 0;
}

.dish-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-bottom: 2px;
}
.dtag {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2.5px 7px;
  border-radius: var(--r-full);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.005em;
  white-space: nowrap;
  background: var(--surface-2);
  color: var(--muted);
}
.t-gold {
  background: color-mix(in srgb, #d9a441 15%, transparent);
  color: #9d7317;
}
.t-hot {
  background: color-mix(in srgb, #e2603f 14%, transparent);
  color: #bd472a;
}
.t-green {
  background: color-mix(in srgb, #3aa76d 14%, transparent);
  color: #2a7b50;
}
.t-new {
  background: color-mix(in srgb, #4a7dd6 14%, transparent);
  color: #365ea6;
}
.t-brand {
  background: color-mix(in srgb, var(--b) 14%, transparent);
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
  font-size: 1.02rem;
  font-weight: 680;
  line-height: 1.24;
  letter-spacing: -0.018em;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.dish-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.42;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.dish-specs {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 1px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--faint);
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
  padding-top: 8px;
}
.dish-price {
  font-size: 1.06rem;
  font-weight: 800;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.1;
}
.dish-old {
  font-size: 0.74rem;
  color: var(--faint);
}

/* Dugme stoji uz cenu, ne preko fotografije — slika ostaje čista.
   `margin-left: auto` ga drži uz desnu ivicu i kad stara cena
   postoji i kad je nema. */
.dish-add {
  width: 36px;
  height: 36px;
  flex: none;
  margin-left: auto;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--b);
  color: #fff;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1;
  cursor: pointer;
  transition: transform var(--fast), border-radius var(--fast);
}
.dish-add:hover {
  transform: translateY(-2px);
  border-radius: 16px;
}
.dish-add:active {
  transform: scale(0.88);
}

/* Na starim uskim telefonima slika ustupi malo mesta tekstu; na
   širokom ekranu, gde kartica ide u dve kolone, dobije nazad. */
@media (max-width: 359px) {
  .dish-photo {
    width: 100px;
  }
  .dish-name {
    font-size: 0.96rem;
  }
}
@media (min-width: 760px) {
  .dish-photo {
    width: 128px;
  }
}
</style>
