import { createRegistryClient, type RegistryClient } from './registryClient'
import { getAppConfig } from './config'

let client: RegistryClient | null = null

/** Process-wide registry client built from the server configuration. */
export function getRegistryClient(): RegistryClient {
  if (client) return client
  const cfg = getAppConfig()
  client = createRegistryClient({
    baseUrl: cfg.registryUrl,
    username: cfg.registryUsername || undefined,
    password: cfg.registryPassword || undefined,
  })
  return client
}
