import { isValidRepositoryName, isValidTag } from '../../../shared/utils/validate'
import { getAppConfig } from '../../utils/config'
import { withApiErrors } from '../../utils/errors'
import { getRegistryClient } from '../../utils/registry'
import { resolveTagDetail, resolveTags } from '../../utils/resolver'

/**
 * Repository names contain slashes and Nitro cannot route a catch-all followed by a
 * fixed segment, so one handler serves both:
 *   GET /api/repositories/<name>/tags[?refresh=1]  -> TagsResponse
 *   GET /api/repositories/<name>/tags/<tag>         -> TagDetail
 * (A tag literally named "tags" is read as a tag listing; the registry then answers 404.)
 */
export default defineEventHandler(async (event) => {
  const segments = (getRouterParam(event, 'path') ?? '').split('/').filter(Boolean).map(decodeURIComponent)
  const cfg = getAppConfig()
  const client = getRegistryClient()

  if (segments.length >= 2 && segments.at(-1) === 'tags') {
    const name = segments.slice(0, -1).join('/')
    assertName(name)
    const refresh = getQuery(event).refresh !== undefined
    return withApiErrors(() => resolveTags(client, name, cfg.cacheTtlSeconds, refresh))
  }

  if (segments.length >= 3 && segments.at(-2) === 'tags') {
    const name = segments.slice(0, -2).join('/')
    const tag = segments.at(-1)!
    assertName(name)
    if (!isValidTag(tag)) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid tag: ${tag}` })
    return withApiErrors(() => resolveTagDetail(client, name, tag, cfg.cacheTtlSeconds))
  }

  throw createError({ statusCode: 404, statusMessage: 'Not Found', message: `No such route: /api/repositories/${segments.join('/')}` })
})

function assertName(name: string): void {
  if (!isValidRepositoryName(name)) {
    throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid repository name: ${name}` })
  }
}
