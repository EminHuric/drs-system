<script setup>
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import AuthShell from '@/components/AuthShell.vue'
import { role } from '@/stores/auth'
import { homeFor } from '@/router'

const home = computed(() => homeFor(role.value))
</script>

<template>
  <AuthShell
    title="Ova stranica ne postoji"
    subtitle="Adresa je pogrešna ili je sadržaj u međuvremenu uklonjen."
  >
    <div class="big" aria-hidden="true">🔍</div>
    <RouterLink :to="home" class="btn btn-primary btn-lg btn-block">Nazad na početak</RouterLink>
  </AuthShell>
</template>

<style scoped>
.big {
  font-size: 3.5rem;
  text-align: center;
  opacity: 0.6;
}
</style>
