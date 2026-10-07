import { defineConfig } from 'vitest/config'

// Unit tests target server/, shared/ and app/utils (plain Node, no Nuxt runtime).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['server/**/*.test.ts', 'shared/**/*.test.ts', 'app/utils/**/*.test.ts'],
  },
})
