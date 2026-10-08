import type { RepositoriesResponse, RepositorySummary } from '../../shared/types/registry'
import { getCatalogCache, setCatalogCache } from '../utils/cache'
import { pLimit } from '../utils/concurrency'
import { getAppConfig } from '../utils/config'
import { withApiErrors } from '../utils/errors'
import { getRegistryClient } from '../utils/registry'

/**
 * GET /api/repositories[?refresh=1] — the full catalog (all pages).
 * With SHOW_TAG_COUNT=true every repository also carries its tag count (one call each).
 */
export default defineEventHandler(async (event): Promise<RepositoriesResponse> => {
  const cfg = getAppConfig()
  const refresh = getQuery(event).refresh !== undefined
  if (!refresh) {
    const cached = await getCatalogCache<RepositoriesResponse>()
    if (cached) return cached
  }
  return withApiErrors(async () => {
    const client = getRegistryClient()
    const names = (await client.listRepositories()).sort((a, b) => a.localeCompare(b))
    let repositories: RepositorySummary[]
    if (cfg.showTagCount) {
      const run = pLimit(8)
      repositories = await Promise.all(names.map(name => run(async () => {
        const tagCount = await client.listTags(name).then(t => t.length).catch(() => undefined)
        return tagCount === undefined ? { name } : { name, tagCount }
      })))
    }
    else {
      repositories = names.map(name => ({ name }))
    }
    const response: RepositoriesResponse = { repositories, fetchedAt: Date.now() }
    await setCatalogCache(response, cfg.cacheTtlSeconds)
    return response
  })
})
