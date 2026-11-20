import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { renderToStaticMarkup } from 'react-dom/server'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { characterSchema } from '../../../shared/domain'
import { weekStart } from '../../../shared/weekly'
import { PlannedRaids, ReminderToggle } from './raid-reminders'

const now = new Date().toISOString()
const knight = characterSchema.parse({
  id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight',
  weekly: { addon: { source: 'addon', observedAt: now, weekStart: new Date(weekStart('us')!).toISOString(), vault: [], lockouts: [{ name: 'Sepulcher of the First Ones', difficulty: 'Heroic', killed: 4, total: 11, raid: true }], runs: [] } },
})
const plan = { name: 'Sepulcher of the First Ones', difficulty: 'Heroic', addedAt: now }

// Rendered on the server, so the desktop bridge is simply absent
beforeAll(() => { vi.stubGlobal('window', {}) })

describe('raid reminders', () => {
  const render = (node: React.ReactNode, reminders: typeof plan[]) => {
    const client = new QueryClient()
    client.setQueryData(['raid-reminders', 'c1'], { reminders })
    return renderToStaticMarkup(<QueryClientProvider client={client}>{node}</QueryClientProvider>)
  }

  it('offers to add a lockout to reminders, and shows when it is already planned', () => {
    expect(render(<ReminderToggle character={knight} lockout={plan} />, [])).toContain('Add to reminders')
    expect(render(<ReminderToggle character={knight} lockout={plan} />, [plan])).toContain('In reminders')
  })

  it('lists planned raids with where each stands this week', () => {
    const html = render(<PlannedRaids characters={[knight]} />, [plan])
    expect(html).toContain('Sepulcher of the First Ones · Heroic')
    expect(html).toContain('4/11 bosses')
    expect(html).toContain('Dol · Gurubashi')
    expect(render(<PlannedRaids characters={[knight]} />, [])).toContain('Use Add to reminders')
  })
})
