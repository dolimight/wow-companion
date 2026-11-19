import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { JournalBoss } from '../../../shared/dungeons'
import { MiniPlayContext, PlayBar } from './encounters'

const bosses = [{ encounterId: 1, name: 'The Golden Serpent' }, { encounterId: 2, name: 'Mchimba the Embalmer' }] as unknown as JournalBoss[]
const bar = (mini: boolean) => renderToStaticMarkup(<MiniPlayContext.Provider value={mini}><PlayBar title="Kings' Rest" bosses={bosses} step={0} onStep={() => {}} role="damage" onRole={() => {}} onExit={() => {}} popout="#/mini/c1/dungeons?dungeon=kings-rest&play=1" /></MiniPlayContext.Provider>)

afterEach(() => { vi.unstubAllGlobals() })

describe('play bar', () => {
  it('offers to pop out in the main window when the desktop bridge can open one', () => {
    vi.stubGlobal('window', { companion: { openMiniPlay: async () => {} } })
    vi.stubGlobal('navigator', { platform: 'Win32' })
    const html = bar(false)
    expect(html).toContain('Pop out')
    expect(html).toContain('Exit')
    expect(html).toContain('Next · Mchimba the Embalmer')
  })

  it('closes instead of exiting in the play window, with nothing to pop out', () => {
    vi.stubGlobal('window', { companion: { openMiniPlay: async () => {} } })
    const html = bar(true)
    expect(html).not.toContain('Pop out')
    expect(html).toContain('Close the play window')
  })
})
