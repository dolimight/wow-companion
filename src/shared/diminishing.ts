/**
 * Secondary stat diminishing returns. Rating above each threshold is worth less, so the percentage
 * the game displays (effective) is smaller than the percentage the rating would give with no penalty (raw)
 */
export const drBrackets = [
  { from: 0, to: 30, penalty: 0 },
  { from: 30, to: 39, penalty: 0.1 },
  { from: 39, to: 47, penalty: 0.2 },
  { from: 47, to: 54, penalty: 0.3 },
  { from: 54, to: 66, penalty: 0.4 },
  { from: 66, to: 126, penalty: 0.5 },
] as const
export type DrBracket = (typeof drBrackets)[number]

/** Effective percentage reached at the end of each bracket, e.g. 30, 38.1, 44.5, 49.4, 56.6, 86.6 */
const effectiveEnds = (() => { let total = 0; return drBrackets.map(b => (total += (b.to - b.from) * (1 - b.penalty))) })()
export const maxEffective = effectiveEnds.at(-1)!

export type DrReading = {
  /** Percentage the rating would give with no penalty */
  raw: number
  /** Percentage lost to diminishing returns */
  lost: number
  /** Bracket the next point of rating falls into */
  bracket: number
  /** Share of a rating point's value that the next point keeps (1 = full value) */
  nextValue: number
  capped: boolean
}

/** Percentage the game displays for a penalty-free percentage, the opposite of diminishing() */
export function effectiveFromRaw(raw: number) {
  let total = 0
  for (const b of drBrackets) {
    if (raw <= b.from) break
    total += (Math.min(raw, b.to) - b.from) * (1 - b.penalty)
  }
  return total
}

/** Works backwards from the displayed percentage to the penalty-free one and the bracket the player is in */
export function diminishing(effective: number): DrReading {
  const value = Math.max(0, effective)
  let start = 0
  for (let i = 0; i < drBrackets.length; i++) {
    const b = drBrackets[i]!
    if (value < effectiveEnds[i]! - 1e-9) {
      const raw = b.from + (value - start) / (1 - b.penalty)
      return { raw, lost: raw - value, bracket: i, nextValue: 1 - b.penalty, capped: false }
    }
    start = effectiveEnds[i]!
  }
  const last = drBrackets.at(-1)!
  return { raw: last.to, lost: last.to - maxEffective, bracket: drBrackets.length - 1, nextValue: 0, capped: true }
}
