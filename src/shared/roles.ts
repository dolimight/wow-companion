/** Which role each specialization plays, by its specialization ID, in one place for every page and the engine */
export type Role = 'tank' | 'healer' | 'damage'

export const tankSpecIds: ReadonlySet<number> = new Set([250, 104, 268, 66, 73, 581])
export const healerSpecIds: ReadonlySet<number> = new Set([65, 105, 256, 257, 264, 270, 1468])

export function specRole(specId: number | null | undefined): Role {
  if (specId && tankSpecIds.has(specId)) return 'tank'
  if (specId && healerSpecIds.has(specId)) return 'healer'
  return 'damage'
}
