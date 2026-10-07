// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: ['@nuxt/eslint'],
  // Internal console: pure SPA, no SSR (see docs/03-architettura.md)
  ssr: false,
  devtools: { enabled: true },
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
