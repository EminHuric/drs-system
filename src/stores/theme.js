import { ref, watchEffect } from 'vue'

const KEY = 'rds.theme'

function initial() {
  const saved = localStorage.getItem(KEY)
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

export const theme = ref(initial())

watchEffect(() => {
  document.documentElement.setAttribute('data-theme', theme.value)
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme.value === 'light' ? '#f4f6fa' : '#0a0c12')
  localStorage.setItem(KEY, theme.value)
})

export function toggleTheme() {
  theme.value = theme.value === 'dark' ? 'light' : 'dark'
}
