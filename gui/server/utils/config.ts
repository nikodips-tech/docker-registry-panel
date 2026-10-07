/**
 * Server-side configuration, derived from runtimeConfig (see nuxt.config.ts and docs/03).
 */

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

export function getAppConfig(): AppConfig {
  if (cached) return cached
  const rc = useRuntimeConfig()
  const registryUrl = String(rc.registryUrl ?? '').trim()
  if (!registryUrl) {
    throw createError({ statusCode: 500, statusMessage: 'Server misconfigured', message: 'REGISTRY_URL is not set' })
  }
  const host = hostOf(registryUrl)
  cached = {
    registryUrl,
    registryUsername: String(rc.registryUsername ?? ''),
    registryPassword: String(rc.registryPassword ?? ''),
    title: String(rc.public.registryTitle || host),
    pullUrl: String(rc.public.pullUrl || host),
    deleteEnabled: Boolean(rc.public.deleteImages),
    showTagCount: Boolean(rc.public.showTagCount),
    catalogMinBranches: Number(rc.public.catalogMinBranches) || 1,
    catalogMaxBranches: Number(rc.public.catalogMaxBranches) || 1,
    cacheTtlSeconds: Number(rc.cacheTtlSeconds) || 60,
  }
  return cached
}
