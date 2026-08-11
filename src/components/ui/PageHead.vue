<script setup>
defineProps({
  title: String,
  subtitle: String,
})
</script>

<template>
  <header class="ph">
    <div class="grow">
      <h1>{{ title }}</h1>
      <p v-if="subtitle" class="muted small">{{ subtitle }}</p>
    </div>
    <div class="wrap-row">
      <slot name="actions" />
    </div>
  </header>
</template>

<style scoped>
.ph {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: var(--s4);
  flex-wrap: wrap;
  margin-bottom: var(--s5);
}
.ph h1 {
  font-size: var(--fs-xl);
}
</style>
