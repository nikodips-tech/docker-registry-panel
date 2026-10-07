/**
 * In-memory cache on unstorage (docs/03, "Cache").
 *
 * - `blob:<digest>`   raw manifest / index / config JSON. Content-addressed, so it never
 *                     expires; a bounded number of entries is kept (oldest evicted first).
 * - `image:<name>`    resolved tag table for a repository, TTL = CACHE_TTL_SECONDS,
 *                     invalidated by DELETE and by `?refresh=1`.
 * - `catalog`         repository list, same TTL.
 *
 * The memory driver can be swapped for Redis later without touching the callers.
 */
import { createStorage, type StorageValue } from 'unstorage'
import memoryDriver from 'unstorage/drivers/memory'

const storage = createStorage({ driver: memoryDriver() })

const MAX_BLOBS = 5000
const blobKeys: string[] = []

interface Expiring<T> {
  value: T
  expiresAt: number
}

function blobKey(digest: string): string {
  return `blob:${digest.replace(':', '-')}`
}

function imageKey(name: string): string {
  return `image:${name.replace(/\//g, '--')}`
}

export async function getBlob<T extends StorageValue>(digest: string): Promise<T | null> {
  return (await storage.getItem<T>(blobKey(digest))) ?? null
}

export async function setBlob<T extends StorageValue>(digest: string, value: T): Promise<void> {
  const key = blobKey(digest)
  if (!(await storage.hasItem(key))) {
    blobKeys.push(key)
    while (blobKeys.length > MAX_BLOBS) {
      const oldest = blobKeys.shift()!
      await storage.removeItem(oldest)
    }
  }
  await storage.setItem(key, value)
}

async function getExpiring<T extends StorageValue>(key: string): Promise<T | null> {
  const entry = await storage.getItem<Expiring<T>>(key)
  if (!entry) return null
  if (entry.expiresAt <= Date.now()) {
    await storage.removeItem(key)
    return null
  }
  return entry.value
}

async function setExpiring<T extends StorageValue>(key: string, value: T, ttlSeconds: number): Promise<void> {
  await storage.setItem(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 } satisfies Expiring<T>)
}

export function getImageCache<T extends StorageValue>(name: string): Promise<T | null> {
  return getExpiring<T>(imageKey(name))
}

export function setImageCache<T extends StorageValue>(name: string, value: T, ttlSeconds: number): Promise<void> {
  return setExpiring(imageKey(name), value, ttlSeconds)
}

export async function invalidateImage(name: string): Promise<void> {
  await storage.removeItem(imageKey(name))
}

export function getCatalogCache<T extends StorageValue>(): Promise<T | null> {
  return getExpiring<T>('catalog')
}

export function setCatalogCache<T extends StorageValue>(value: T, ttlSeconds: number): Promise<void> {
  return setExpiring('catalog', value, ttlSeconds)
}

export async function invalidateCatalog(): Promise<void> {
  await storage.removeItem('catalog')
}

/** Drop everything (used by tests). */
export async function clearCache(): Promise<void> {
  await storage.clear()
  blobKeys.length = 0
}
