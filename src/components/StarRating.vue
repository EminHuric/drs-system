<script setup>
// Zvezdice — i za prikaz i za unos.
// Kao unos je pravi radiogroup, pa radi i tastaturom i sa čitačem ekrana.

import { computed, ref } from 'vue'
import { RATING_WORDS } from '@/lib/reviews'

const props = defineProps({
  modelValue: { type: Number, default: 0 },
  size: { type: Number, default: 18 },
  readonly: Boolean,
  /** prikaz delimične zvezdice za prosek, npr. 4,3 */
  precise: Boolean,
  label: { type: String, default: 'Ocena' },
})

const emit = defineEmits(['update:modelValue'])

const hover = ref(0)
const shown = computed(() => hover.value || props.modelValue)

function fillOf(i) {
  if (props.readonly && props.precise) {
    const d = props.modelValue - (i - 1)
    return Math.max(0, Math.min(1, d)) * 100
  }
  return shown.value >= i ? 100 : 0
}

function pick(n) {
  if (props.readonly) return
  emit('update:modelValue', n === props.modelValue ? 0 : n)
}
</script>

<template>
  <div
    class="stars"
    :class="{ input: !readonly }"
    :role="readonly ? 'img' : 'radiogroup'"
    :aria-label="readonly ? `${label}: ${modelValue} od 5` : label"
    @mouseleave="hover = 0"
  >
    <component
      :is="readonly ? 'span' : 'button'"
      v-for="i in 5"
      :key="i"
      :type="readonly ? undefined : 'button'"
      class="star"
      :style="{ fontSize: size + 'px' }"
      :role="readonly ? undefined : 'radio'"
      :aria-checked="readonly ? undefined : modelValue === i"
      :aria-label="readonly ? undefined : `${i} — ${RATING_WORDS[i]}`"
      :title="readonly ? undefined : RATING_WORDS[i]"
      @click="pick(i)"
      @mouseenter="!readonly && (hover = i)"
    >
      <span class="bg">★</span>
      <span class="fg" :style="{ width: fillOf(i) + '%' }">★</span>
    </component>

    <span v-if="!readonly && shown" class="word">{{ RATING_WORDS[shown] }}</span>
  </div>
</template>

<style scoped>
.stars {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  line-height: 1;
}
.star {
  position: relative;
  display: inline-block;
  padding: 0;
  background: none;
  border: none;
  line-height: 1;
  color: inherit;
}
.input .star {
  cursor: pointer;
  padding: 2px;
  transition: transform var(--fast);
}
.input .star:hover {
  transform: scale(1.15);
}
.input .star:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 1px;
  border-radius: 3px;
}
.bg {
  color: var(--line-strong);
}
.fg {
  position: absolute;
  inset: 0;
  overflow: hidden;
  color: var(--gold);
  white-space: nowrap;
  transition: width var(--fast);
}
.input .fg {
  left: 2px;
  top: 2px;
}
.word {
  margin-left: var(--s2);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink-2);
}
</style>
