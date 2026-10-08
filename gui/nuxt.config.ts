// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  // Internal console: pure SPA, no SSR (see docs/03-architettura.md)
  ssr: false,
  devtools: { enabled: true },
  app: {
    head: {
      title: 'Registry Panel',
      meta: [{ name: 'viewport', content: 'width=device-width, initial-scale=1' }],
    },
  },
  // Fonts are bundled from node_modules and served by this app, never from Google Fonts.
  css: [
    '@fontsource/ibm-plex-sans/latin-400.css',
    '@fontsource/ibm-plex-sans/latin-500.css',
    '@fontsource/ibm-plex-sans/latin-600.css',
    '@fontsource/ibm-plex-mono/latin-400.css',
    '@fontsource/ibm-plex-mono/latin-500.css',
    '~/assets/css/tokens.css',
    '~/assets/css/app.css',
  ],
  runtimeConfig: {
    // Server-only: read from env (NUXT_ prefix) or set below
    registryUrl: process.env.REGISTRY_URL ?? '',
    registryUsername: process.env.REGISTRY_USERNAME ?? '',
    registryPassword: process.env.REGISTRY_PASSWORD ?? '',
    cacheTtlSeconds: Number(process.env.CACHE_TTL_SECONDS ?? 60),
    public: {
      registryTitle: process.env.REGISTRY_TITLE ?? '',
      pullUrl: process.env.PULL_URL ?? '',
      deleteImages: process.env.DELETE_IMAGES === 'true',
      showTagCount: process.env.SHOW_TAG_COUNT === 'true',
      catalogMinBranches: Number(process.env.CATALOG_MIN_BRANCHES ?? 1),
      catalogMaxBranches: Number(process.env.CATALOG_MAX_BRANCHES ?? 1),
      theme: process.env.THEME ?? 'auto',
    },
  },
  // Nuxt 4 directory layout (app/, shared/) while staying on Nuxt 3.x
  future: { compatibilityVersion: 4 },
  compatibilityDate: '2025-07-15',
  typescript: { strict: true },
  eslint: { config: { stylistic: true } },
})
