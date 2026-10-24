import { readFileSync } from 'node:fs'
import { relative, resolve } from 'node:path'
import ts from 'typescript'

/** Explicit feature roles; names/suffixes alone do not establish responsibility. */
export const applicationRoles = {
  domain: [
    'src/features/invoicing/validation-domain.ts',
    'src/features/invoicing/profile-domain.ts',
    'src/features/invoicing/generation-domain.ts',
  ],
  contract: [
    'src/features/invoicing/validation-contract.ts',
    'src/features/invoicing/profile-contract.ts',
    'src/features/invoicing/generation-contract.ts',
    'src/features/invoicing/invoice-draft-persistence.ts',
    'src/features/release-notes/acknowledgment-persistence.ts',
  ],
  state: [
    'src/features/invoicing/profile-query-state.ts',
    'src/features/invoicing/profile-editor-state.ts',
    'src/features/invoicing/invoice-editor-state.ts',
    'src/features/invoicing/invoice-generation-state.ts',
    'src/features/invoicing/invoice-draft-store.ts',
    'src/features/invoicing/business-profile-storage-status.ts',
    'src/features/release-notes/ReleaseNotesProvider.tsx',
  ],
  service: [
    'src/features/invoicing/iban-service.ts',
    'src/features/invoicing/business-profile-repository.ts',
    'src/features/invoicing/invoice-draft-storage.ts',
    'src/features/invoicing/pdf.ts',
    'src/features/invoicing/pdf-download.ts',
    'src/features/release-notes/browser-acknowledgment-persistence.ts',
    'src/lib/validation.ts',
    'src/lib/zod.ts',
  ],
  composition: [
    'src/router.tsx',
    'src/routes/__root.tsx',
    'src/features/invoicing/business-profile-query.ts',
    'src/features/invoicing/validation-composition.ts',
    'src/features/invoicing/invoice-editor-composition.ts',
    'src/features/invoicing/invoice-page-composition.tsx',
    'src/features/invoicing/invoice-draft.ts',
    'src/features/release-notes/ReleaseNotesComposition.tsx',
  ],
}

/** ESLint guardrail, not a semantic architecture or test-structure checker.
 * Follow unclassified helpers/re-exports so moving a package into shared code
 * cannot launder an edge. Declared supported boundaries are checked separately.
 */
export function dependencyBoundaries(root, roles = applicationRoles) {
  const roleByPath = new Map(
    Object.entries(roles).flatMap(([role, paths]) =>
      paths.map((path) => [resolve(root, path), role]),
    ),
  )
  function roleOf(path) {
    if (/\.(test|spec)\./.test(path)) return undefined
    return (
      roleByPath.get(path) ??
      (relative(root, path).startsWith('src/') && path.endsWith('.tsx')
        ? 'ui'
        : undefined)
    )
  }
  const options = {
    moduleResolution: ts.ModuleResolutionKind.Bundler,
    module: ts.ModuleKind.ESNext,
    baseUrl: root,
    paths: { '@/*': ['src/*'] },
    allowJs: true,
  }
  function localPath(specifier, importer) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
    return (
      ts.resolveModuleName(specifier, importer, options, ts.sys).resolvedModule
        ?.resolvedFileName ?? null
    )
  }
  function forbidden(origin, target) {
    if (origin === 'domain')
      return target && target !== 'domain' && target !== 'contract'
    if (origin === 'contract') return target && target !== 'contract'
    if (origin === 'state')
      return ['domain', 'service', 'composition'].includes(target)
    return origin === 'ui' && ['domain', 'service'].includes(target)
  }
  function violation(origin, specifier, importer, seen = new Set()) {
    const path = localPath(specifier, importer)
    if (!path) {
      return origin === 'domain' || origin === 'contract' ? [specifier] : null
    }
    if (seen.has(path)) return null
    seen.add(path)
    const target = roleOf(path)
    if (forbidden(origin, target)) return [relative(root, path)]
    // Declared roles are independently linted. UI may consume composition;
    // app-state may use presentation/state tools, but not implementation selection.
    if (
      target &&
      target !== 'contract' &&
      origin !== 'domain' &&
      origin !== 'contract'
    )
      return null
    const text = readFileSync(path, 'utf8')
    for (const dependency of ts.preProcessFile(text, true, true)
      .importedFiles) {
      const chain = violation(origin, dependency.fileName, path, seen)
      if (chain) return [relative(root, path), ...chain]
    }
    return null
  }
  return {
    files: ['src/**/*.{js,jsx,ts,tsx}'],
    plugins: {
      architecture: {
        rules: {
          'dependency-boundaries': {
            meta: {
              type: 'problem',
              schema: [],
              messages: {
                forbidden:
                  '{{role}} dependency crosses a protected boundary: {{chain}}. Use a domain/service contract and supply implementations in composition.',
              },
            },
            create(context) {
              const filename = context.filename
              const role = roleOf(filename)
              if (!['domain', 'contract', 'state', 'ui'].includes(role))
                return {}
              function check(node, value) {
                if (typeof value !== 'string') return
                const chain = violation(role, value, filename)
                if (chain)
                  context.report({
                    node,
                    messageId: 'forbidden',
                    data: {
                      role,
                      chain: [relative(root, filename), ...chain].join(' -> '),
                    },
                  })
              }
              return {
                ImportDeclaration: (node) =>
                  check(node.source, node.source.value),
                ExportNamedDeclaration: (node) =>
                  node.source && check(node.source, node.source.value),
                ExportAllDeclaration: (node) =>
                  check(node.source, node.source.value),
                ImportExpression: (node) =>
                  check(node.source, node.source.value),
                CallExpression: (node) => {
                  if (
                    node.callee.type === 'Identifier' &&
                    node.callee.name === 'require'
                  )
                    check(node, node.arguments[0]?.value)
                },
                TSImportType: (node) =>
                  check(
                    node,
                    node.argument?.value ?? node.argument?.literal?.value,
                  ),
              }
            },
          },
        },
      },
    },
    rules: { 'architecture/dependency-boundaries': 'error' },
  }
}
