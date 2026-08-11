<script setup>
defineProps({
  label: String,
  value: [String, Number],
  hint: String,
  icon: String,
  tone: { type: String, default: '' },
  live: Boolean,
})
</script>

<template>
  <div class="stat card" :class="tone && 'tone-' + tone">
    <div class="row-between">
      <span class="up muted">{{ label }}</span>
      <span v-if="live" class="dot dot-live"></span>
      <span v-else-if="icon" class="ico" aria-hidden="true">{{ icon }}</span>
    </div>
    <strong class="val">{{ value }}</strong>
    <span v-if="hint" class="xs faint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: var(--s4);
  position: relative;
  overflow: hidden;
}
.stat::after {
  content: '';
  position: absolute;
  inset: 0 0 auto 0;
  height: 2px;
  background: var(--line);
}
.tone-ok::after {
  background: var(--ok);
}
.tone-warn::after {
  background: var(--warn);
}
.tone-bad::after {
  background: var(--bad);
}
.tone-brand::after {
  background: var(--brand-grad);
}
.tone-info::after {
  background: var(--info);
}
.val {
  font-size: var(--fs-xl);
  font-weight: 700;
  letter-spacing: -0.03em;
  font-variant-numeric: tabular-nums;
  line-height: 1.15;
}
.ico {
  font-size: var(--fs-md);
  opacity: 0.7;
}
</style>
