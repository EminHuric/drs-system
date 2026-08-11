// ─────────────────────────────────────────────────────────────
//  WhatsApp kanal
//
//  Porudžbina se PRVO upiše u bazu (osoblje je vidi uživo u panelu),
//  a zatim se gostu otvori WhatsApp sa već napisanom porukom. Tako
//  restoran dobija obaveštenje i na telefon, a gost dobija kanal za
//  razgovor koji već koristi svaki dan.
//
//  Napomena: gost mora jednom da pritisne "Pošalji" u WhatsApp-u —
//  to je pravilo same wa.me veze i ne može se zaobići bez plaćenog
//  WhatsApp Business API-ja.
// ─────────────────────────────────────────────────────────────

import { money } from './format.js'
import { PAYMENTS } from './constants.js'

const LINE = '━━━━━━━━━━━━━━━━'

export function buildOrderMessage(order, restaurant) {
  const cur = order.currency || restaurant?.currency || '€'
  const p = []

  p.push(`🧾 *NOVA PORUDŽBINA* — ${restaurant?.name || ''}`)
  p.push(`🔖 Broj: *${order.code}*`)
  p.push('')

  if (order.type === 'delivery') {
    p.push('🛵 *DOSTAVA NA ADRESU*')
    if (order.guest?.address) p.push(`📍 Adresa: ${order.guest.address}`)
    if (order.guest?.floor) p.push(`🏢 Sprat/stan: ${order.guest.floor}`)
    if (order.guest?.geo) {
      p.push(`🗺️ Mapa: https://maps.google.com/?q=${order.guest.geo.lat},${order.guest.geo.lng}`)
    }
  } else if (order.kind === 'reservation') {
    p.push('🗓️ *REZERVACIJA STOLA*')
    p.push(`📅 ${order.reservation?.date} u ${order.reservation?.time}`)
    p.push(`👥 Osoba: ${order.reservation?.people}`)
  } else if (order.type === 'takeaway') {
    p.push('🛍️ *ZA PONETI*')
    if (order.pickup?.mode === 'time') p.push(`🕒 Dolazi u: *${order.pickup.time}*`)
    else p.push('⚡ Preuzimanje: što pre')
  } else {
    p.push('🍽️ *U LOKALU*')
    if (order.tableLabel) p.push(`🪑 Sto: *${order.tableLabel}*`)
    if (order.zoneName) p.push(`📍 Prostor: ${order.zoneName}`)
  }

  if (order.guest?.name) p.push(`👤 Ime: ${order.guest.name}`)
  if (order.guest?.phone) p.push(`📞 Telefon: +${order.guest.phone}`)

  p.push('')
  for (const l of order.lines) {
    p.push(`${l.qty}× ${l.name} — ${money(l.price * l.qty, cur)}`)
    if (l.note) p.push(`   ↳ _${l.note}_`)
  }

  p.push(LINE)
  if (order.deliveryFee > 0) {
    p.push(`Artikli: ${money(order.subtotal, cur)}`)
    p.push(`Dostava: ${money(order.deliveryFee, cur)}`)
  }
  p.push(`💶 *UKUPNO: ${money(order.total, cur)}*`)

  if (order.payment) {
    p.push(`💳 Plaćanje: ${PAYMENTS[order.payment] || order.payment}`)
  }
  if (order.note) {
    p.push('')
    p.push(`📝 Napomena: ${order.note}`)
  }

  return p.join('\n')
}

export function whatsappUrl(phoneDigits, message) {
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(message)}`
}

function isMobile() {
  return /android|iphone|ipad|ipod/i.test(navigator.userAgent)
}

/**
 * Otvara WhatsApp aplikaciju, a ne web verziju kad god je moguće.
 *
 * Na telefonu se prvo pokušava `whatsapp://` — to preskače međukorak
 * kroz browser i vodi pravo u aplikaciju. Ako je ne otvori (nema je
 * instaliranu), posle kratkog vremena se pada nazad na wa.me, koji
 * radi svuda.
 */
export function openWhatsApp(phoneDigits, message) {
  const text = encodeURIComponent(message)
  const web = `https://wa.me/${phoneDigits}?text=${text}`

  if (!isMobile()) {
    window.open(web, '_blank', 'noopener')
    return
  }

  const app = `whatsapp://send?phone=${phoneDigits}&text=${text}`
  let left = false
  const onHide = () => (left = true)
  document.addEventListener('visibilitychange', onHide, { once: true })

  window.location.href = app

  setTimeout(() => {
    document.removeEventListener('visibilitychange', onHide)
    if (!left && !document.hidden) window.location.href = web
  }, 1200)
}

/**
 * Poruka kojom restoran javlja gostu da je porudžbina prihvaćena.
 * Koristi je osoblje iz panela, jednim klikom.
 */
export function buildStatusMessage(order, restaurant, statusLabel) {
  return [
    `${restaurant?.name || 'Restoran'} — porudžbina *${order.code}*`,
    '',
    `Status: *${statusLabel}*`,
    order.eta ? `Procena: ~${order.eta} min` : '',
    '',
    'Hvala vam! 🙏',
  ]
    .filter(Boolean)
    .join('\n')
}
