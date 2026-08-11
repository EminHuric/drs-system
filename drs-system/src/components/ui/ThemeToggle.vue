<script setup>
import { theme, toggleTheme } from '@/stores/theme'
</script>

<template>
  <button
    class="btn btn-ghost btn-icon"
    :aria-label="theme === 'dark' ? 'Uključi svetlu temu' : 'Uključi tamnu temu'"
    :title="theme === 'dark' ? 'Svetla tema' : 'Tamna tema'"
    @click="toggleTheme"
  >
    {{ theme === 'dark' ? '☀️' : '🌙' }}
  </button>
</template>
