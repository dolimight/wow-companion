import { api } from '../../lib/client'
import type { ViewSubject } from './scene'
import type { OutfitModelPiece } from '../../../shared/model'

/** What a tile shows: an item, worn by the stand-in when it has no model of its own, or a creature */
export type TileTarget = { kind: 'item'; itemId: number; worn: boolean } | { kind: 'creature'; displayId: number }
  | { kind: 'appearance'; piece: OutfitModelPiece; characterId: string; lookKey: string }

export const tileKey = (target: TileTarget) => target.kind === 'item' ? `${target.worn ? 'worn' : 'item'}:${target.itemId}`
  : target.kind === 'appearance' ? JSON.stringify(target) : `creature:${target.displayId}`

/** Reads a tile's model from the game files */
export async function loadSubject(target: TileTarget): Promise<ViewSubject | null> {
  if (target.kind === 'appearance') {
    const { slot, itemId, modifiedAppearanceId } = target.piece
    if ((slot === 'mainHand' || slot === 'offHand') && itemId && modifiedAppearanceId) {
      const item = await api.itemModel(itemId, modifiedAppearanceId)
      if (item) return { kind: 'item', model: item }
    }
    const model = await api.outfitModel([target.piece], target.characterId)
    return model && (model.textures.length || model.attached.length || model.cape) ? { kind: 'worn', model } : null
  }
  if (target.kind === 'creature') { const model = await api.creatureModel(target.displayId); return model ? { kind: 'creature', model } : null }
  if (target.worn) { const model = await api.wornModel(target.itemId); return model ? { kind: 'worn', model } : null }
  const model = await api.itemModel(target.itemId)
  return model ? { kind: 'item', model } : null
}
