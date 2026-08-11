<script setup>
// ─────────────────────────────────────────────────────────────
//  Okvir svakog panela: bočni meni + traka na vrhu + sadržaj.
//  Isti okvir koristi i RDS admin i vlasnik lokala — razlikuju se
//  samo stavke menija i zaglavlje.
// ─────────────────────────────────────────────────────────────

import { ref, watch } from 'vue'
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { displayName, signOut } from '@/stores/auth'
import { initials } from '@/lib/format'

defineProps({
  /** [{ to, label, icon, badge? , exact? }] */
  nav: { type: Array, required: true },
  roleLabel: { type: String, default: '' },
  brandName: { type: String, default: '' },
  brandIcon: { type: String, default: '' },
})

const route = useRoute()
const router = useRouter()

const drawer = ref(false)
const menu = ref(false)

watch(() => route.fullPath, () => (drawer.value = false))

// Podstranica treba da osvetli svoju stavku u meniju: /admin/restorani/abc
// pripada stavci /admin/restorani. Zato poređenje po prefiksu, a `exact`
// za korenske stavke koje bi inače bile večno aktivne.
function isActive(item) {
  const path = router.resolve(item.to).path
  if (item.exact) return route.path === path
  return route.path === path || route.path.startsWith(path + '/')
}

async function logout() {
  await signOut()
  router.replace({ name: 'login' })
}
</script>

<template>
  <div class="shell">
    <!-- ── bočni meni ────────────────────────────────────── -->
    <aside class="side" :class="{ open: drawer }">
      <div class="side-top">
        <RouterLink to="/" aria-label="RDS početna"><Logo :size="32" /></RouterLink>
        <button class="btn btn-ghost btn-icon btn-sm only-mobile" aria-label="Zatvori meni" @click="drawer = false">
          ✕
        </button>
      </div>

      <div v-if="brandName" class="brand">
        <span class="brand-icon" aria-hidden="true">{{ brandIcon || '🍽️' }}</span>
        <div class="grow" style="min-width: 0">
          <strong class="truncate small">{{ brandName }}</strong>
          <span class="xs faint">{{ roleLabel }}</span>
        </div>
      </div>

      <nav class="nav">
        <RouterLink
          v-for="n in nav"
          :key="n.to.name || n.to"
          :to="n.to"
          class="nav-item"
          :class="{ on: isActive(n) }"
        >
          <span class="nav-icon" aria-hidden="true">{{ n.icon }}</span>
          <span class="grow truncate">{{ n.label }}</span>
          <span v-if="n.badge" class="nav-badge">{{ n.badge }}</span>
        </RouterLink>
      </nav>

      <div class="side-bottom">
        <slot name="side-bottom" />

        <div class="user" @click="menu = !menu">
          <span class="avatar avatar-brand">{{ initials(displayName) }}</span>
          <div class="grow" style="min-width: 0">
            <strong class="truncate small">{{ displayName }}</strong>
            <span class="xs faint">{{ roleLabel }}</span>
          </div>
          <span class="xs faint">{{ menu ? '▾' : '▸' }}</span>
        </div>

        <Transition name="fade">
          <div v-if="menu" class="user-menu">
            <ThemeToggle />
            <button class="btn btn-ghost btn-sm grow" @click="logout">Odjava</button>
          </div>
        </Transition>
      </div>
    </aside>

    <Transition name="fade">
      <div v-if="drawer" class="scrim only-mobile" @click="drawer = false"></div>
    </Transition>

    <!-- ── sadržaj ───────────────────────────────────────── -->
    <div class="main">
      <header class="topbar">
        <button class="btn btn-ghost btn-icon only-mobile" aria-label="Otvori meni" @click="drawer = true">
          ☰
        </button>
        <strong class="only-mobile truncate">{{ route.meta.title?.split(' · ')[0] || 'RDS' }}</strong>
        <div class="spacer"></div>
        <slot name="topbar" />
      </header>

      <main class="content">
        <RouterView v-slot="{ Component }">
          <Transition name="fade" mode="out-in">
            <component :is="Component" />
          </Transition>
        </RouterView>
      </main>
    </div>

    <!-- Mesto za hitne ekrane koji idu preko svega (doziv konobara). -->
    <slot name="overlay" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  display: grid;
  grid-template-columns: var(--sidebar-w) minmax(0, 1fr);
  background: var(--bg);
}

/* ── bočni meni ── */
.side {
  position: sticky;
  top: 0;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  padding: var(--s4);
  background: var(--surface);
  border-right: 1px solid var(--line);
  z-index: 95;
}
.side-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  min-height: 38px;
}
.brand {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.brand strong {
  display: block;
  line-height: 1.2;
}
.brand-icon {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--tint-brand);
  font-size: 1.05rem;
  flex: none;
}

.nav {
  display: flex;
  flex-direction: column;
  gap: 2px;
  overflow-y: auto;
  flex: 1;
  margin-inline: calc(-1 * var(--s1));
  padding-inline: var(--s1);
}
.nav-item {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: 9px var(--s3);
  border-radius: var(--r-sm);
  font-size: var(--fs-sm);
  font-weight: 550;
  color: var(--muted);
  transition: background var(--fast), color var(--fast);
}
.nav-item:hover {
  background: var(--hover);
  color: var(--ink);
}
.nav-item.on {
  background: var(--tint-brand);
  color: var(--brand-soft);
  font-weight: 650;
}
.nav-icon {
  width: 20px;
  text-align: center;
  flex: none;
  font-size: var(--fs-base);
}
.nav-badge {
  min-width: 20px;
  padding: 0 6px;
  height: 19px;
  display: grid;
  place-items: center;
  border-radius: var(--r-full);
  background: var(--brand);
  color: #fff;
  font-size: 10px;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
}

.side-bottom {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  border-top: 1px solid var(--line);
  padding-top: var(--s3);
}
.user {
  display: flex;
  align-items: center;
  gap: var(--s3);
  padding: var(--s2);
  border-radius: var(--r-sm);
  cursor: pointer;
  transition: background var(--fast);
}
.user:hover {
  background: var(--hover);
}
.user strong {
  display: block;
  line-height: 1.2;
}
.user-menu {
  display: flex;
  gap: var(--s2);
  align-items: center;
}

/* ── sadržaj ── */
.main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.topbar {
  position: sticky;
  top: 0;
  z-index: 30;
  display: flex;
  align-items: center;
  gap: var(--s3);
  min-height: var(--header-h);
  padding-inline: var(--s5);
  padding-block: var(--s2);
  background: var(--glass);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border-bottom: 1px solid var(--line);
  flex-wrap: wrap;
}
.content {
  padding: var(--s5);
  flex: 1;
  min-width: 0;
}

.only-mobile {
  display: none;
}

@media (max-width: 900px) {
  .shell {
    grid-template-columns: minmax(0, 1fr);
  }
  .side {
    position: fixed;
    inset: 0 auto 0 0;
    width: min(272px, 84vw);
    transform: translateX(-100%);
    transition: transform var(--slow);
    box-shadow: var(--shadow-lg);
  }
  .side.open {
    transform: none;
  }
  .only-mobile {
    display: inline-flex;
  }
  .content {
    padding: var(--s4);
  }
  .topbar {
    padding-inline: var(--s3);
    gap: var(--s2);
  }
  /* Naslov ustupa mesto dugmadima umesto da ih gura iz ekrana. */
  .topbar > strong {
    min-width: 0;
    flex: 1;
  }
}

@media (max-width: 420px) {
  .topbar > strong {
    display: none;
  }
}
</style>
