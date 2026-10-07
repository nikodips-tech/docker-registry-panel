import type { DeleteResponse } from '../../../shared/types/registry'
import { isValidDigest, isValidRepositoryName } from '../../../shared/utils/validate'
import { invalidateImage } from '../../utils/cache'
import { getAppConfig } from '../../utils/config'
import { withApiErrors } from '../../utils/errors'
import { getRegistryClient } from '../../utils/registry'
import { tagsPointingAt } from '../../utils/resolver'

/**
 * DELETE /api/repositories/<name>/manifests/<digest>
 * Deletes a manifest by digest (the registry has no per-tag delete) and returns the
 * tags that pointed at it. Refused unless DELETE_IMAGES=true.
 */
export default defineEventHandler(async (event): Promise<DeleteResponse> => {
  const cfg = getAppConfig()
  if (!cfg.deleteEnabled) {
    throw createError({ statusCode: 403, statusMessage: 'Forbidden', message: 'Deleting images is disabled (DELETE_IMAGES is not true)' })
  }
  const segments = (getRouterParam(event, 'path') ?? '').split('/').filter(Boolean).map(decodeURIComponent)
  if (segments.length < 3 || segments.at(-2) !== 'manifests') {
    throw createError({ statusCode: 404, statusMessage: 'Not Found', message: 'Expected /api/repositories/<name>/manifests/<digest>' })
  }
  const name = segments.slice(0, -2).join('/')
  const digest = segments.at(-1)!
  if (!isValidRepositoryName(name)) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid repository name: ${name}` })
  if (!isValidDigest(digest)) throw createError({ statusCode: 400, statusMessage: 'Bad Request', message: `Invalid digest: ${digest}` })

  return withApiErrors(async () => {
    const client = getRegistryClient()
    const tags = await tagsPointingAt(client, name, digest)
    await client.deleteManifest(name, digest)
    await invalidateImage(name)
    return { deleted: true, digest, tags }
  })
})
