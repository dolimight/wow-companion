import { useEffect, useReducer } from "react"
import { useQuery } from "@tanstack/react-query"
import { gearSlotSchema, type Activity, type Character, type GearItem, type GearSlot } from "../../shared/domain"
import type { ItemSummary } from "../../shared/gamedata"
import { api } from "./client"
import { getItemCompatibility } from "../../shared/item-compatibility"

export const gearMemory = new Map<string, { items: GearItem[]; name: string; dirty: boolean }>()

const listeners = new Set<() => void>()

export function planKey(characterId: string, activity: Activity, specId: number | null) {
  return `${characterId}:${activity}:${specId}`
}

export function subscribeGearPlan(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function publish() {
  for (const listener of listeners) listener()
}

export function pickPlanSlot(slots: GearSlot[], items: GearItem[], preferred?: GearSlot): GearSlot | undefined {
  if (preferred && slots.includes(preferred)) return preferred
  const empty = slots.find((slot) => !items.some((item) => item.slot === slot && item.itemId))
  return empty ?? slots[0]
}

export function itemToGear(slot: GearSlot, item: ItemSummary, previous?: GearItem): GearItem {
  return {
    slot,
    name: item.name,
    itemId: item.id,
    itemLevel: item.itemLevel || previous?.itemLevel || null,
    enchant: previous?.enchant ?? null,
    enchantCoverage: previous?.enchantCoverage ?? "unknown",
    gems: previous?.gems ?? [],
    gemsCoverage: previous?.gemsCoverage ?? "unknown",
    appearanceId: previous?.appearanceId ?? null,
    itemLink: previous?.itemLink ?? null,
    stats: [],
    effects: [],
  }
}

/** Puts a named item onto the character's current activity plan without requiring an item ID */
export async function addItemToPlan(input: {
  character: Character
  activity: Activity
  item: ItemSummary
  preferredSlot?: GearSlot
  slots?: GearSlot[]
}): Promise<GearSlot | null> {
  let item = input.item
  if (item.classId == null || item.subclassId == null || item.allowableClassMask == null || item.specIds == null || item.primaryStats == null) {
    const recorded = await api.getItem(item.id).catch(() => null)
    if (recorded) item = recorded
  }
  const context = {className:input.character.className,specId:input.character.specId,level:input.character.level}
  if (!getItemCompatibility(item,context).compatible) return null
  const key = planKey(input.character.id, input.activity, input.character.specId)
  let memory = gearMemory.get(key)
  if (!memory) {
    const draft = await api.getGearDraft({
      characterId: input.character.id,
      activity: input.activity,
      specId: input.character.specId,
    })
    memory = {
      items: draft?.items ?? input.character.gear.map((item) => ({ ...item })),
      name: draft?.name ?? "My upgrade plan",
      dirty: false,
    }
  }
  const slots = input.preferredSlot
    ? [input.preferredSlot]
    : input.slots?.length
      ? input.slots
      : gearSlotSchema.options.filter(slot => getItemCompatibility(item,context,{slot}).compatible)
  const compatibleSlots = slots.filter(slot => getItemCompatibility(item,context,{slot}).compatible)
  const slot = pickPlanSlot(compatibleSlots, memory.items, input.preferredSlot)
  if (!slot) return null
  const previous = memory.items.find((item) => item.slot === slot)
  gearMemory.set(key, {
    ...memory,
    items: [...memory.items.filter((item) => item.slot !== slot), itemToGear(slot, item, previous)],
    dirty: true,
  })
  publish()
  return slot
}

/** Item IDs already on this character's plan, including edits not saved yet; updates when something is added */
export function usePlanItemIds(character: Character, activity: Activity) {
  const draft = useQuery({
    queryKey: ["gear-draft", character.id, activity, character.specId],
    queryFn: () => api.getGearDraft({ characterId: character.id, activity, specId: character.specId }),
  })
  const [, refresh] = useReducer((count: number) => count + 1, 0)
  useEffect(() => subscribeGearPlan(refresh), [])
  const items = gearMemory.get(planKey(character.id, activity, character.specId))?.items ?? draft.data?.items ?? character.gear
  return new Set(items.flatMap((item) => (item.itemId ? [item.itemId] : [])))
}
