import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['tests/unit/**/*.spec.ts', 'tests/integration/**/*.spec.ts'],
    // Unit tests run against the in-memory mock data, never a Supabase project.
    env: { VITE_DATA_SOURCE: 'mock' },
    // Database tests boot a Postgres (PGlite) and run every migration.
    testTimeout: 120_000,
    hookTimeout: 300_000,
  },
})
