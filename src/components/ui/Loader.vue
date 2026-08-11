<script setup>
defineProps({ text: { type: String, default: 'Učitavanje…' } })
</script>

<template>
  <div class="loading-page">
    <div class="spinner"></div>
    <p class="small muted">{{ text }}</p>
  </div>
</template>
