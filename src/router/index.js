import { createRouter, createWebHistory } from 'vue-router'
import { role, authReady, needsOnboarding, restaurant } from '@/stores/auth'
import { firebaseReady } from '@/firebase'

// Panele učitavamo tek kad zatrebaju — gost skida samo svoj deo koda,
// što je bitno jer meni najčešće otvara na mobilnom internetu.
const routes = [
  {
    path: '/',
    name: 'landing',
    component: () => import('@/views/Landing.vue'),
    meta: { title: 'RDS — Restaurant Digital Solutions' },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('@/views/Login.vue'),
    meta: { title: 'Prijava · RDS', guestOnly: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('@/views/Register.vue'),
    meta: { title: 'Aktivacija naloga · RDS' },
  },
  {
    path: '/setup',
    name: 'setup',
    component: () => import('@/views/Setup.vue'),
    meta: { title: 'Podešavanje · RDS' },
  },

  // ─── Platforma (super admin + administratori) ───────────────
  {
    path: '/admin',
    component: () => import('@/views/admin/AdminLayout.vue'),
    meta: { requires: 'platform' },
    children: [
      {
        path: '',
        name: 'admin',
        component: () => import('@/views/admin/AdminDashboard.vue'),
        meta: { title: 'Pregled platforme · RDS' },
      },
      {
        path: 'restorani',
        name: 'admin-restaurants',
        component: () => import('@/views/admin/AdminRestaurants.vue'),
        meta: { title: 'Restorani · RDS' },
      },
      {
        path: 'restorani/:id',
        name: 'admin-restaurant',
        component: () => import('@/views/admin/AdminRestaurantDetail.vue'),
        meta: { title: 'Restoran · RDS' },
      },
      {
        path: 'tim',
        name: 'admin-team',
        component: () => import('@/views/admin/AdminTeam.vue'),
        meta: { title: 'Administratori · RDS' },
      },
    ],
  },

  // ─── Vlasnički panel ────────────────────────────────────────
  {
    path: '/panel',
    component: () => import('@/views/panel/PanelLayout.vue'),
    meta: { requires: 'owner' },
    children: [
      {
        path: '',
        name: 'panel',
        component: () => import('@/views/panel/PanelLive.vue'),
        meta: { title: 'Porudžbine uživo · RDS' },
      },
      {
        path: 'meni',
        name: 'panel-menu',
        component: () => import('@/views/panel/PanelMenu.vue'),
        meta: { title: 'Meni · RDS' },
      },
      {
        path: 'raspored',
        name: 'panel-floor',
        component: () => import('@/views/panel/PanelFloor.vue'),
        meta: { title: 'Raspored stolova · RDS' },
      },
      {
        path: 'poruke',
        name: 'panel-chat',
        component: () => import('@/views/panel/PanelChat.vue'),
        meta: { title: 'Poruke · RDS' },
      },
      {
        path: 'ocene',
        name: 'panel-reviews',
        component: () => import('@/views/panel/PanelReviews.vue'),
        meta: { title: 'Ocene i utisci · RDS' },
      },
      {
        path: 'istorija',
        name: 'panel-orders',
        component: () => import('@/views/panel/PanelOrders.vue'),
        meta: { title: 'Istorija porudžbina · RDS' },
      },
      {
        path: 'izvestaji',
        name: 'panel-stats',
        component: () => import('@/views/panel/PanelStats.vue'),
        meta: { title: 'Izveštaji · RDS' },
      },
      {
        path: 'podesavanja',
        name: 'panel-settings',
        component: () => import('@/views/panel/PanelSettings.vue'),
        meta: { title: 'Podešavanja · RDS' },
      },
    ],
  },
  {
    path: '/panel/pocetak',
    name: 'onboarding',
    component: () => import('@/views/panel/PanelOnboarding.vue'),
    meta: { requires: 'owner', title: 'Podešavanje lokala · RDS' },
  },

  // ─── Gost ───────────────────────────────────────────────────
  {
    path: '/r/:slug',
    name: 'guest',
    component: () => import('@/views/guest/GuestApp.vue'),
    meta: { title: 'Meni · RDS' },
  },
  {
    path: '/r/:slug/porudzbina/:orderId',
    name: 'guest-order',
    component: () => import('@/views/guest/GuestTrack.vue'),
    meta: { title: 'Praćenje porudžbine · RDS' },
  },

  { path: '/:pathMatch(.*)*', name: 'notfound', component: () => import('@/views/NotFound.vue') },
]

export const router = createRouter({
  history: createWebHistory(),
  routes,
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    if (to.hash) return { el: to.hash, behavior: 'smooth', top: 80 }
    return { top: 0 }
  },
})

/** Kuda korisnika vodi njegova uloga kad otvori golu adresu. */
export function homeFor(r) {
  if (r === 'platform') return { name: 'admin' }
  if (r === 'owner') return { name: 'panel' }
  return { name: 'landing' }
}

router.beforeEach(async (to) => {
  // Bez Firebase podataka nema ni prijave — pošalji na uputstvo.
  if (!firebaseReady && to.name !== 'setup' && to.name !== 'landing') {
    return { name: 'setup' }
  }

  const need = to.meta.requires

  // Uloga se čeka samo za stranice koje je traže. Meni gosta je javan,
  // pa nema razloga da stoji dok mreža ne javi ko je prijavljen —
  // upravo to je držalo prazan ekran posle skeniranja koda.
  if (need && !authReady.value) {
    await new Promise((resolve) => {
      const stop = setInterval(() => {
        if (authReady.value) {
          clearInterval(stop)
          resolve()
        }
      }, 30)
    })
  }

  if (need === 'platform' && role.value !== 'platform') {
    return role.value === 'owner'
      ? { name: 'panel' }
      : { name: 'login', query: { next: to.fullPath } }
  }

  if (need === 'owner' && role.value !== 'owner') {
    return role.value === 'platform'
      ? { name: 'admin' }
      : { name: 'login', query: { next: to.fullPath } }
  }

  // Vlasnik koji još nije uneo podatke ide pravo na čarobnjak.
  if (role.value === 'owner' && needsOnboarding.value && to.name !== 'onboarding') {
    if (String(to.path).startsWith('/panel')) return { name: 'onboarding' }
  }
  // Uslov `restaurant.value` je bitan: dok podaci lokala nisu stigli,
  // „ne treba onboarding“ ne znači ništa i vlasnik bi bio izbačen sa
  // čarobnjaka na prazan panel.
  if (to.name === 'onboarding' && role.value === 'owner' && restaurant.value && !needsOnboarding.value) {
    return { name: 'panel' }
  }

  // Već prijavljen nema šta da traži na stranici za prijavu.
  if (to.meta.guestOnly && (role.value === 'platform' || role.value === 'owner')) {
    return homeFor(role.value)
  }

  return true
})

router.afterEach((to) => {
  document.title = to.meta.title || 'RDS — Restaurant Digital Solutions'
})
