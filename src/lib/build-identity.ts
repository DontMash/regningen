export type BuildIdentity = {
  version: string
  commit: string | null
}

type BuildInputs = {
  RELEASE_BUILD?: string | undefined
  RELEASE_COMMIT?: string | undefined
}

/** Resolve build inputs once; the server serves the resulting bundled literal. */
export function resolveBuildIdentity(
  version: string,
  inputs: BuildInputs,
): BuildIdentity {
  const commit = inputs.RELEASE_COMMIT?.toLowerCase() || null
  if (
    (inputs.RELEASE_BUILD === 'true' && !commit) ||
    (commit !== null && !/^[a-fA-F0-9]{40}$/.test(commit))
  ) {
    throw new Error('RELEASE_COMMIT must be a full 40-character Git SHA.')
  }
  return { version, commit }
}
