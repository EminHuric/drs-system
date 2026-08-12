import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { initAuth } from './stores/auth'
import { prefetchVenue } from './lib/venueCache'
import './stores/theme'

import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'

// Ekran se crta ODMAH. Ranije se čekalo da Firebase Auth javi ko je
// prijavljen, pa je gost koji skenira kod gledao u prazno sve dok
// mreža ne odgovori — na slaboj vezi i po nekoliko sekundi. A meniju
// prijava uopšte ne treba: on je javan.
//
// Uloga se i dalje čeka, ali samo na stranicama koje je traže
// (panel i admin), i to u čuvaru rute — vidi router/index.js.

// Adresa lokala se zna iz putanje pre nego što se ijedan ekran napravi.
// Meni kreće da se dovlači odmah, uporedo sa podizanjem aplikacije —
// gost tako ne čeka dva posla jedan za drugim.
const naMeniju = location.pathname.match(/^\/r\/([^/]+)/)
if (naMeniju) prefetchVenue(decodeURIComponent(naMeniju[1]))

createApp(App).use(router).mount('#app')

initAuth()
