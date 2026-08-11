<script setup>
// ─────────────────────────────────────────────────────────────
//  Ubacivanje slike sa uređaja
//
//  Otvara galeriju telefona ili fajlove na računaru — vlasnik bira
//  SVOJU fotografiju. Slika se odmah smanji i kompresuje u browseru,
//  pa se čuva uz sam artikal; Firebase Storage (koji traži platni
//  profil) nije potreban.
// ─────────────────────────────────────────────────────────────

import { ref } from 'vue'
import { approxKb, compressAs } from '@/lib/image'
import { toast } from '@/stores/toast'

const props = defineProps({
  modelValue: { type: String, default: '' },
  preset: { type: String, default: 'dish' },
  label: { type: String, default: 'Slika' },
  hint: { type: String, default: '' },
  /** css aspect-ratio okvira, npr. '4 / 3' ili '1' */
  ratio: { type: String, default: '4 / 3' },
  placeholder: { type: String, default: '📷' },
  disabled: Boolean,
})

const emit = defineEmits(['update:modelValue'])

const busy = ref(false)
const dragOver = ref(false)

async function take(file) {
  if (!file || props.disabled) return
  busy.value = true
  try {
    const out = await compressAs(file, props.preset)
    emit('update:modelValue', out)
    toast.ok(`Slika je dodata (${approxKb(out)} KB).`)
  } catch (e) {
    toast.error(e.message || 'Slika nije mogla da se obradi.')
  } finally {
    busy.value = false
  }
}

function onPick(e) {
  const f = e.target.files?.[0]
  e.target.value = ''
  take(f)
}

function onDrop(e) {
  dragOver.value = false
  take(e.dataTransfer?.files?.[0])
}
</script>

<template>
  <div class="field">
    <label class="label">{{ label }}</label>

    <div
      class="drop"
      :class="{ over: dragOver, has: modelValue, busy }"
      :style="{ aspectRatio: modelValue ? ratio : undefined }"
      @dragover.prevent="!disabled && (dragOver = true)"
      @dragleave="dragOver = false"
      @drop.prevent="onDrop"
    >
      <img v-if="modelValue" :src="modelValue" alt="" />

      <label v-if="!modelValue" class="pick">
        <span v-if="busy" class="spinner"></span>
        <template v-else>
          <span class="ico" aria-hidden="true">{{ placeholder }}</span>
          <strong class="small">Izaberi sliku sa uređaja</strong>
          <span class="xs faint">ili je prevuci ovde</span>
        </template>
        <input type="file" accept="image/*" hidden :disabled="disabled || busy" @change="onPick" />
      </label>

      <div v-else class="over-acts">
        <label class="btn btn-soft btn-sm">
          {{ busy ? 'Obrada…' : '↻ Zameni' }}
          <input type="file" accept="image/*" hidden :disabled="disabled || busy" @change="onPick" />
        </label>
        <button class="btn btn-soft btn-sm" :disabled="disabled" @click="emit('update:modelValue', '')">
          🗑 Ukloni
        </button>
      </div>
    </div>

    <span v-if="hint" class="hint">{{ hint }}</span>
  </div>
</template>

<style scoped>
.drop {
  position: relative;
  border-radius: var(--r);
  border: 1px dashed var(--line-strong);
  background: var(--surface-2);
  overflow: hidden;
  transition: border-color var(--fast), background var(--fast);
}
.drop.over {
  border-color: var(--brand);
  background: var(--tint-brand);
}
.drop.has {
  border-style: solid;
  border-color: var(--line);
}
.drop img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
}

.pick {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 4px;
  min-height: 130px;
  padding: var(--s5) var(--s4);
  cursor: pointer;
  text-align: center;
  color: var(--muted);
  transition: color var(--fast);
}
.pick:hover {
  color: var(--ink);
}
.pick strong {
  color: var(--ink-2);
}
.ico {
  font-size: 1.9rem;
  margin-bottom: 2px;
}

.over-acts {
  position: absolute;
  right: var(--s2);
  bottom: var(--s2);
  display: flex;
  gap: 6px;
}
.over-acts .btn {
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  background: var(--glass);
  cursor: pointer;
}
</style>
