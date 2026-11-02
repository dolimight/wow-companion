import { test } from 'node:test'
import assert from 'node:assert/strict'
import { installerIcon } from './icon.ts'

test('release packaging embeds purple Nightly icons and retains classic Stable icons', () => {
  assert.equal(installerIcon('0.1.1-nightly.20261102.18'), 'public/assets/wow-companion-nightly.ico')
  assert.equal(installerIcon('0.1.1'), 'public/assets/wow-companion.ico')
})
