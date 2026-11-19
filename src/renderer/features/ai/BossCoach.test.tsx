import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { focusManager, onlineManager, QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema } from '../../../shared/domain'
import type { JournalBoss } from '../../../shared/dungeons'
import { api } from '../../lib/client'
import { BossCoach } from './BossCoach'

vi.mock('../../lib/client', () => ({ api: { aiAsk: vi.fn() } }))
vi.mock('./ai', () => ({ useAiProvider: () => ({ id: 'claude', name: 'Claude', description: '', installed: true, version: null, signedIn: true, detail: null }) }))

const knight = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight', specName: 'Blood', specId: 250 })
const boss = { encounterId: 1, name: 'The Golden Serpent', overview: '', portrait: null, abilities: [], tips: [] } as unknown as JournalBoss

// Rendered on the server, so the desktop bridge the icons check for is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('boss coach', () => {
  it('shows the button and never calls the assistant on its own, even on focus or reconnect', async () => {
    const client = new QueryClient()
    const page = (role: 'tank' | 'damage') => renderToStaticMarkup(<QueryClientProvider client={client}><BossCoach character={knight} instance="Kings' Rest" difficulty="Mythic+" boss={boss} role={role} plan={undefined} /></QueryClientProvider>)
    expect(page('tank')).toContain('Ask Claude for Blood Death Knight tips')
    expect(page('damage')).toContain('Ask Claude')
    focusManager.setFocused(true)
    onlineManager.setOnline(true)
    await client.refetchQueries()
    expect(api.aiAsk).not.toHaveBeenCalled()
  })

  it('shows an answer already given for this boss and role without asking again', () => {
    const client = new QueryClient()
    const input = { characterId: 'c1', instance: "Kings' Rest", difficulty: 'Mythic+', boss: 'The Golden Serpent', role: 'tank', notes: [] }
    client.setQueryData(['ai', 'bossCoach', 'claude', input], { provider: 'Claude', durationMs: 9000, value: { tips: ['Face the boss away'], cooldowns: [] } })
    const html = renderToStaticMarkup(<QueryClientProvider client={client}><BossCoach character={knight} instance="Kings' Rest" difficulty="Mythic+" boss={boss} role="tank" plan={undefined} /></QueryClientProvider>)
    expect(html).toContain('Face the boss away')
    expect(api.aiAsk).not.toHaveBeenCalled()
  })
})
