export interface ReleaseEntry {
  version: string
  markdown: string
}

const SEMVER_PATTERN =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/

function semverParts(version: string) {
  const match = SEMVER_PATTERN.exec(version)
  if (!match) return null

  const [, major, minor, patch, prerelease = ''] = match
  return {
    major: Number(major),
    minor: Number(minor),
    patch: Number(patch),
    prerelease: prerelease ? prerelease.split('.') : [],
  }
}

function comparePrerelease(left: string[], right: string[]) {
  if (!left.length) return right.length ? 1 : 0
  if (!right.length) return -1

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const leftPart = left[index]
    const rightPart = right[index]
    if (leftPart === rightPart) continue

    const leftNumeric = /^\d+$/.test(leftPart)
    const rightNumeric = /^\d+$/.test(rightPart)
    if (leftNumeric && rightNumeric) {
      return Number(leftPart) - Number(rightPart)
    }
    if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1
    return leftPart < rightPart ? -1 : 1
  }

  return left.length - right.length
}

function compareSemver(left: string, right: string) {
  const a = semverParts(left)!
  const b = semverParts(right)!
  return (
    a.major - b.major ||
    a.minor - b.minor ||
    a.patch - b.patch ||
    comparePrerelease(a.prerelease, b.prerelease)
  )
}

function parseReleasedSections(changelog: string): ReleaseEntry[] {
  const headings = [...changelog.matchAll(/^##[ \t]+([^\r\n]+)$/gm)]
  const releases: ReleaseEntry[] = []

  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index]
    const version = heading[1]
      .trim()
      .match(
        /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)$/,
      )?.[1]
    if (!version) continue

    const bodyStart = heading.index + heading[0].length
    const nextHeading = headings.at(index + 1)
    const bodyEnd = nextHeading?.index ?? changelog.length
    releases.push({
      version,
      markdown: changelog.slice(bodyStart, bodyEnd).trim(),
    })
  }

  return releases
}

export function createReleaseCatalog(
  changelog: string,
  currentVersion: string,
): ReleaseEntry[] {
  if (!semverParts(currentVersion)) {
    throw new Error('package.json must contain a valid SemVer version.')
  }

  const releases = parseReleasedSections(changelog)
  const seen = new Set<string>()
  for (const release of releases) {
    if (seen.has(release.version)) {
      throw new Error(
        `CHANGELOG.md contains duplicate release entries for v${release.version}.`,
      )
    }
    seen.add(release.version)
  }

  releases.sort((left, right) => compareSemver(right.version, left.version))
  const latestRelease = releases.at(0)

  if (!releases.some((release) => release.version === currentVersion)) {
    throw new Error(
      `CHANGELOG.md is missing release notes for v${currentVersion}.`,
    )
  }
  if (latestRelease?.version !== currentVersion) {
    throw new Error(
      `The current package version v${currentVersion} does not match the latest changelog entry v${latestRelease?.version}.`,
    )
  }

  return releases
}
