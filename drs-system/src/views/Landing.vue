<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import Logo from '@/components/ui/Logo.vue'
import ThemeToggle from '@/components/ui/ThemeToggle.vue'
import { role } from '@/stores/auth'
import { homeFor } from '@/router'

const PHONE = '381652206269'
const PHONE_PRETTY = '+381 65 220 62 69'

const year = new Date().getFullYear()
const loggedIn = computed(() => role.value === 'platform' || role.value === 'owner')
const home = computed(() => homeFor(role.value))

function waLink(text) {
  return `https://wa.me/${PHONE}?text=${encodeURIComponent(text)}`
}

// ── živi prikaz u zaglavlju ─────────────────────────────────
// Porudžbine se smenjuju same, sa istim zvonom koje vidi osoblje —
// posetilac za pet sekundi shvati šta sistem radi, bez ijedne reči.

const DEMO = [
  { icon: '🍽️', title: 'Sto 7 · Bašta', items: '2× Ćevapi · 1× Šopska salata', sum: '20,50 €', tag: 'Nova' },
  { icon: '🛵', title: 'Njegoševa 12, Bar', items: '1× Mešano meso · 2× Pivo', sum: '24,50 €', tag: 'Nova' },
  { icon: '🛍️', title: 'Za poneti · 19:30', items: '2× Pizza Capricciosa', sum: '17,00 €', tag: 'Nova' },
  { icon: '🔔', title: 'Sto 3 doziva konobara', items: 'Gost traži osoblje', sum: '—', tag: 'Hitno' },
]

const at = ref(0)
let timer = null

onMounted(() => {
  timer = setInterval(() => (at.value = (at.value + 1) % DEMO.length), 3400)
})
onBeforeUnmount(() => clearInterval(timer))

const feed = computed(() => {
  const out = []
  for (let i = 0; i < 3; i++) out.push(DEMO[(at.value + i) % DEMO.length])
  return out
})

// ── sadržaj ─────────────────────────────────────────────────

const stats = [
  { n: '3 sek', l: 'od skeniranja do menija' },
  { n: '0 €', l: 'mesečno za početak' },
  { n: '6', l: 'jezika za strane goste' },
  { n: '10', l: 'gotovih izgleda lokala' },
]

const features = [
  {
    icon: '⚡',
    title: 'Zvoni dok ne prihvatite',
    text: 'Nova porudžbina se oglašava svakih par sekundi dok je neko ne preuzme. Doziv konobara dobija ekran preko celog panela. Osoblje ne mora da gleda u ekran — sistem ga sam dozove.',
    wide: true,
  },
  {
    icon: '🪑',
    title: 'Skica vašeg lokala',
    text: 'Rasporedite stolove prstom, po prostorima — sala, bašta, sprat. Gost dodirne svoj sto i vi znate tačno gde nosite.',
  },
  {
    icon: '🛵',
    title: 'Dostava i za poneti',
    text: 'Adresa, sprat, tačna lokacija na mapi. Za poneti gost bira „što pre" ili tačan sat — dođe po gotovo, bez zvanja.',
  },
  {
    icon: '💬',
    title: 'Ćaskanje sa gostom',
    text: 'Pišete mu direktno u aplikaciji. Dobija obaveštenje na telefon i kad je izašao iz aplikacije.',
  },
  {
    icon: '⭐',
    title: 'Ocene sa fotografijama',
    text: 'Gost ocenjuje i kači slike jela. Ocene uz stvarnu porudžbinu nose oznaku „potvrđeno" — ne mogu se lažirati.',
  },
  {
    icon: '🎨',
    title: 'Vaš brend, ne naš',
    text: 'Deset gotovih izgleda — luksuz crno-zlatno, zeleno-zlatno, toplo braon, minimal. Boje se same izvuku iz vašeg logotipa.',
  },
  {
    icon: '🌍',
    title: 'Šest jezika',
    text: 'Nemac, Italijan ili Rus otvara meni na svom jeziku, jednim dodirom zastavice. Za lokale koji žive od turista.',
  },
  {
    icon: '📊',
    title: 'Izveštaji koji nešto znače',
    text: 'Promet po danima, šta se najviše prodaje, koji su sati najjači, šta niko ne naručuje.',
  },
]

