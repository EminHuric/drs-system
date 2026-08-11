<script setup>
// ─────────────────────────────────────────────────────────────
//  QR kod za sto ili za ceo lokal.
//  Biblioteka se učitava tek kad se kod zaista prikaže — gost koji
//  samo gleda meni nikada ne skine ovaj deo koda.
// ─────────────────────────────────────────────────────────────

import { ref, watch, onMounted } from 'vue'

const props = defineProps({
  text: { type: String, required: true },
  size: { type: Number, default: 260 },
  label: { type: String, default: '' },
})

const canvas = ref(null)
const failed = ref(false)

async function draw() {
  if (!canvas.value || !props.text) return
  try {
    const QR = (await import('qrcode')).default
    await QR.toCanvas(canvas.value, props.text, {
      width: props.size,
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#000000', light: '#ffffff' },
    })
    failed.value = false
  } catch (e) {
    console.error('[RDS] QR nije mogao da se nacrta:', e)
    failed.value = true
  }
}

onMounted(draw)
watch(() => [props.text, props.size], draw)

function download() {
  if (!canvas.value) return
  const a = document.createElement('a')
  a.download = `qr-${(props.label || 'rds').replace(/\s+/g, '-').toLowerCase()}.png`
  a.href = canvas.value.toDataURL('image/png')
  a.click()
}

function print() {
  if (!canvas.value) return
  const img = canvas.value.toDataURL('image/png')
  const w = window.open('', '_blank', 'width=520,height=680')
  if (!w) return
  w.document.write(`
    <html><head><title>QR — ${props.label}</title>
    <style>
      body{font-family:system-ui,sans-serif;display:flex;flex-direction:column;
           align-items:center;justify-content:center;height:100vh;margin:0;gap:18px}
      img{width:320px;height:320px;image-rendering:pixelated}
      h1{font-size:30px;margin:0} p{color:#666;margin:0;font-size:15px}
    </style></head>
    <body>
      <h1>${props.label || ''}</h1>
      <img src="${img}" alt="QR kod" />
      <p>Skenirajte telefonom da vidite meni i poručite</p>
      <script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script>
    </body></html>`)
  w.document.close()
}

defineExpose({ download, print })
</script>

<template>
  <div class="qr">
    <div class="frame">
      <canvas ref="canvas" :width="size" :height="size"></canvas>
      <p v-if="failed" class="small muted center">QR kod nije mogao da se prikaže.</p>
    </div>

    <strong v-if="label" class="small">{{ label }}</strong>

    <div class="wrap-row" style="justify-content: center">
      <button class="btn btn-soft btn-sm" @click="download">⬇ Preuzmi PNG</button>
      <button class="btn btn-soft btn-sm" @click="print">🖨️ Štampaj</button>
    </div>
  </div>
</template>

<style scoped>
.qr {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s3);
}
.frame {
  padding: var(--s3);
  background: #fff;
  border-radius: var(--r);
  border: 1px solid var(--line);
  line-height: 0;
}
canvas {
  border-radius: 4px;
}
</style>
