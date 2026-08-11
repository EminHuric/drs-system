<script setup>
import { computed } from 'vue'
import DashShell from '@/components/DashShell.vue'
import { isSuper } from '@/stores/auth'

const nav = computed(() => {
  const items = [
    { to: { name: 'admin' }, label: 'Pregled', icon: '📊', exact: true },
    { to: { name: 'admin-restaurants' }, label: 'Restorani', icon: '🏪' },
  ]
  // Administratore pravi i uklanja isključivo vlasnik platforme.
  if (isSuper.value) items.push({ to: { name: 'admin-team' }, label: 'Administratori', icon: '🛡️' })
  return items
})
</script>

<template>
  <DashShell
    :nav="nav"
    :role-label="isSuper ? 'Vlasnik platforme' : 'Administrator'"
    brand-name="RDS platforma"
    brand-icon="🛠️"
  >
    <template #topbar>
      <span class="badge badge-brand">
        <span class="dot dot-live"></span>
        Administracija
      </span>
    </template>
  </DashShell>
</template>