const steps = [
  { n: '01', t: 'Javite se', d: 'Pozovete nas ili pišete na WhatsApp. Otvaramo nalog za vaš lokal.' },
  { n: '02', t: 'Dobijete kod', d: 'Njime pravite svoju lozinku. Mi je nikad ne vidimo.' },
  { n: '03', t: 'Podesite lokal', d: 'Čarobnjak od četiri koraka. Gotov meni za start ako ga želite.' },
  { n: '04', t: 'Primate porudžbine', d: 'Odštampate QR kodove za stolove i to je sve.' },
]
</script>

<template>
  <div class="page">
    <!-- ── zaglavlje ─────────────────────────────────────── -->
    <header class="nav">
      <div class="wrap nav-in">
        <RouterLink to="/" aria-label="RDS početna"><Logo :size="34" /></RouterLink>

        <nav class="links">
          <a href="#sistem">Šta radi</a>
          <a href="#kako">Kako se počinje</a>
          <a href="#kontakt">Kontakt</a>
        </nav>

        <div class="row" style="gap: var(--s2)">
          <ThemeToggle />
          <a class="btn btn-soft btn-sm hide-sm" :href="`tel:+${PHONE}`">📞 {{ PHONE_PRETTY }}</a>
          <RouterLink v-if="loggedIn" :to="home" class="btn btn-primary btn-sm">
            Moj panel →
          </RouterLink>
          <RouterLink v-else to="/login" class="btn btn-soft btn-sm">Prijava</RouterLink>
        </div>
      </div>
    </header>

    <!-- ── uvod ──────────────────────────────────────────── -->
    <section class="hero">
      <div class="mesh" aria-hidden="true"></div>
      <div class="grid-lines" aria-hidden="true"></div>

      <div class="wrap hero-in">
        <div class="hero-text">
          <span class="pill">
            <span class="dot dot-live"></span>
            Radi u lokalu, na dostavi i za poneti
          </span>

          <h1>
            Porudžbina koja<br />
            <span class="hi">sama dozove</span><br />
            vaše osoblje.
          </h1>

          <p class="lead">
            Gost skenira kod sa stola i poruči za trideset sekundi. Kod vas zazvoni i
            <strong>ne prestaje dok neko ne prihvati</strong> — ni jedna porudžbina se ne izgubi
            zato što je konobar bio okrenut leđima.
          </p>

          <div class="wrap-row hero-cta">
            <a class="btn btn-primary btn-lg" :href="`tel:+${PHONE}`">📞 Pozovite {{ PHONE_PRETTY }}</a>
            <a
              class="btn btn-wa btn-lg"
              :href="waLink('Zdravo! Zanima me RDS sistem za moj lokal.')"
              target="_blank"
              rel="noopener"
            >
              Pišite na WhatsApp
            </a>
          </div>

          <p class="xs faint">
            Bez ugovora i bez mesečnih troškova na početku. Postavljanje traje jedno popodne.
          </p>
        </div>

        <!-- živi prikaz -->
        <div class="demo" aria-hidden="true">
          <div class="demo-glow"></div>

          <div class="panel-mock">
            <div class="pm-head">
              <span class="pm-dots"><i></i><i></i><i></i></span>
              <strong>Porudžbine uživo</strong>
              <span class="pm-live"><span class="dot dot-live"></span> 3</span>
            </div>

            <TransitionGroup name="feed" tag="div" class="pm-body">
              <div
                v-for="(o, i) in feed"
                :key="o.title + at"
                class="pm-order"
                :class="{ fresh: i === 0, urgent: o.tag === 'Hitno' }"
              >
                <span class="pm-ico">{{ o.icon }}</span>
                <div class="grow">
                  <strong>{{ o.title }}</strong>
                  <span>{{ o.items }}</span>
                </div>
                <div class="pm-right">
                  <b>{{ o.sum }}</b>
                  <span class="pm-tag" :class="o.tag === 'Hitno' && 'hot'">{{ o.tag }}</span>
                </div>
              </div>
            </TransitionGroup>
          </div>

          <div class="phone-mock">
            <div class="ph-notch"></div>
            <div class="ph-cover"></div>
            <div class="ph-body">
              <span class="ph-mark">🏮</span>
              <strong class="ph-name">Konoba Lanterna</strong>
              <span class="ph-tag">★ 4,8 · Mediteranska kuhinja</span>

              <div class="ph-item">
                <span class="ph-thumb">🥙</span>
                <div class="grow">
                  <b>Ćevapi u lepinji</b>
                  <i>10 komada, kajmak</i>
                </div>
                <span class="ph-price">8,50 €</span>
              </div>
              <div class="ph-item">
                <span class="ph-thumb">🐙</span>
                <div class="grow">
                  <b>Salata od hobotnice</b>
                  <i>⭐ Najbolje ocenjeno</i>
                </div>
                <span class="ph-price">12,00 €</span>
              </div>

              <div class="ph-cart">2 · 20,50 € — Završi porudžbinu →</div>
            </div>
          </div>
        </div>
      </div>

      <!-- brojke -->
      <div class="wrap stats">
        <div v-for="s in stats" :key="s.l" class="stat">
          <strong>{{ s.n }}</strong>
          <span>{{ s.l }}</span>
        </div>
      </div>
    </section>

    <!-- ── dva sistema ───────────────────────────────────── -->
    <section id="sistem" class="wrap section">
      <div class="sec-head">
        <span class="eyebrow">Jedna aplikacija, tri načina</span>
        <h2>Kafić, picerija ili restoran — isti panel</h2>
        <p class="lead-sm">
          Pri otvaranju naloga biramo šta vaš lokal koristi. Ono što vam ne treba se i ne prikazuje.
        </p>
      </div>

      <div class="three-up">
        <article class="sys">
          <span class="sys-ico">🍽️</span>
          <h3>U lokalu</h3>
          <ul class="ticks">
            <li>QR kod na svakom stolu</li>
            <li>Skica lokala koju sami crtate</li>
            <li>Dozivanje konobara sa zvonom</li>
            <li>Rezervacija stola unapred</li>
          </ul>
        </article>

        <article class="sys">
          <span class="sys-ico">🛍️</span>
          <h3>Za poneti</h3>
          <ul class="ticks">
            <li>Gost bira „što pre" ili tačan sat</li>
            <li>Ne zove telefonom, ne čeka za šankom</li>
            <li>Kuhinja zna kad da krene</li>
            <li>Javljanje kad je gotovo</li>
          </ul>
        </article>

        <article class="sys">
          <span class="sys-ico">🛵</span>
          <h3>Dostava</h3>
          <ul class="ticks">
            <li>Adresa, sprat i tačka na mapi</li>
            <li>Cena dostave i najmanja porudžbina</li>
            <li>Statusi koje gost prati uživo</li>
            <li>Besplatna dostava preko iznosa</li>
          </ul>
        </article>
      </div>
    </section>

    <!-- ── mogućnosti ────────────────────────────────────── -->
    <section class="wrap section">
      <div class="sec-head">
        <span class="eyebrow">Šta dobijate</span>
        <h2>Sve što lokal traži — i ono na šta niste pomislili</h2>
      </div>

      <div class="feat-grid">
        <article v-for="f in features" :key="f.title" class="feat" :class="f.wide && 'feat-wide'">
          <span class="feat-ico">{{ f.icon }}</span>
          <h4>{{ f.title }}</h4>
          <p>{{ f.text }}</p>
        </article>
      </div>
    </section>

    <!-- ── kako radi ─────────────────────────────────────── -->
    <section id="kako" class="wrap section">
      <div class="sec-head">
        <span class="eyebrow">Kako se počinje</span>
        <h2>Od poziva do prve porudžbine</h2>
      </div>

      <ol class="steps">
        <li v-for="s in steps" :key="s.n">
          <span class="step-n">{{ s.n }}</span>
          <h4>{{ s.t }}</h4>
          <p>{{ s.d }}</p>
        </li>
      </ol>
    </section>

    <!-- ── kontakt ───────────────────────────────────────── -->
    <section id="kontakt" class="wrap section">
      <div class="cta">
        <div class="cta-glow" aria-hidden="true"></div>
        <div class="cta-in">
          <span class="eyebrow">Kontakt</span>
          <h2>Da vidimo kako bi izgledalo kod vas</h2>
          <p class="lead-sm">
            Javite se i za par minuta vam pokažemo sistem na vašem meniju. Bez obaveze i bez
            pritiska — ako vam ne odgovara, niste izgubili ništa osim jednog poziva.
          </p>

          <a class="phone-big" :href="`tel:+${PHONE}`">
            <span class="xs">Pozovite</span>
            <strong>{{ PHONE_PRETTY }}</strong>
          </a>

          <div class="wrap-row" style="justify-content: center">
            <a
              class="btn btn-wa btn-lg"
              :href="waLink('Zdravo! Zanima me RDS sistem za moj lokal.')"
              target="_blank"
              rel="noopener"
            >
              Pišite na WhatsApp
            </a>
            <RouterLink to="/register" class="btn btn-outline btn-lg">Imam kod za aktivaciju</RouterLink>
          </div>
        </div>
      </div>
    </section>

    <footer class="foot">
      <div class="wrap foot-in">
        <Logo :size="30" />
        <div class="foot-links">
          <a :href="`tel:+${PHONE}`">{{ PHONE_PRETTY }}</a>
          <a :href="waLink('Zdravo!')" target="_blank" rel="noopener">WhatsApp</a>
          <RouterLink to="/login">Prijava</RouterLink>
        </div>
        <span class="xs faint">© {{ year }} RDS — Restaurant Digital Solutions</span>
      </div>
    </footer>
  </div>
