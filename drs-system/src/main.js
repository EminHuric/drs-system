import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router'
import { initAuth } from './stores/auth'
import './stores/theme'

import './styles/tokens.css'
import './styles/base.css'
import './styles/ui.css'

// Uloga se čita pre prvog crtanja — inače bi guard na trenutak
// izbacio prijavljenog korisnika na stranicu za prijavu.
initAuth().finally(() => {
  createApp(App).use(router).mount('#app')
})
