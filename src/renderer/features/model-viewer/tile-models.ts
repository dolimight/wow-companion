import { api } from '../../lib/client'
import type { ViewSubject } from './scene'

/** What a tile shows: an item, worn by the stand-in when it has no model of its own, or a creature */
export type TileTarget = { kind: 'item'; itemId: number; worn: boolean } | { kind: 'creature'; displayId: number }

export const tileKey = (target: TileTarget) => target.kind === 'item' ? `${target.worn ? 'worn' : 'item'}:${target.itemId}` : `creature:${target.displayId}`

/** Reads a tile's model from the game files */
export async function loadSubject(target: TileTarget): Promise<ViewSubject | null> {
  if (target.kind === 'creature') { const model = await api.creatureModel(target.displayId); return model ? { kind: 'creature', model } : null }
  if (target.worn) { const model = await api.wornModel(target.itemId); return model ? { kind: 'worn', model } : null }
  const model = await api.itemModel(target.itemId)
  return model ? { kind: 'item', model } : null
}
