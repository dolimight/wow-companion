/**
 * Secondary stat diminishing returns. Rating above each threshold is worth less, so the percentage
 * the game displays (effective) is smaller than the percentage the rating would give with no penalty (raw)
 */
export const drBrackets = [
  { from: 0, to: 30, penalty: 0 },
  { from: 30, to: 40, penalty: 0.1 },
  { from: 40, to: 50, penalty: 0.2 },
  { from: 50, to: 60, penalty: 0.3 },
  { from: 60, to: 80, penalty: 0.4 },
  { from: 80, to: 200, penalty: 0.5 },
] as const
export type DrBracket = (typeof drBrackets)[number]

/** CurvePoint 21024, verified against client 12.1.5.70783: raw 30/40/50/60/80/200 maps to 30/39/47/54/66/126 */
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
