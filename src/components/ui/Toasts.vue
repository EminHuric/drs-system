<script setup>
import { toasts, dismiss } from '@/stores/toast'

const icons = { ok: '✅', bad: '⚠️', info: 'ℹ️' }
</script>

<template>
  <Teleport to="body">
    <div class="toasts" role="status" aria-live="polite">
      <TransitionGroup name="list">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="'toast-' + t.kind">
          <span aria-hidden="true">{{ icons[t.kind] }}</span>
          <span class="grow">{{ t.text }}</span>
          <button class="close" aria-label="Zatvori" @click="dismiss(t.id)">✕</button>
        </div>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.close {
  color: var(--faint);
  font-size: var(--fs-xs);
  padding: 2px 4px;
  border-radius: 4px;
}
.close:hover {
  color: var(--ink);
  background: var(--hover);
}
</style>
