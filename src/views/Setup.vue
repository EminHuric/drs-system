<script setup>
// Ekran koji se pojavi kad .env nije popunjen — bolje jasno uputstvo
// nego bela stranica i greška u konzoli.
import AuthShell from '@/components/AuthShell.vue'
import { firebaseReady, firebaseConfig } from '@/firebase'

const missing = Object.entries({
  VITE_FIREBASE_API_KEY: firebaseConfig.apiKey,
  VITE_FIREBASE_AUTH_DOMAIN: firebaseConfig.authDomain,
  VITE_FIREBASE_PROJECT_ID: firebaseConfig.projectId,
  VITE_FIREBASE_STORAGE_BUCKET: firebaseConfig.storageBucket,
  VITE_FIREBASE_MESSAGING_SENDER_ID: firebaseConfig.messagingSenderId,
  VITE_FIREBASE_APP_ID: firebaseConfig.appId,
})
  .filter(([, v]) => !v)
  .map(([k]) => k)
</script>

<template>
  <AuthShell
    title="Sistem još nije povezan sa bazom"
    subtitle="Nedostaju Firebase podaci. Bez njih nema prijave ni porudžbina."
  >
    <ol class="steps">
      <li>
        Otvorite <a class="linkish" href="https://console.firebase.google.com" target="_blank" rel="noopener">console.firebase.google.com</a>
        i napravite projekat (besplatni <strong>Spark</strong> plan je dovoljan).
      </li>
      <li>
        U projektu uključite <strong>Authentication</strong> → Sign-in method →
        <strong>Email/Password</strong> i <strong>Anonymous</strong>.
      </li>
      <li>Napravite <strong>Firestore Database</strong> (Production mode).</li>
      <li>
        Project settings → Your apps → <strong>Web app</strong>. Prepišite vrednosti
        iz <code>firebaseConfig</code>.
      </li>
      <li>
        U korenu projekta kopirajte <code>.env.example</code> u <code>.env</code>, popunite ga i
        ponovo pokrenite <code>npm run dev</code>.
      </li>
      <li>
        Postavite pravila: <code>firebase deploy --only firestore:rules</code>
        (ili nalepite sadržaj <code>firestore.rules</code> u Firestore → Rules).
      </li>
    </ol>

    <div v-if="!firebaseReady && missing.length" class="note note-warn small">
      <div>
        <strong>Nedostaje u .env fajlu:</strong>
        <ul class="miss">
          <li v-for="m in missing" :key="m"><code>{{ m }}</code></li>
        </ul>
      </div>
    </div>

    <p class="hint">
      Ako je aplikacija na Vercel-u, iste vrednosti idu u Project Settings → Environment
      Variables, pa <strong>Redeploy</strong>.
    </p>
  </AuthShell>
</template>

<style scoped>
.steps {
  display: flex;
  flex-direction: column;
  gap: var(--s3);
  padding-left: var(--s5);
  font-size: var(--fs-sm);
  color: var(--ink-2);
  line-height: 1.6;
}
.steps li::marker {
  color: var(--brand-soft);
  font-weight: 700;
}
code {
  font-family: var(--font-mono);
  font-size: 0.85em;
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-3);
}
.miss {
  margin: var(--s2) 0 0;
  padding-left: var(--s4);
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.linkish {
  color: var(--brand-soft);
  font-weight: 600;
}
.linkish:hover {
  text-decoration: underline;
}
</style>
