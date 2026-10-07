/**
 * Server-side configuration (docs/03, "Configurazione").
 *
 * Variables are read from the process environment at runtime, so the same image works
 * with `REGISTRY_URL=...` in docker compose exactly like the previous container did.
 * The build-time runtimeConfig values (nuxt.config.ts) act as fallbacks for `nuxt dev`.
 */

export type ThemeSetting = 'auto' | 'light' | 'dark'

export interface AppConfig {
  registryUrl: string
  registryUsername: string
  registryPassword: string
  title: string
  pullUrl: string
  deleteEnabled: boolean
  showTagCount: boolean
  catalogMinBranches: number
  catalogMaxBranches: number
  cacheTtlSeconds: number
  theme: ThemeSetting
}

let cached: AppConfig | null = null

function hostOf(url: string): string {
  try {
    return new URL(url).host
  }
  catch {
    return url
  }
}

function env(name: string, fallback: unknown): string {
  const v = process.env[name]
  if (v !== undefined && v !== '') return v
  return fallback === undefined || fallback === null ? '' : String(fallback)
}

function bool(v: string): boolean {
  return /^(true|1|yes)$/i.test(v)
}

function int(v: string, fallback: number): number {
  const n = Number.parseInt(v, 10)
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

export function getAppConfig(): AppConfig {
  if (cached) return cached
  const rc = useRuntimeConfig()
  const registryUrl = env('REGISTRY_URL', rc.registryUrl).trim().replace(/\/+$/, '')
  if (!registryUrl) {
    throw createError({ statusCode: 500, statusMessage: 'Server misconfigured', message: 'REGISTRY_URL is not set' })
  }
  const host = hostOf(registryUrl)
  const theme = env('THEME', rc.public.theme)
  cached = {
    registryUrl,
    registryUsername: env('REGISTRY_USERNAME', rc.registryUsername),
    registryPassword: env('REGISTRY_PASSWORD', rc.registryPassword),
    title: env('REGISTRY_TITLE', rc.public.registryTitle) || host,
    pullUrl: env('PULL_URL', rc.public.pullUrl) || host,
    deleteEnabled: bool(env('DELETE_IMAGES', rc.public.deleteImages)),
    showTagCount: bool(env('SHOW_TAG_COUNT', rc.public.showTagCount)),
    catalogMinBranches: int(env('CATALOG_MIN_BRANCHES', rc.public.catalogMinBranches), 1),
    catalogMaxBranches: int(env('CATALOG_MAX_BRANCHES', rc.public.catalogMaxBranches), 1),
    cacheTtlSeconds: int(env('CACHE_TTL_SECONDS', rc.cacheTtlSeconds), 60),
    theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
  }
  return cached
}