</template>

<style scoped>
.page {
  min-height: 100dvh;
  background: var(--bg);
  overflow-x: clip;
}

/* ── zaglavlje ── */
.nav {
  position: sticky;
  top: 0;
  z-index: 40;
  background: var(--glass);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid var(--line);
}
.nav-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  min-height: var(--header-h);
  padding-block: var(--s2);
}
.links {
  display: flex;
  gap: var(--s5);
  font-size: var(--fs-sm);
  font-weight: 550;
  color: var(--muted);
}
.links a:hover {
  color: var(--ink);
}
@media (max-width: 900px) {
  .links {
    display: none;
  }
}
@media (max-width: 640px) {
  .hide-sm {
    display: none;
  }
}

/* ── uvod ── */
.hero {
  position: relative;
  padding: var(--s9) 0 var(--s7);
  overflow: hidden;
}
/* Dve boje koje se lagano preklapaju — daje dubinu bez ijedne slike. */
.mesh {
  position: absolute;
  inset: -20% -10% auto -10%;
  height: 900px;
  pointer-events: none;
  background:
    radial-gradient(42% 42% at 22% 18%, rgba(226, 96, 63, 0.34) 0%, transparent 70%),
    radial-gradient(38% 38% at 78% 8%, rgba(217, 164, 65, 0.22) 0%, transparent 70%),
    radial-gradient(46% 46% at 62% 46%, rgba(99, 102, 241, 0.16) 0%, transparent 72%);
  filter: blur(28px);
  animation: drift 18s ease-in-out infinite alternate;
}
@keyframes drift {
  to {
    transform: translate3d(-3%, 2%, 0) scale(1.08);
  }
}
.grid-lines {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: linear-gradient(var(--line) 1px, transparent 1px),
    linear-gradient(90deg, var(--line) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(70% 55% at 50% 30%, #000 0%, transparent 100%);
  -webkit-mask-image: radial-gradient(70% 55% at 50% 30%, #000 0%, transparent 100%);
  opacity: 0.7;
}

.hero-in {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 460px);
  gap: var(--s7);
  align-items: center;
}
@media (max-width: 980px) {
  .hero-in {
    grid-template-columns: minmax(0, 1fr);
    gap: var(--s6);
  }
}

.hero-text {
  display: flex;
  flex-direction: column;
  gap: var(--s4);
  align-items: flex-start;
  animation: fade-up 0.7s var(--ease) both;
}
.pill {
  display: inline-flex;
  align-items: center;
  gap: var(--s2);
  padding: 6px var(--s4);
  border-radius: var(--r-full);
  border: 1px solid var(--line-strong);
  background: var(--surface);
  font-size: var(--fs-sm);
  font-weight: 600;
  color: var(--ink-2);
  box-shadow: var(--shadow-sm);
}
.hero h1 {
  font-size: clamp(2.2rem, 6.2vw, 4.1rem);
  line-height: 1.02;
  letter-spacing: -0.05em;
  font-weight: 800;
}
.hi {
  background: linear-gradient(100deg, #ff9d5c 10%, #e2603f 55%, #d9a441 95%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.lead {
  max-width: 54ch;
  color: var(--ink-2);
  font-size: var(--fs-md);
  line-height: 1.65;
}
.lead strong {
  color: var(--ink);
}
.hero-cta {
  margin-top: var(--s2);
}

/* ── prikaz ── */
.demo {
  position: relative;
  display: grid;
  gap: var(--s3);
  animation: fade-up 0.8s var(--ease) 0.12s both;
}
.demo-glow {
  position: absolute;
  inset: -12% -8%;
  background: radial-gradient(50% 50% at 50% 50%, rgba(226, 96, 63, 0.2), transparent 70%);
  filter: blur(30px);
  pointer-events: none;
}

.panel-mock,
.phone-mock {
  position: relative;
  background: var(--surface);
  border: 1px solid var(--line-strong);
  border-radius: var(--r-lg);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}

.pm-head {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s3);
  border-bottom: 1px solid var(--line);
  background: var(--surface-2);
  font-size: var(--fs-sm);
}
.pm-dots {
  display: flex;
  gap: 4px;
}
.pm-dots i {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--line-strong);
}
.pm-head strong {
  flex: 1;
}
.pm-live {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: var(--fs-xs);
  color: var(--ok);
  font-weight: 700;
}

.pm-body {
  padding: var(--s2);
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-height: 196px;
  position: relative;
}
.pm-order {
  display: flex;
  align-items: center;
  gap: var(--s2);
  padding: var(--s2) var(--s3);
  border-radius: var(--r);
  background: var(--surface-2);
  border: 1px solid var(--line);
  font-size: var(--fs-sm);
}
.pm-order strong {
  display: block;
  line-height: 1.25;
}
.pm-order span {
  font-size: var(--fs-xs);
  color: var(--faint);
}
.pm-order.fresh {
  border-color: var(--brand);
  background: var(--tint-brand);
  animation: pulse-ring 2s ease-out 2;
}
.pm-order.urgent {
  border-color: var(--warn);
  background: var(--tint-warn);
}
.pm-ico {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface);
  flex: none;
}
.pm-right {
  text-align: right;
  flex: none;
}
.pm-right b {
  display: block;
  font-variant-numeric: tabular-nums;
}
.pm-tag {
  font-size: 10px;
  font-weight: 750;
  color: var(--brand-soft);
}
.pm-tag.hot {
  color: var(--warn);
}

