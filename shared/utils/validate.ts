/**
 * Validation of registry identifiers (OCI Distribution Spec, "Pulling manifests").
 * Used by the server before any value reaches a registry URL.
 */

// <name> ::= <component>("/"<component>)*  component ::= [a-z0-9]+(([._]|__|[-]*)[a-z0-9]+)*
const NAME_COMPONENT = '[a-z0-9]+(?:(?:[._]|__|-+)[a-z0-9]+)*'
const NAME_RE = new RegExp(`^${NAME_COMPONENT}(?:/${NAME_COMPONENT})*$`)
const TAG_RE = /^[a-zA-Z0-9_][a-zA-Z0-9._-]{0,127}$/
const DIGEST_RE = /^[a-z0-9]+(?:[+._-][a-z0-9]+)*:[a-f0-9]{32,}$/

export function isValidRepositoryName(name: string): boolean {
  return name.length > 0 && name.length <= 255 && NAME_RE.test(name)
}

export function isValidTag(tag: string): boolean {
  return TAG_RE.test(tag)
}

export function isValidDigest(digest: string): boolean {
  return DIGEST_RE.test(digest)
}

/** A manifest reference is either a tag or a digest. */
export function isValidReference(ref: string): boolean {
  return isValidTag(ref) || isValidDigest(ref)
}
