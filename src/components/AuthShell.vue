<script setup>
import { RouterLink } from 'vue-router'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'

defineProps({
  title: String,
  subtitle: String,
})
</script>

<template>
  <div class="shell">
    <div class="glow" aria-hidden="true"></div>

    <div class="top">
      <RouterLink to="/" aria-label="Nazad na početnu"><Logo :size="34" /></RouterLink>
      <ThemeToggle />
    </div>

    <main class="box animate-in">
      <header class="head">
        <h1>{{ title }}</h1>
        <p v-if="subtitle" class="muted small">{{ subtitle }}</p>
      </header>

      <slot />
    </main>

    <footer class="bottom">
      <slot name="foot" />
    </footer>
  </div>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: var(--s5);
  gap: var(--s5);
  position: relative;
  overflow: hidden;
}
.glow {
  position: absolute;
  top: -320px;
  left: 50%;
  transform: translateX(-50%);
  width: min(900px, 140vw);
  height: 560px;
  background: radial-gradient(
    ellipse at center,
    rgba(226, 96, 63, 0.22) 0%,
    transparent 68%
  );
  filter: blur(28px);
  pointer-events: none;
}
.top {
  position: relative;
  width: 100%;
  max-width: 440px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.box {
  position: relative;
  width: 100%;
  max-width: 440px;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  padding: var(--s6);
  display: flex;
  flex-direction: column;
  gap: var(--s5);
  margin-block: auto;
}
.head {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.head h1 {
  font-size: var(--fs-xl);
}
.bottom {
  position: relative;
  text-align: center;
  font-size: var(--fs-sm);
  color: var(--muted);
}
@media (max-width: 480px) {
  .shell {
    padding: var(--s4);
  }
  .box {
    padding: var(--s5);
  }
}
</style>