.feed-move {
  transition: transform 0.55s var(--ease);
}
.feed-enter-active {
  transition: all 0.55s var(--ease);
}
.feed-leave-active {
  transition: all 0.35s var(--ease);
  position: absolute;
  left: var(--s2);
  right: var(--s2);
}
.feed-enter-from {
  opacity: 0;
  transform: translateY(-14px) scale(0.97);
}
.feed-leave-to {
  opacity: 0;
  transform: translateX(24px);
}

/* telefon */
.phone-mock {
  width: 232px;
  justify-self: end;
  margin-top: calc(-1 * var(--s6));
  border-radius: 26px;
  border-width: 6px;
  border-color: var(--surface-3);
}
@media (max-width: 980px) {
  .phone-mock {
    display: none;
  }
}
.ph-notch {
  height: 18px;
  background: var(--surface-3);
}
.ph-cover {
  height: 62px;
  background: linear-gradient(150deg, var(--brand) 0%, #7a2f1c 100%);
}
.ph-body {
  padding: var(--s3);
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin-top: -22px;
}
.ph-mark {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: var(--r-sm);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  font-size: 1.1rem;
}
.ph-name {
  font-size: var(--fs-sm);
  margin-top: 2px;
}
.ph-tag {
  font-size: 10px;
  color: var(--gold);
  font-weight: 650;
  margin-bottom: var(--s2);
}
.ph-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px;
  border-radius: var(--r-sm);
  background: var(--surface-2);
  border: 1px solid var(--line);
}
.ph-item b {
  display: block;
  font-size: 10.5px;
}
.ph-item i {
  font-style: normal;
  font-size: 9px;
  color: var(--faint);
}
.ph-thumb {
  width: 26px;
  height: 26px;
  display: grid;
  place-items: center;
  border-radius: 5px;
  background: var(--surface-3);
  font-size: 12px;
  flex: none;
}
.ph-price {
  font-size: 10.5px;
  font-weight: 750;
  color: var(--brand);
}
.ph-cart {
  margin-top: var(--s2);
  padding: 8px;
  border-radius: var(--r-full);
  background: var(--brand);
  color: #fff;
  font-size: 10.5px;
  font-weight: 700;
  text-align: center;
}

