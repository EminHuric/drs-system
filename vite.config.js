import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    // RDS je uvek na 5173. `strictPort` je namerno: bez njega Vite tiho
    // pređe na 5174 kad je port zauzet, pa se u browseru lako otvori
    // pogrešna aplikacija. Ovako umesto toga stigne jasna greška.
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Firebase i QR biblioteka idu u svoje pakete: gost koji samo
        // gleda meni ne skida kod za štampanje QR-a, a paketi se
        // keširaju odvojeno od koda aplikacije.
        manualChunks(id) {
          // AI stize samo kad gost otvori pomocnika ili prebaci jezik.
          // Bez ovoga bi zavrsio u glavnom paketu i svaki gost bi ga
          // skinuo, iako se uvozi tek po potrebi.
          if (id.includes('@firebase/ai') || id.includes('firebase/ai')) {
            return 'firebase-ai'
          }
          if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
            return 'firebase'
          }
          if (id.includes('node_modules/qrcode') || id.includes('node_modules/dijkstrajs')) {
            return 'qrcode'
          }
        },
      },
    },
  },
})
