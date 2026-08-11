<script setup>
defineProps({
  size: { type: Number, default: 32 },
  showText: { type: Boolean, default: true },
})
</script>

<template>
  <span class="logo">
    <svg
      :width="size"
      :height="size"
      viewBox="0 0 64 64"
      aria-hidden="true"
      class="mark"
    >
      <defs>
        <linearGradient :id="'lg' + size" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#ff9d5c" />
          <stop offset="1" stop-color="#e2603f" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="16" fill="currentColor" class="plate" />
      <path
        d="M19 15h13.6c7 0 11.6 4.1 11.6 10.4 0 4.6-2.6 8-6.9 9.4L45 49h-8.7l-6.8-12.6H26V49h-7V15zm7 6.3v9.1h6c3.2 0 5.1-1.7 5.1-4.6s-1.9-4.5-5.1-4.5h-6z"
        :fill="'url(#lg' + size + ')'"
      />
    </svg>

    <span v-if="showText" class="text">
      <span class="name">RDS</span>
      <span class="sub">Restaurant Digital Solutions</span>
    </span>
  </span>
</template>

<style scoped>
.logo {
  display: inline-flex;
  align-items: center;
  gap: var(--s3);
}
.mark {
  color: var(--surface-3);
  flex: none;
  border-radius: var(--r-sm);
}
[data-theme='dark'] .mark {
  color: #12141d;
}
.text {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  min-width: 0;
}
.name {
  font-weight: 800;
  letter-spacing: -0.03em;
  font-size: var(--fs-md);
}
.sub {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.11em;
  color: var(--faint);
  font-weight: 650;
  white-space: nowrap;
}
</style>
