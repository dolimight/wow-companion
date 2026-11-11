import { describe, expect, it } from 'vite-plus/test'
import type { UpdateState } from '../../shared/updates'
import { updateNotice } from './notices'

const state = (patch: Partial<UpdateState>): UpdateState => ({ currentVersion: '0.1.0', channel: 'stable', autoDownload: false, status: 'idle', availableVersion: null, progress: null, releaseNotes: null, releaseUrl: null, checkedAt: null, error: null, disabledReason: null, blockers: [], ...patch })

describe('update notices', () => {
  it('announces a found update when the player downloads by hand', () => {
    expect(updateNotice(state({ status: 'checking' }), state({ status: 'available', availableVersion: '0.1.1' }))).toMatchObject({ key: 'available:0.1.1', body: 'Version 0.1.1 is ready to download from Updates' })
  })
  it('stays quiet about a found update that downloads on its own, then announces it is ready', () => {
    expect(updateNotice(state({ status: 'checking' }), state({ status: 'available', availableVersion: '0.1.1', autoDownload: true }))).toBeNull()
    expect(updateNotice(state({ status: 'downloading', availableVersion: '0.1.1' }), state({ status: 'ready', availableVersion: '0.1.1' }))).toMatchObject({ key: 'ready:0.1.1' })
  })
  it('ignores progress and other updates of the same state', () => {
    expect(updateNotice(state({ status: 'downloading', availableVersion: '0.1.1', progress: 10 }), state({ status: 'downloading', availableVersion: '0.1.1', progress: 40 }))).toBeNull()
    expect(updateNotice(null, state({ status: 'idle' }))).toBeNull()
  })
})
