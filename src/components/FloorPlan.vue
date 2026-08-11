<script setup>
// ─────────────────────────────────────────────────────────────
//  Skica lokala
//
//  Ista komponenta služi na dva mesta:
//   • vlasniku kao crtaća tabla (editable) — vuče stolove mišem
//     ili prstom, menja im veličinu i oblik;
//   • gostu kao mapa na kojoj dodirne svoj sto.
//
//  Položaj se čuva u procentima platna (0–100), a ne u pikselima,
//  pa raspored izgleda isto na monitoru i na telefonu.
// ─────────────────────────────────────────────────────────────

import { computed, ref, watch } from 'vue'

const props = defineProps({
  tables: { type: Array, default: () => [] },
  zones: { type: Array, default: () => [] },
  zoneId: { type: String, default: '' },
  editable: Boolean,
  selectedId: { type: String, default: '' },
  /** { [tableId]: 'busy' } — stolovi sa porudžbinom u toku */
  occupied: { type: Object, default: () => ({}) },
  brandColor: { type: String, default: '' },
})

const emit = defineEmits(['select', 'move', 'add'])

const GRID = 2 // procenta — dovoljno sitno da izgleda uredno, dovoljno krupno da "uhvati"

const canvas = ref(null)
const dragging = ref(null)

// Radna kopija: dok se sto vuče, pomera se lokalno, a u bazu se
// upisuje tek kad se prst/miš podigne. Inače bi svako pomeranje
// od jednog piksela bilo jedan upis.
const draft = ref({})

const visible = computed(() =>
  props.tables.filter((t) => !props.zoneId || (t.zoneId || 'sala') === props.zoneId)
)

function view(t) {
  const d = draft.value[t.id]
  return d ? { ...t, ...d } : t
}

function clamp(v, min, max) {
  return Math.min(max, Math.max(min, v))
}

function snap(v) {
  return Math.round(v / GRID) * GRID
}

function pctFromEvent(e) {
  const r = canvas.value.getBoundingClientRect()
  return {
    x: ((e.clientX - r.left) / r.width) * 100,
    y: ((e.clientY - r.top) / r.height) * 100,
  }
}

function onDown(e, t, mode) {
  if (!props.editable) {
    emit('select', t)
    return
  }
  e.preventDefault()
  e.stopPropagation()

  const p = pctFromEvent(e)
  const cur = view(t)

  dragging.value = {
    id: t.id,
    mode, // 'move' | 'resize'
    grabX: p.x - cur.x,
    grabY: p.y - cur.y,
    startW: cur.w,
    startH: cur.h,
    startX: p.x,
    startY: p.y,
    moved: false,
  }

  e.currentTarget.setPointerCapture?.(e.pointerId)
  emit('select', t)
}

function onMove(e) {
  const d = dragging.value
  if (!d) return
  const p = pctFromEvent(e)
  const t = props.tables.find((x) => x.id === d.id)
  if (!t) return

  const cur = view(t)
  d.moved = true

  if (d.mode === 'move') {
    draft.value = {
      ...draft.value,
      [d.id]: {
        x: clamp(snap(p.x - d.grabX), 0, 100 - cur.w),
        y: clamp(snap(p.y - d.grabY), 0, 100 - cur.h),
      },
    }
  } else {
    const w = clamp(snap(d.startW + (p.x - d.startX)), 6, 100 - cur.x)
    const h = clamp(snap(d.startH + (p.y - d.startY)), 6, 100 - cur.y)
    draft.value = { ...draft.value, [d.id]: { w, h } }
  }
}

function onUp() {
  const d = dragging.value
  dragging.value = null
  if (!d || !d.moved) return

  const patch = draft.value[d.id]
  if (patch) emit('move', { id: d.id, ...patch })

  // Nacrt ostaje dok ne stigne potvrda iz baze — inače bi sto na
  // trenutak "odskočio" nazad na staro mesto.
}

// Kad stvarni podaci sustignu nacrt, nacrt više nije potreban.
watch(
  () => props.tables,
  (list) => {
    if (!Object.keys(draft.value).length) return
    const next = { ...draft.value }
    let changed = false
    for (const t of list) {
      const d = next[t.id]
      if (!d) continue
      const same = Object.entries(d).every(([k, v]) => Math.abs((t[k] ?? 0) - v) < 0.01)
      if (same) {
        delete next[t.id]
        changed = true
      }
    }
    if (changed) draft.value = next
  },
  { deep: true }
)