/* ── brojke ── */
.stats {
  position: relative;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
  gap: var(--s3);
  margin-top: var(--s8);
  padding-top: var(--s5);
  border-top: 1px solid var(--line);
}
.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.stat strong {
  font-size: var(--fs-xl);
  font-weight: 780;
  letter-spacing: -0.03em;
  background: linear-gradient(100deg, #ff9d5c, #e2603f);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.stat span {
  font-size: var(--fs-sm);
  color: var(--muted);
}

/* ── sekcije ── */
.section {
  padding: var(--s9) var(--s5);
}
.sec-head {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s3);
  text-align: center;
  margin-bottom: var(--s7);
}
.sec-head h2 {
  font-size: clamp(1.6rem, 3.6vw, 2.4rem);
  letter-spacing: -0.04em;
  max-width: 22ch;
}
.lead-sm {
  max-width: 58ch;
  color: var(--muted);
  line-height: 1.65;
}

.three-up {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(270px, 100%), 1fr));
  gap: var(--s4);
}
.sys {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding: var(--s5);
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--line);
  transition: border-color var(--fast), transform var(--fast), box-shadow var(--fast);
}
.sys:hover {
  border-color: var(--brand);
  transform: translateY(-3px);
  box-shadow: var(--shadow);
}
.sys-ico {
  font-size: 1.9rem;
  width: 56px;
  height: 56px;
  display: grid;
  place-items: center;
  border-radius: var(--r);
  background: var(--tint-brand);
}
.ticks {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  font-size: var(--fs-sm);
  color: var(--ink-2);
}
.ticks li {
  display: flex;
  gap: var(--s2);
}
.ticks li::before {
  content: '✓';
  color: var(--ok);
  font-weight: 800;
  flex: none;
}

