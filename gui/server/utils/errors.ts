import { RegistryError } from './registryClient'
import { ManifestParseError } from './manifest'

/**
 * Convert errors thrown by the registry layer into h3 errors with a stable JSON body:
 * `{ statusCode, statusMessage, message, data: { kind, registryErrors } }`.
 */
export function toApiError(err: unknown): Error {
  if (err instanceof RegistryError) {
    return createError({
      statusCode: err.httpStatus,
      statusMessage: statusMessageFor(err.httpStatus),
      message: err.message,
      data: { kind: err.kind, registryErrors: err.errors.map(e => ({ code: e.code, message: e.message })) },
    })
  }
  if (err instanceof ManifestParseError) {
    return createError({ statusCode: 502, statusMessage: 'Bad Gateway', message: err.message, data: { kind: 'parse' } })
  }
  if (err instanceof TypeError) {
    // identifier validation failures
    return createError({ statusCode: 400, statusMessage: 'Bad Request', message: err.message, data: { kind: 'validation' } })
  }
  return err instanceof Error ? err : new Error(String(err))
}

function statusMessageFor(status: number): string {
  switch (status) {
    case 404: return 'Not Found'
    case 405: return 'Method Not Allowed'
    case 503: return 'Service Unavailable'
    default: return 'Bad Gateway'
  }
}

/** Wrap a handler body so registry errors become API errors. */
export async function withApiErrors<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  }
  catch (err) {
    throw toApiError(err)
  }
}