function onCanvasClick(e) {
  if (!props.editable) return
  if (e.target !== canvas.value) return
  const p = pctFromEvent(e)
  emit('add', { x: clamp(snap(p.x - 6), 0, 88), y: clamp(snap(p.y - 5), 0, 90) })
}

function tableStyle(t) {
  const v = view(t)
  return {
    left: v.x + '%',
    top: v.y + '%',
    width: v.w + '%',
    height: v.h + '%',
    borderRadius: v.shape === 'circle' ? '50%' : 'var(--r-sm)',
  }
}
</script>

<template>
  <div class="fp" :style="brandColor ? { '--b': brandColor } : {}">
    <div
      ref="canvas"
      class="canvas"
      :class="{ edit: editable }"
      @pointermove="onMove"
      @pointerup="onUp"
      @pointercancel="onUp"
      @click="onCanvasClick"
    >
      <div
        v-for="t in visible"
        :key="t.id"
        class="table"
        :class="{
          on: selectedId === t.id,
          busy: occupied[t.id],
          off: t.active === false,
          drag: dragging?.id === t.id,
        }"
        :style="tableStyle(t)"
        :title="`Sto ${t.label}${t.seats ? ' · ' + t.seats + ' mesta' : ''}`"
        role="button"
        :tabindex="editable ? -1 : 0"
        @pointerdown="onDown($event, t, 'move')"
        @keydown.enter="!editable && emit('select', t)"
        @keydown.space.prevent="!editable && emit('select', t)"
      >
        <strong class="t-label">{{ t.label }}</strong>
        <span v-if="t.seats" class="t-seats">{{ t.seats }}👤</span>
        <span v-if="occupied[t.id]" class="t-dot"></span>

        <span
          v-if="editable"
          class="handle"
          title="Promeni veličinu"
          @pointerdown="onDown($event, t, 'resize')"
        ></span>
      </div>

      <p v-if="!visible.length" class="hint-empty">
        {{
          editable
            ? 'Kliknite bilo gde na platno da dodate sto.'
            : 'Za ovaj prostor još nije napravljen raspored.'
        }}
      </p>
    </div>

    <p v-if="editable" class="xs faint center">
      Prevucite sto da ga pomerite · uhvatite ugao da mu promenite veličinu · kliknite prazno
      mesto da dodate novi
    </p>
  </div>
</template>

<style scoped>
.fp {
  --b: var(--brand);
  display: flex;
  flex-direction: column;
  gap: var(--s2);
}

.canvas {
  position: relative;
  width: 100%;
  aspect-ratio: 16 / 10;
  border-radius: var(--r-md);
  border: 1px solid var(--line-strong);
  background-color: var(--surface-2);
  background-image: linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 5% 8%;
  overflow: hidden;
  touch-action: none;
}
.canvas.edit {
  cursor: crosshair;
}

.table {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  background: var(--surface);
  border: 2px solid var(--line-strong);
  color: var(--ink);
  box-shadow: var(--shadow-sm);
  transition: border-color var(--fast), background var(--fast), transform var(--fast),
    box-shadow var(--fast);
  user-select: none;
  overflow: hidden;
  min-width: 0;
}
.canvas.edit .table {
  cursor: grab;
}
.table.drag {
  cursor: grabbing;
  z-index: 3;
  box-shadow: var(--shadow-lg);
  transform: scale(1.03);
}
.table:not(.drag):hover {
  border-color: var(--b);
}
.table.on {
  border-color: var(--b);
  background: color-mix(in srgb, var(--b) 16%, var(--surface));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--b) 26%, transparent);
}
.table.busy {
  border-color: var(--warn);
  background: var(--tint-warn);
}
.table.off {
  opacity: 0.4;
  border-style: dashed;
}

.t-label {
  font-size: clamp(0.7rem, 2.2cqw, 1rem);
  font-weight: 750;
  line-height: 1;
}
.t-seats {
  font-size: 9px;
  color: var(--muted);
  line-height: 1;
}
.t-dot {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--warn);
}

.handle {
  position: absolute;
  right: -1px;
  bottom: -1px;
  width: 14px;
  height: 14px;
  cursor: nwse-resize;
  background: var(--b);
  border-radius: 3px 0 var(--r-sm) 0;
  opacity: 0.85;
}

.hint-empty {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  color: var(--faint);
  font-size: var(--fs-sm);
  text-align: center;
  padding: var(--s5);
  pointer-events: none;
}
</style>
