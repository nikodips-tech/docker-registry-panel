import { defineConfig } from 'vitest/config'

// Unit tests target server/ and shared/ code only (plain Node, no Nuxt runtime).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts'],
  },
})
