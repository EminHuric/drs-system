<script setup>
// Pregled fotografija preko celog ekrana, sa strelicama i tastaturom.

import { onBeforeUnmount, onMounted, ref } from 'vue'

const props = defineProps({
  photos: { type: Array, required: true },
  start: { type: Number, default: 0 },
})
const emit = defineEmits(['close'])

const i = ref(Math.min(props.start, props.photos.length - 1))

function next() {
  i.value = (i.value + 1) % props.photos.length
}
function prev() {
  i.value = (i.value - 1 + props.photos.length) % props.photos.length
}

function onKey(e) {
  if (e.key === 'Escape') emit('close')
  if (e.key === 'ArrowRight') next()
  if (e.key === 'ArrowLeft') prev()
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div class="viewer" role="dialog" aria-modal="true" aria-label="Fotografija" @click.self="emit('close')">
      <button class="x" aria-label="Zatvori" @click="emit('close')">✕</button>

      <button v-if="photos.length > 1" class="nav left" aria-label="Prethodna" @click.stop="prev">‹</button>
      <img :src="photos[i]" alt="" />
      <button v-if="photos.length > 1" class="nav right" aria-label="Sledeća" @click.stop="next">›</button>

      <span v-if="photos.length > 1" class="counter">{{ i + 1 }} / {{ photos.length }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.viewer {
  position: fixed;
  inset: 0;
  z-index: 300;
  display: grid;
  place-items: center;
  padding: var(--s5);
  background: rgba(4, 5, 9, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  animation: fade-in 0.18s var(--ease);
}
img {
  max-width: min(1000px, 92vw);
  max-height: 84dvh;
  border-radius: var(--r);
  object-fit: contain;
  box-shadow: var(--shadow-lg);
}
.x,
.nav {
  position: absolute;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.12);
  color: #fff;
  transition: background var(--fast);
}
.x:hover,
.nav:hover {
  background: rgba(255, 255, 255, 0.24);
}
.x {
  top: var(--s4);
  right: var(--s4);
  width: 40px;
  height: 40px;
  font-size: 1rem;
}
.nav {
  width: 46px;
  height: 46px;
  font-size: 1.7rem;
  top: 50%;
  transform: translateY(-50%);
  line-height: 1;
  padding-bottom: 4px;
}
.left {
  left: var(--s4);
}
.right {
  right: var(--s4);
}
.counter {
  position: absolute;
  bottom: var(--s5);
  color: rgba(255, 255, 255, 0.75);
  font-size: var(--fs-sm);
  font-variant-numeric: tabular-nums;
}
</style>
