/** One typed model for every character destination, so Shell and pages never split paths by hand */
export const gearViews = ['progress', 'plan', 'owned', 'simulations'] as const
export const performanceViews = ['standing', 'keys', 'leaders', 'history', 'reports'] as const
export type GearView = (typeof gearViews)[number]
export type PerformanceView = (typeof performanceViews)[number]
export type CharacterSection = 'overview' | 'gear' | 'performance' | 'wardrobe'
export type CharacterDestination =
  | { section: 'overview' | 'wardrobe' }
  | { section: 'gear'; view: GearView }
  | { section: 'performance'; view: PerformanceView }

export const gearViewLabels: Record<GearView, string> = { progress: 'Progress', plan: 'Plan', owned: 'Owned', simulations: 'Simulations' }
export const performanceViewLabels: Record<PerformanceView, string> = { standing: 'Your standing', keys: 'Key range', leaders: 'Leaders', history: 'History', reports: 'Reports' }
export const sectionLabels: Record<CharacterSection, string> = { overview: 'Overview', gear: 'Gear', performance: 'Performance', wardrobe: 'Wardrobe' }

export type Resolution =
  | { kind: 'ok'; destination: CharacterDestination }
  | { kind: 'redirect'; destination: CharacterDestination }
  | { kind: 'unknown' }

const legacy: Record<string, CharacterDestination> = {
  progression: { section: 'gear', view: 'progress' },
  inventory: { section: 'gear', view: 'owned' },
  simulations: { section: 'gear', view: 'simulations' },
  standings: { section: 'performance', view: 'standing' },
  top: { section: 'performance', view: 'leaders' },
}

/** Turn the two path segments after the character id into one destination, or an explicit redirect or not-found result */
export function resolveCharacterPath(section: string | undefined, view?: string): Resolution {
  if (!section || section === 'overview') return view ? { kind: 'unknown' } : { kind: 'ok', destination: { section: 'overview' } }
  if (section === 'wardrobe') return view ? { kind: 'unknown' } : { kind: 'ok', destination: { section: 'wardrobe' } }
  if (section === 'gear') {
    // A bare gear link is the old planner and keeps meaning Plan; the sidebar links to Progress explicitly
    if (!view) return { kind: 'redirect', destination: { section: 'gear', view: 'plan' } }
    return (gearViews as readonly string[]).includes(view) ? { kind: 'ok', destination: { section: 'gear', view: view as GearView } } : { kind: 'unknown' }
  }
  if (section === 'performance') {
    if (!view) return { kind: 'redirect', destination: { section: 'performance', view: 'standing' } }
    return (performanceViews as readonly string[]).includes(view) ? { kind: 'ok', destination: { section: 'performance', view: view as PerformanceView } } : { kind: 'unknown' }
  }
  const alias = legacy[section]
  return alias && !view ? { kind: 'redirect', destination: alias } : { kind: 'unknown' }
}

export function destinationPath(characterId: string, destination: CharacterDestination) {
  const base = `/characters/${encodeURIComponent(characterId)}/${destination.section}`
  return 'view' in destination ? `${base}/${destination.view}` : base
}

export function destinationLabel(destination: CharacterDestination) {
  if (destination.section === 'gear') return `Gear · ${gearViewLabels[destination.view]}`
  if (destination.section === 'performance') return `Performance · ${performanceViewLabels[destination.view]}`
  return sectionLabels[destination.section]
}

/** The default view each parent destination opens in */
export function defaultDestination(section: CharacterSection): CharacterDestination {
  if (section === 'gear') return { section: 'gear', view: 'progress' }
  if (section === 'performance') return { section: 'performance', view: 'standing' }
  return { section }
}

/** Switching characters keeps the section and child view, so Gear · Plan stays Gear · Plan */
export function sameDestinationFor(pathname: string): CharacterDestination | null {
  const match = pathname.match(/^\/characters\/[^/]+\/([^/]+)(?:\/([^/]+))?/)
  if (!match) return null
  const resolved = resolveCharacterPath(match[1], match[2])
  return resolved.kind === 'unknown' ? null : resolved.destination
}

const returnTargets = [/^\/tonight$/, /^\/week(\?expanded=[\w-]+)?$/, /^\/characters(\?selected=[\w-]+)?$/, /^\/characters\/[\w-]+\/(overview|wardrobe|(gear|performance)\/[a-z]+)$/]
/** Return destinations are internal hash routes only, never external or script URLs */
export function safeReturn(value: unknown): string | null {
  return typeof value === 'string' && value.length <= 200 && returnTargets.some(pattern => pattern.test(value)) ? value : null
}
