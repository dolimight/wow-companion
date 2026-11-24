import { RotateCcw, Sparkles } from 'lucide-react'
import { qualityNames } from '../../../shared/gamedata'
import { colorSwatches, lookColors, themeNames } from '../../../shared/looks'
import { AppSelect } from '../../components/AppSelect'
import { Card } from '../../components/ui/card'
import { Button } from '../../components/ui/primitives'
import { Input } from '../../components/ui/input'
import { Toggle } from '../../components/ui/toggle'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'

/** Everything the side panel can narrow the grid by; items use all of it, mounts and pets the look filters */
export type ModelFilterValues = {
  effect: 'any' | 'with' | 'without'
  colors: string[]
  themes: string[]
  quality: number | null
  source: 'any' | 'dungeon' | 'raid' | 'crafted'
  expansion: number | null
  minLevel: number | null
  maxLevel: number | null
  currentOnly: boolean
}

export const noFilters: ModelFilterValues = { effect: 'any', colors: [], themes: [], quality: null, source: 'any', expansion: null, minLevel: null, maxLevel: null, currentOnly: false }

export const expansionNames = ['Classic', 'The Burning Crusade', 'Wrath of the Lich King', 'Cataclysm', 'Mists of Pandaria', 'Warlords of Draenor', 'Legion', 'Battle for Azeroth', 'Shadowlands', 'Dragonflight', 'The War Within', 'Midnight']

const toggle = (list: string[], value: string) => list.includes(value) ? list.filter(entry => entry !== value) : [...list, value]
const capital = (value: string) => value[0]!.toUpperCase() + value.slice(1)

/**
 * The grid's filters: effects, colours, and themes for every category, which need the looks index, and quality,
 * source, expansion, item level, and season for items
 */
export function ModelFilters({ value, onChange, items, looks }: { value: ModelFilterValues; onChange: (next: ModelFilterValues) => void; items: boolean; looks: { ready: boolean; done: number; total: number } | undefined }) {
  const set = (patch: Partial<ModelFilterValues>) => onChange({ ...value, ...patch })
  const changed = JSON.stringify(value) !== JSON.stringify(noFilters)
  const indexing = !looks?.ready
  const level = (text: string) => { const number = Number(text); return text.trim() && Number.isInteger(number) && number > 0 ? Math.min(number, 2000) : null }
  return (
    <Card as="section" className="model-filters" aria-label="Filters">
      <header>
        <h2>Filters</h2>
        {changed && <Button variant="quiet" onClick={() => onChange(noFilters)}><RotateCcw size={13} aria-hidden="true" />Reset</Button>}
      </header>
      {indexing && <p className="muted small" role="status"><Sparkles size={13} aria-hidden="true" />Reading colors and effects from your game files{looks?.total ? ` · ${Math.floor((looks.done / looks.total) * 100)}%` : '…'}</p>}

      <div className="model-filter">
        <span>Effects</span>
        <ToggleGroup variant="outline" size="sm" value={[value.effect]} disabled={indexing} onValueChange={values => { const next = values[0] as ModelFilterValues['effect'] | undefined; if (next) set({ effect: next }) }} aria-label="Effects">
          <ToggleGroupItem value="any">Any</ToggleGroupItem>
          <ToggleGroupItem value="with">With</ToggleGroupItem>
          <ToggleGroupItem value="without">Without</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <div className="model-filter">
        <span>Colors</span>
        <div className="model-swatches" role="group" aria-label="Colors">
          {lookColors.map(color => (
            <Toggle key={color} variant="outline" size="sm" className="model-swatch" disabled={indexing} pressed={value.colors.includes(color)} onPressedChange={() => set({ colors: toggle(value.colors, color) })} aria-label={capital(color)} title={capital(color)}>
              <span style={{ background: colorSwatches[color] }} aria-hidden="true" />
            </Toggle>
          ))}
        </div>
      </div>

      <div className="model-filter">
        <span>Themes</span>
        <div className="model-chips" role="group" aria-label="Themes">
          {themeNames.map(theme => <Toggle key={theme} variant="outline" size="sm" disabled={indexing} pressed={value.themes.includes(theme)} onPressedChange={() => set({ themes: toggle(value.themes, theme) })}>{capital(theme)}</Toggle>)}
        </div>
      </div>

      {items && (
        <>
          <AppSelect label="Quality" value={value.quality == null ? 'any' : String(value.quality)} options={[{ value: 'any', label: 'Any quality' }, ...qualityNames.map((name, index) => ({ value: String(index), label: name }))]} onValueChange={next => set({ quality: next === 'any' ? null : Number(next) })} />
          <AppSelect label="Source" value={value.source} options={[{ value: 'any', label: 'Any source' }, { value: 'dungeon', label: 'Dungeons' }, { value: 'raid', label: 'Raids' }, { value: 'crafted', label: 'Crafted' }]} onValueChange={next => set({ source: next as ModelFilterValues['source'] })} />
          <AppSelect label="Expansion" value={value.expansion == null ? 'any' : String(value.expansion)} options={[{ value: 'any', label: 'Any expansion' }, ...expansionNames.map((name, index) => ({ value: String(index), label: name })).reverse()]} onValueChange={next => set({ expansion: next === 'any' ? null : Number(next) })} />
          <div className="model-filter">
            <span>Item level</span>
            <div className="model-range">
              <Input inputMode="numeric" placeholder="From" aria-label="Lowest item level" value={value.minLevel ?? ''} onChange={event => set({ minLevel: level(event.target.value) })} />
              <span aria-hidden="true">–</span>
              <Input inputMode="numeric" placeholder="To" aria-label="Highest item level" value={value.maxLevel ?? ''} onChange={event => set({ maxLevel: level(event.target.value) })} />
            </div>
          </div>
          <Toggle variant="outline" size="sm" pressed={value.currentOnly} onPressedChange={currentOnly => set({ currentOnly })}>This season only</Toggle>
        </>
      )}
    </Card>
  )
}
