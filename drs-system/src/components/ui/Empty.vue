<script setup>
defineProps({
  icon: { type: String, default: '🗒️' },
  title: { type: String, default: 'Nema podataka' },
  text: { type: String, default: '' },
})
</script>

<template>
  <div class="empty">
    <div class="empty-icon" aria-hidden="true">{{ icon }}</div>
    <h4>{{ title }}</h4>
    <p v-if="text" class="small" style="max-width: 42ch">{{ text }}</p>
    <slot />
  </div>
</template>
