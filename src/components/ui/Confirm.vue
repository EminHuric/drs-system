<script setup>
import Modal from './Modal.vue'

defineProps({
  title: { type: String, default: 'Da li ste sigurni?' },
  text: { type: String, default: '' },
  confirmLabel: { type: String, default: 'Potvrdi' },
  cancelLabel: { type: String, default: 'Odustani' },
  danger: Boolean,
  busy: Boolean,
})
const emit = defineEmits(['confirm', 'cancel'])
</script>

<template>
  <Modal :title="title" :busy="busy" @close="emit('cancel')">
    <p v-if="text" class="muted" style="line-height: 1.6">{{ text }}</p>
    <slot />

    <template #foot>
      <button class="btn btn-ghost" :disabled="busy" @click="emit('cancel')">
        {{ cancelLabel }}
      </button>
      <button
        class="btn"
        :class="[danger ? 'btn-danger' : 'btn-primary', busy && 'btn-spin']"
        :disabled="busy"
        @click="emit('confirm')"
      >
        {{ confirmLabel }}
      </button>
    </template>
  </Modal>
</template>
