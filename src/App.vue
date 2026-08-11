<script setup>
import { RouterView } from 'vue-router'
import Toasts from '@/components/ui/Toasts.vue'

// Ključ je namerno vezan za KORENSKU rutu, ne za punu putanju:
// tako paneli (sa svojim živim pretplatama na bazu) preživljavaju
// kretanje kroz podstranice, a prelaz se svejedno vidi tamo gde treba.
function viewKey(route) {
  return (route.matched[0]?.path || route.path) + (route.params.slug || '')
}
</script>

<template>
  <RouterView v-slot="{ Component, route }">
    <Transition name="fade" mode="out-in">
      <component :is="Component" :key="viewKey(route)" />
    </Transition>
  </RouterView>

  <Toasts />
</template>
