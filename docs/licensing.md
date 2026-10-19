# Project license and accompanying notices

The original project code and documentation are licensed under **AGPL-3.0-only**. The complete, unmodified text in the repository root `LICENSE` is imported directly for the project-license disclosure in Settings and copied to `.output/LICENSE` during ordinary production builds. Third-party software, fonts, copied source and bundled runtime components retain their own applicable terms; displaying the project license does not relicense them or user-generated Invoices and Business Profile data.

## Manually maintained third-party notices

`public/third-party-notices.txt` is the single repository-owned source for accompanying third-party notices. It is served unchanged at `/third-party-notices.txt` and copied to `.output/public/third-party-notices.txt` with the public assets in the complete application distribution. Ship the complete `.output`, including the server, public assets and project `LICENSE`. The PWA prepares it as a normal static asset, including content-based revisions when only the text changes. Settings does not link to or catalogue this resource.

There is no notice generator, dependency scanner, licensing approval record, freshness check or build-time guarantee that the file is complete. Maintainers are responsible for reviewing and updating it before distributing changes that affect shipped material. Review notices when upgrading, adding or removing dependencies; changing copied source or fonts; or changing build tools that emit distributed runtime code. Consider the actual browser and server distribution, transitive dependencies, bundled subcomponents, copied code and generated runtime contributions; a package manager's production/development classification alone does not establish what ships.

For each applicable component, preserve supplied copyright, attribution, permission, disclaimer and upstream NOTICE wording in full. Keep cumulative grants and document any selected licensing alternative clearly. Retain font-specific terms, including Reserved Font Names, and preserve upstream notices in source or vendored files in place. Include full operative text, not only package names, SPDX identifiers or links. Review the completed accompanying text as maintainer work; it is not an automated legal audit or certification.

Ordinary development, lint, typechecking, tests and builds do not regenerate or rewrite the notices file. Update the checked-in text directly as part of the same reviewed change, then run the repository's normal verification commands. A normal production build copies the public resource into the distribution and PWA asset lifecycle; no separately maintained root-level notices duplicate is required.

## Scope

The project license and third-party notices accompany different material and have separate terms. Notice distribution does not by itself satisfy every obligation that may apply to a particular deployment. This project does not implement corresponding-source delivery or a network source offer, and this notice file does not certify compliance for arbitrary deployments, containers, toolchains or packaging formats. Applicable obligations remain the distributor's responsibility.
