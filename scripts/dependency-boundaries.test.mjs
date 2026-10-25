import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { ESLint } from 'eslint'
import { dependencyBoundaries } from './dependency-boundaries.mjs'

async function lint(role, source, helpers = {}) {
  const root = await mkdtemp(join(tmpdir(), 'invoice-boundaries-'))
  try {
    const files = {
      'src/subject.js': source,
      'src/domain.js': 'export const operation = 1',
      'src/contract.js': 'export const contract = 1',
      'src/service.js': 'export const capability = 1',
      'src/composition.js': "export { capability } from './service.js'",
      ...helpers,
    }
    for (const [file, text] of Object.entries(files)) {
      await mkdir(dirname(join(root, file)), { recursive: true })
      await writeFile(join(root, file), text)
    }
    const roles = {
      domain: ['src/domain.js'],
      contract: ['src/contract.js'],
      service: ['src/service.js'],
      composition: ['src/composition.js'],
    }
    roles[role] = [...(roles[role] ?? []), 'src/subject.js']
    const eslint = new ESLint({
      cwd: root,
      overrideConfigFile: true,
      overrideConfig: [dependencyBoundaries(root, roles)],
    })
    const [result] = await eslint.lintFiles(['src/subject.js'])
    return result.messages
  } finally {
    await rm(root, { recursive: true, force: true })
  }
}

test('domain business behavior cannot import external business packages', async () => {
  const messages = await lint('domain', "import { z } from 'zod'")
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /domain.*zod.*service contract/i)
})

test('domain cannot consume a package mechanism re-exported through a contract', async () => {
  const messages = await lint('domain', "import { z } from './contract.js'", {
    'src/contract.js': "export { z } from 'zod'",
  })
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /contract.js.*zod/)
})

for (const role of ['domain', 'contract']) {
  test(`${role} rejects infrastructure, including indirect package re-exports`, async () => {
    for (const source of [
      "import './service.js'",
      "export * from './shared.js'",
      "const capability = import('./shared.js')",
      "const capability = require('./shared.js')",
    ]) {
      const messages = await lint(role, source, {
        'src/shared.js': "export * from './bridge.js'",
        'src/bridge.js': "export { z } from 'zod'",
      })
      assert.equal(messages.length, 1, source)
      assert.match(messages[0].message, /service.js|shared.js.*bridge.js.*zod/)
    }
  })
  test(`${role} permits intended contracts and ordinary language facilities`, async () => {
    assert.deepEqual(
      await lint(
        role,
        `${role === 'domain' ? "import './domain.js';" : ''} import './contract.js'; const today = new Date(); Math.round(2.5)`,
      ),
      [],
    )
  })
}

for (const role of ['state', 'ui']) {
  test(`${role} rejects concrete business/service knowledge, even through shared helpers`, async () => {
    for (const target of ['service', 'domain']) {
      for (const source of [
        `import './${target}.js'`,
        "import './shared.js'",
      ]) {
        const messages = await lint(role, source, {
          'src/shared.js': `export * from './${target}.js'`,
        })
        assert.equal(messages.length, 1, source)
        assert.match(
          messages[0].message,
          new RegExp(`${role}.*${target}.js.*composition`),
        )
      }
    }
  })
  test(`${role} rejects direct and indirect business capability packages including subpaths`, async () => {
    for (const dependency of [
      'pdf-lib',
      'pdf-lib/cjs',
      'ibantools',
      'unstorage',
      'unstorage/drivers/localstorage',
      'zod',
      'zod/v4',
    ]) {
      for (const source of [
        `import '${dependency}'`,
        "export * from './shared.js'",
      ]) {
        const messages = await lint(role, source, {
          'src/shared.js': `export * from '${dependency}'`,
        })
        assert.equal(messages.length, 1, `${role}: ${source}`)
      }
    }
  })
  test(`${role} permits service contracts and presentation/state-management tools`, async () => {
    assert.deepEqual(
      await lint(
        role,
        "import './contract.js'; import 'react'; import '@tanstack/store'; import '@base-ui/react/button'; import 'date-fns'; import '@tanstack/react-query'",
      ),
      [],
    )
  })
}

test('contracts cannot expose concrete business implementations', async () => {
  const messages = await lint('contract', "export * from './domain.js'")
  assert.equal(messages.length, 1)
})
test('app-state cannot acquire a concrete business implementation through a contract', async () => {
  const messages = await lint('state', "import './contract.js'", {
    'src/contract.js': "export * from './domain.js'",
  })
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /contract.js.*domain.js/)
})

test('app-state cannot select implementations through composition', async () => {
  const messages = await lint('state', "import './composition.js'")
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /state.*composition.js/)
})
test('UI may consume composed app-state operations', async () => {
  assert.deepEqual(await lint('ui', "import './composition.js'"), [])
})
test('composition selects concrete business and service implementations', async () => {
  assert.deepEqual(
    await lint(
      'composition',
      "import './domain.js'; import './service.js'; import 'unstorage'",
    ),
    [],
  )
})
test('ordinary helper cycles terminate without hiding a forbidden dependency', async () => {
  const messages = await lint('domain', "import './shared.js'", {
    'src/shared.js': "export * from './bridge.js'",
    'src/bridge.js': "export * from './shared.js'; export * from 'ibantools'",
  })
  assert.equal(messages.length, 1)
  assert.match(messages[0].message, /ibantools/)
})
