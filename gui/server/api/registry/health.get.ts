import type { HealthResponse } from '../../../shared/types/registry'
import { getAppConfig } from '../../utils/config'
import { getRegistryClient } from '../../utils/registry'

/** GET /api/registry/health — pings GET /v2/ and reports the public configuration. */
export default defineEventHandler(async (): Promise<HealthResponse> => {
  const cfg = getAppConfig()
  const base: Omit<HealthResponse, 'ok' | 'apiVersion'> = {
    title: cfg.title,
    pullUrl: cfg.pullUrl,
    deleteEnabled: cfg.deleteEnabled,
    showTagCount: cfg.showTagCount,
    theme: cfg.theme,
    catalogMinBranches: cfg.catalogMinBranches,
    catalogMaxBranches: cfg.catalogMaxBranches,
  }
  try {
    const ping = await getRegistryClient().ping()
    return { ...base, ok: true, apiVersion: ping.apiVersion }
  }
  catch (err) {
    return { ...base, ok: false, apiVersion: null, error: err instanceof Error ? err.message : String(err) }
  }
})
