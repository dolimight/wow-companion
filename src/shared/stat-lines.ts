export type StatReading = { name: string; value: number }

/** Reads a tooltip line such as "+1,234 Critical Strike" or "3,402 Armor"; other lines return null */
export function parseStat(text: string): StatReading | null {
  const match = text.replace(/\([^)]*\)/g, '').match(/^\s*([+-]?)([\d,]+(?:\.\d+)?)\s*%?\s+(.+?)\s*$/)
  if (!match) return null
  const value = Number(match[2]!.replace(/,/g, ''))
  if (!Number.isFinite(value)) return null
  return { name: match[3]!.trim(), value: match[1] === '-' ? -value : value }
}

export type StatChange = { name: string; mine: number; top: number; delta: number; secondary: boolean }

/** What swapping from one item to the other does to each stat; a stat only one item has counts as zero on the other */
export function compareStats(mine: Array<{ text: string; secondary: boolean }>, top: Array<{ text: string; secondary: boolean }>): StatChange[] {
  const rows = new Map<string, StatChange>()
  const add = (lines: typeof mine, side: 'mine' | 'top') => {
    for (const line of lines) {
      const stat = parseStat(line.text)
      if (!stat) continue
      const key = stat.name.toLowerCase()
      const row = rows.get(key) ?? { name: stat.name, mine: 0, top: 0, delta: 0, secondary: line.secondary }
      row[side] += stat.value
      row.secondary ||= line.secondary
      rows.set(key, row)
    }
  }
  add(mine, 'mine')
  add(top, 'top')
  return [...rows.values()].map(row => ({ ...row, delta: row.top - row.mine })).sort((a, b) => Number(a.secondary) - Number(b.secondary) || Math.abs(b.delta) - Math.abs(a.delta))
}
