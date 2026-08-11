<script setup>
import { onMounted, onBeforeUnmount, ref, nextTick } from 'vue'

const props = defineProps({
  title: { type: String, default: '' },
  wide: Boolean,
  // Kad je u toku snimanje, dijalog se ne zatvara slučajnim klikom.
  busy: Boolean,
})
const emit = defineEmits(['close'])

const box = ref(null)
let lastFocused = null

// Dijalozi se ponekad slažu jedan na drugi (npr. izbor stola preko
// ekrana za slanje porudžbine). Brojač sprečava da zatvaranje gornjeg
// dijaloga vrati skrolovanje stranici dok je donji još otvoren.
let openCount = 0

function lockScroll() {
  if (openCount === 0) document.body.style.overflow = 'hidden'
  openCount++
}

function unlockScroll() {
  openCount = Math.max(0, openCount - 1)
  if (openCount === 0) document.body.style.overflow = ''
}

function onKey(e) {
  if (e.key === 'Escape' && !props.busy) emit('close')
  if (e.key !== 'Tab' || !box.value) return

  // Fokus ostaje zarobljen u dijalogu — tastatura ne sme da odluta iza njega.
  const focusable = box.value.querySelectorAll(
    'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])'
  )
  if (!focusable.length) return
  const first = focusable[0]
  const last = focusable[focusable.length - 1]
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault()
    last.focus()
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault()
    first.focus()
  }
}

onMounted(async () => {
  lastFocused = document.activeElement
  lockScroll()
  window.addEventListener('keydown', onKey)
  await nextTick()
  box.value?.querySelector('input, textarea, select, button')?.focus()
})

onBeforeUnmount(() => {
  unlockScroll()
  window.removeEventListener('keydown', onKey)
  lastFocused?.focus?.()
})
</script>

<template>
  <Teleport to="body">
    <div class="scrim" @click="!busy && emit('close')"></div>
    <div class="modal-host">
      <div
        ref="box"
        class="modal"
        :class="{ 'modal-wide': wide }"
        role="dialog"
        aria-modal="true"
        :aria-label="title"
      >
        <header v-if="title || $slots.head" class="modal-head">
          <slot name="head">
            <h3>{{ title }}</h3>
          </slot>
          <button class="btn btn-ghost btn-icon btn-sm" aria-label="Zatvori" @click="emit('close')">
            ✕
          </button>
        </header>

        <div class="modal-body">
          <slot />
        </div>

        <footer v-if="$slots.foot" class="modal-foot">
          <slot name="foot" />
        </footer>
      </div>
    </div>
  </Teleport>
</template>
