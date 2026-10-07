import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearCache, getBlob, getCatalogCache, getImageCache, invalidateImage, setBlob, setCatalogCache, setImageCache } from './cache'

afterEach(async () => {
  await clearCache()
  vi.useRealTimers()
})

describe('cache', () => {
  it('stores blobs by digest without expiry', async () => {
    await setBlob('sha256:abc', { hello: 1 })
    expect(await getBlob('sha256:abc')).toEqual({ hello: 1 })
    expect(await getBlob('sha256:nope')).toBeNull()
  })

  it('expires image and catalog entries after the TTL', async () => {
    vi.useFakeTimers()
    await setImageCache('backend/api', { tags: [] }, 60)
    await setCatalogCache(['a'], 60)
    expect(await getImageCache('backend/api')).toEqual({ tags: [] })
    vi.advanceTimersByTime(59_000)
    expect(await getCatalogCache()).toEqual(['a'])
    vi.advanceTimersByTime(2_000)
    expect(await getImageCache('backend/api')).toBeNull()
    expect(await getCatalogCache()).toBeNull()
  })

  it('invalidates one image without touching others', async () => {
    await setImageCache('a', 1, 60)
    await setImageCache('b/c', 2, 60)
    await invalidateImage('a')
    expect(await getImageCache('a')).toBeNull()
    expect(await getImageCache('b/c')).toBe(2)
  })
})
