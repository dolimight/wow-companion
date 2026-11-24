/**
 * Tags that describe how an item, mount, or pet looks, so the model viewer can find "purple", "fire", or "effect".
 * Colours come from the icon's pixels and the effect's particle colours; themes come from names and effect colours
 */

export const lookColors = ['red', 'orange', 'gold', 'green', 'teal', 'blue', 'purple', 'pink', 'white', 'gray', 'black', 'brown'] as const
export type LookColor = (typeof lookColors)[number]

/** Swatches for the colour filter */
export const colorSwatches: Record<LookColor, string> = {
  red: '#d84a3c', orange: '#e8873a', gold: '#e2c044', green: '#5fb85a', teal: '#3fb6b0', blue: '#4a7fe0', purple: '#9a5ae0', pink: '#e070b8',
  white: '#ececec', gray: '#8a8a8a', black: '#262626', brown: '#8a5a34',
}

/** The colour name of one pixel, or null when it is too dark and dull to say */
export function colorName(r: number, g: number, b: number): LookColor {
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const value = max / 255, saturation = max ? (max - min) / max : 0
  if (value < 0.16) return 'black'
  if (saturation < 0.18) return value > 0.78 ? 'white' : value < 0.32 ? 'black' : 'gray'
  let hue = 0
  if (max === r) hue = ((g - b) / (max - min)) % 6
  else if (max === g) hue = (b - r) / (max - min) + 2
  else hue = (r - g) / (max - min) + 4
  hue = (hue * 60 + 360) % 360
  if (hue < 15 || hue >= 345) return 'red'
  if (hue < 40) return value < 0.55 && saturation > 0.35 ? 'brown' : 'orange'
  if (hue < 65) return value < 0.5 ? 'brown' : 'gold'
  if (hue < 160) return 'green'
  if (hue < 195) return 'teal'
  if (hue < 255) return 'blue'
  if (hue < 300) return 'purple'
  return 'pink'
}

/**
 * The colours that make up a picture, most of it first: each colour covering at least `share` of the visible pixels,
 * with neutral colours counted only when they dominate. `pixels` is RGBA
 */
export function paletteOf(pixels: Uint8Array | Buffer, width: number, height: number, share = 0.18): LookColor[] {
  const counts = new Map<LookColor, number>()
  let total = 0
  // Every other pixel is plenty, and the icon's frame (the outer eighth) is left out
  const inset = Math.floor(Math.min(width, height) / 8)
  for (let y = inset; y < height - inset; y += 2) {
    for (let x = inset; x < width - inset; x += 2) {
      const at = (y * width + x) * 4
      if (pixels[at + 3]! < 128) continue
      const name = colorName(pixels[at]!, pixels[at + 1]!, pixels[at + 2]!)
      counts.set(name, (counts.get(name) ?? 0) + 1)
      total++
    }
  }
  if (!total) return []
  const neutral = new Set<LookColor>(['black', 'gray', 'white', 'brown'])
  return [...counts].filter(([name, count]) => count / total >= (neutral.has(name) ? share * 2 : share)).sort((a, b) => b[1] - a[1]).map(([name]) => name)
}

/** Themes and the words in a name, or the effect colours, that suggest them */
const themes: Array<{ tag: string; words: RegExp; colors?: LookColor[] }> = [
  { tag: 'fire', words: /\b(fire|flame|blaze|ember|inferno|molten|magma|burn|sear|scorch|pyre|cinder|ash|lava|sun|solar)/i, colors: ['orange', 'red', 'gold'] },
  { tag: 'frost', words: /\b(frost|ice|icy|frozen|glacial|cold|snow|rime|winter|chill)/i, colors: ['teal'] },
  { tag: 'shadow', words: /\b(shadow|void|dark|umbral|night|dread|abyss|gloom|dusk|twilight)/i, colors: ['purple'] },
  { tag: 'holy', words: /\b(holy|light|radiant|divine|sacred|dawn|blessed|hallowed|lumin)/i },
  { tag: 'fel', words: /\b(fel|demon|legion|infernal)/i, colors: ['green'] },
  { tag: 'nature', words: /\b(nature|leaf|leaves|bark|root|thorn|bloom|grove|wild|vine|petal|moss|verdant)/i },
  { tag: 'arcane', words: /\b(arcane|mana|astral|star|cosmic|rune|spell)/i },
  { tag: 'storm', words: /\b(storm|thunder|lightning|tempest|spark|static)/i },
  { tag: 'blood', words: /\b(blood|sanguine|crimson|gore)/i },
  { tag: 'bone', words: /\b(bone|skull|skeletal|grave|death|lich|necro)/i },
  { tag: 'crystal', words: /\b(crystal|gem|prism|shard|glass|diamond)/i },
  { tag: 'dragon', words: /\b(dragon|drake|wyrm|whelp|scale)/i },
  { tag: 'water', words: /\b(tide|sea|ocean|wave|coral|abyssal|deep|naga|kelp)/i },
]

/** A name's and an effect's theme tags */
export function themeTags(name: string, effectColors: LookColor[] = []): string[] {
  return themes.filter(theme => theme.words.test(name) || (theme.colors && effectColors.some(color => theme.colors!.includes(color)))).map(theme => theme.tag)
}

export const themeNames = themes.map(theme => theme.tag)

/** Everything the search box understands besides names, for fuzzy matching of what the player types */
export type LookTerm = { word: string; kind: 'color' | 'theme' | 'effect' | 'plain'; value: string }
export const lookVocabulary: LookTerm[] = [
  ...lookColors.map(color => ({ word: color, kind: 'color' as const, value: color })),
  { word: 'yellow', kind: 'color', value: 'gold' }, { word: 'grey', kind: 'color', value: 'gray' }, { word: 'violet', kind: 'color', value: 'purple' }, { word: 'cyan', kind: 'color', value: 'teal' },
  ...themeNames.map(theme => ({ word: theme, kind: 'theme' as const, value: theme })),
  { word: 'effect', kind: 'effect', value: 'with' }, { word: 'effects', kind: 'effect', value: 'with' }, { word: 'glowing', kind: 'effect', value: 'with' }, { word: 'particles', kind: 'effect', value: 'with' },
  { word: 'plain', kind: 'plain', value: 'without' },
]

/** The tags stored for a look, comma-wrapped so a filter can match ",purple," */
export const tagString = (tags: string[]) => `,${[...new Set(tags)].join(',')},`
