import assert from 'node:assert/strict'
import test from 'node:test'
import { inject } from '../lib/index.js'

test('DSH 0.2.2 host services used by apply are declared in inject', () => {
  assert.ok(Array.isArray(inject))
  for (const service of ['tools', 'webServer', 'sessionController']) {
    assert.ok(inject.includes(service), `missing inject service: ${service}`)
  }
})

test('pet package remains a DSH bundle with a web client half', async () => {
  const { readFile } = await import('node:fs/promises')
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
  assert.match(pkg.engines.dsh, /<0\.3\.0/)
  assert.equal(pkg.dsh.manifestVersion, 1)
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
})
