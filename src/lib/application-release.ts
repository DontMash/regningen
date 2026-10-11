import packageManifest from '../../package.json'
import changelogMarkdown from '../../CHANGELOG.md?raw'
import { createReleaseCatalog } from './release-catalog'

export const applicationVersion = packageManifest.version
export const applicationReleases = createReleaseCatalog(
  changelogMarkdown,
  applicationVersion,
)
