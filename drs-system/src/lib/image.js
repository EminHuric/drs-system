// ─────────────────────────────────────────────────────────────
//  Slike jela bez Firebase Storage-a.
//
//  Storage od skoro traži platni profil (Blaze), a sistem mora da
//  ostane besplatan. Zato se slika smanji i kompresuje u browseru
//  do ~90 KB i čuva kao data URL u samom dokumentu artikla.
//  Firestore dozvoljava 1 MB po dokumentu — ostaje ogromna rezerva.
// ─────────────────────────────────────────────────────────────

// Slika jela: dovoljno oštra za karticu i na retina ekranu.
const DISH = { edge: 900, bytes: 90 * 1024 }

// Fotografija uz recenziju: ide ih do tri u istom dokumentu, pa svaka
// mora da bude manja da bi sve stale u Firestore-ovih 1 MB po dokumentu.
const REVIEW = { edge: 720, bytes: 70 * 1024 }

// Naslovna slika objekta — široka, preko cele širine ekrana.
const COVER = { edge: 1500, bytes: 120 * 1024 }

// Logo lokala — mali, ali oštar.
const LOGO = { edge: 320, bytes: 30 * 1024 }

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024

export function isImage(file) {
  return Boolean(file) && /^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)
}

function loadBitmap(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('Slika ne može da se učita.'))
    }
    img.src = url
  })
}

/**
 * @returns {Promise<string>} data:image/webp;base64,... spreman za Firestore
 */
export async function compressToDataUrl(file, preset = DISH) {
  if (!isImage(file)) throw new Error('Dozvoljene su samo slike (JPG, PNG, WEBP).')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Slika je prevelika (maksimum 8 MB).')

  const img = await loadBitmap(file)

  const scale = Math.min(1, preset.edge / Math.max(img.width, img.height))
  const w = Math.max(1, Math.round(img.width * scale))
  const h = Math.max(1, Math.round(img.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(img, 0, 0, w, h)

  // Spuštamo kvalitet dok slika ne stane u ciljanu veličinu.
  let quality = 0.82
  let out = canvas.toDataURL('image/webp', quality)
  while (out.length * 0.75 > preset.bytes && quality > 0.35) {
    quality -= 0.12
    out = canvas.toDataURL('image/webp', quality)
  }

  // Stariji Safari ne ume webp iz canvas-a — vrati se na JPEG.
  if (!out.startsWith('data:image/webp')) {
    out = canvas.toDataURL('image/jpeg', 0.75)
  }

  return out
}

/** Fotografija koju gost kači uz recenziju. */
export function compressReviewPhoto(file) {
  return compressToDataUrl(file, REVIEW)
}

// Sve slike lokala žive u jednom dokumentu (naslovna + logo + galerija),
// a Firestore dozvoljava 1 MB po dokumentu — otud različite mere.
export const PRESETS = { dish: DISH, review: REVIEW, cover: COVER, logo: LOGO }

export function compressAs(file, preset = 'dish') {
  return compressToDataUrl(file, PRESETS[preset] || DISH)
}

export function approxKb(dataUrl) {
  if (!dataUrl) return 0
  return Math.round((dataUrl.length * 0.75) / 1024)
}

// ─────────────────────────────────────────────────────────────
//  Boje iz logotipa
//
//  Vlasnik retko zna koji mu je tačno „njegov" ton. Umesto da ga
//  tera da pogađa iz palete, izvlačimo boje iz logotipa koji je
//  upravo dodao — pa samo klikne onu koju prepoznaje kao svoju.
// ─────────────────────────────────────────────────────────────

function hex(r, g, b) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function saturation(r, g, b) {
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  return max === 0 ? 0 : (max - min) / max
}

function luminance(r, g, b) {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
}

/**
 * @param {string} dataUrl slika iz koje se vadi paleta
 * @param {number} count koliko boja vratiti
 * @returns {Promise<string[]>} heks boje, od najzastupljenije
 */
export async function dominantColors(dataUrl, count = 5) {
  if (!dataUrl) return []

  const img = await new Promise((resolve, reject) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => reject(new Error('Slika ne može da se pročita.'))
    i.src = dataUrl
  })

  const N = 64
  const canvas = document.createElement('canvas')
  canvas.width = N
  canvas.height = N
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, N, N)

  let data
  try {
    data = ctx.getImageData(0, 0, N, N).data
  } catch {
    return [] // slika sa drugog domena — čitanje piksela nije dozvoljeno
  }

  // Grubo grupisanje po 32 nijanse po kanalu: dovoljno da se bliski
  // tonovi spoje u jednu boju, a da se različite ne pomešaju.
  const bins = new Map()

  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3]
    if (a < 128) continue

    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]

    const l = luminance(r, g, b)
    const s = saturation(r, g, b)

    // Bela, crna i sivilo nisu ničiji brend — preskačemo ih.
    if (l > 0.93 || l < 0.07) continue
    if (s < 0.18) continue

    const key = `${r >> 5}|${g >> 5}|${b >> 5}`
    const e = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    e.n++
    e.r += r
    e.g += g
    e.b += b
    bins.set(key, e)
  }

  return [...bins.values()]
    .sort((a, b) => b.n - a.n)
    .slice(0, count)
    .map((e) => hex(Math.round(e.r / e.n), Math.round(e.g / e.n), Math.round(e.b / e.n)))
}

/** Da li je slika pretežno tamna — po tome se predlaže tamna ili svetla tema. */
export async function isDarkImage(dataUrl) {
  if (!dataUrl) return false
  const img = await new Promise((resolve) => {
    const i = new Image()
    i.onload = () => resolve(i)
    i.onerror = () => resolve(null)
    i.src = dataUrl
  })
  if (!img) return false

  const canvas = document.createElement('canvas')
  canvas.width = 32
  canvas.height = 32
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  ctx.drawImage(img, 0, 0, 32, 32)

  try {
    const d = ctx.getImageData(0, 0, 32, 32).data
    let sum = 0
    let n = 0
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 128) continue
      sum += luminance(d[i], d[i + 1], d[i + 2])
      n++
    }
    return n ? sum / n < 0.42 : false
  } catch {
    return false
  }
}