.feat-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(272px, 100%), 1fr));
  gap: var(--s3);
}
.feat {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding: var(--s5);
  border-radius: var(--r-md);
  background: var(--surface);
  border: 1px solid var(--line);
  transition: border-color var(--fast), background var(--fast);
}
.feat:hover {
  border-color: var(--line-strong);
  background: var(--surface-2);
}
/* Prva mogućnost je i najvažnija — zato zauzima dvostruko mesto. */
.feat-wide {
  grid-column: span 2;
  background: var(--tint-brand);
  border-color: var(--brand);
}
@media (max-width: 620px) {
  .feat-wide {
    grid-column: span 1;
  }
}
.feat h4 {
  font-size: var(--fs-md);
}
.feat p {
  font-size: var(--fs-sm);
  color: var(--muted);
  line-height: 1.6;
}
.feat-ico {
  font-size: 1.5rem;
  width: 46px;
  height: 46px;
  display: grid;
  place-items: center;
  border-radius: var(--r);
  background: var(--surface-3);
  margin-bottom: var(--s2);
}

.steps {
  list-style: none;
  padding: 0;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(228px, 100%), 1fr));
  gap: var(--s4);
}
.steps li {
  display: flex;
  flex-direction: column;
  gap: var(--s2);
  padding-top: var(--s4);
  border-top: 2px solid var(--line-strong);
}
.steps p {
  font-size: var(--fs-sm);
  color: var(--muted);
  line-height: 1.6;
}
.step-n {
  font-family: var(--font-mono);
  font-size: var(--fs-lg);
  font-weight: 800;
  letter-spacing: -0.04em;
  background: linear-gradient(100deg, #ff9d5c, #e2603f);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

/* ── kontakt ── */
.cta {
  position: relative;
  overflow: hidden;
  border-radius: var(--r-xl);
  background: var(--surface);
  border: 1px solid var(--line-strong);
  padding: var(--s9) var(--s5);
}
.cta-glow {
  position: absolute;
  inset: auto -20% -60% -20%;
  height: 560px;
  background: radial-gradient(50% 50% at 50% 50%, rgba(226, 96, 63, 0.3), transparent 70%);
  filter: blur(30px);
  pointer-events: none;
}
.cta-in {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--s4);
  text-align: center;
}

.phone-big {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--s4) var(--s6);
  border-radius: var(--r-lg);
  background: var(--surface-2);
  border: 1px solid var(--line-strong);
  transition: all var(--fast);
}
.phone-big:hover {
  border-color: var(--brand);
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.phone-big .xs {
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--faint);
  font-weight: 650;
}
.phone-big strong {
  font-size: clamp(1.3rem, 4.4vw, 1.9rem);
  font-weight: 780;
  letter-spacing: -0.02em;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

/* ── podnožje ── */
.foot {
  border-top: 1px solid var(--line);
  padding: var(--s6) 0;
  background: var(--bg-deep);
}
.foot-in {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--s4);
  flex-wrap: wrap;
}
.foot-links {
  display: flex;
  gap: var(--s4);
  font-size: var(--fs-sm);
  font-weight: 550;
  color: var(--muted);
  flex-wrap: wrap;
}
.foot-links a:hover {
  color: var(--ink);
}

@media (max-width: 640px) {
  .hero {
    padding-top: var(--s7);
  }
  .section {
    padding: var(--s7) var(--s4);
  }
  .cta {
    padding: var(--s7) var(--s4);
  }
}

@media (prefers-reduced-motion: reduce) {
  .mesh {
    animation: none;
  }
}
</style>
