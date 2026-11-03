<script setup lang="ts">
/** Decorative pickleball: a lime ball with its holes. */
const holes = [
  [50, 22],
  [28, 36],
  [72, 36],
  [50, 50],
  [22, 62],
  [78, 62],
  [38, 74],
  [62, 74],
  [50, 88],
  [36, 48],
  [64, 48],
]
</script>

<template>
  <svg viewBox="0 0 100 100" aria-hidden="true">
    <defs>
      <radialGradient id="pb-shade" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stop-color="#ecf7c9" />
        <stop offset="45%" stop-color="#c9e86a" />
        <stop offset="100%" stop-color="#7c9a26" />
      </radialGradient>
    </defs>
    <circle cx="50" cy="50" r="48" fill="url(#pb-shade)" />
    <circle
      v-for="[x, y] in holes"
      :key="`${x}-${y}`"
      :cx="x"
      :cy="y"
      r="4.2"
      fill="#7c9a26"
      fill-opacity="0.55"
    />
  </svg>
</template>
