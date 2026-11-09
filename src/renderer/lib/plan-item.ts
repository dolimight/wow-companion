import { useEffect, useReducer } from "react"
import { useQuery } from "@tanstack/react-query"
import { gearSlotSchema, type Activity, type Character, type GearItem, type GearSlot } from "../../shared/domain"
import type { ItemSummary } from "../../shared/gamedata"
import { api } from "./client"
import { getItemCompatibility } from "../../shared/item-compatibility"
import { isPlannedItemEquipped } from "./gear-plan-match"

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
    // A new target never inherits the previous item's enchant or gems; the player authors those goals explicitly
    enchant: null,
    enchantCoverage: "unknown",
    gems: [],
    gemsCoverage: "unknown",
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

export type StageResult =
  | { status: "added" | "replaced" | "noop"; slot: GearSlot }
  | { status: "conflict"; slot: GearSlot; current: GearItem; incoming: GearItem }
  | { status: "incompatible" }

/** An exact owned copy keeps its identity, but what it was observed wearing is not a goal the player authored */
export function stagedFromExact(item: GearItem, slot: GearSlot): GearItem {
  return { ...item, slot, enchant: null, enchantCoverage: "unknown", gems: [], gemsCoverage: "unknown", stats: item.stats ?? [], effects: item.effects ?? [] }
}
export function sameVariant(current: GearItem, incoming: GearItem) {
  return current.itemId != null && current.itemId === incoming.itemId && (!incoming.itemLink || current.itemLink === incoming.itemLink)
}
/** The goals that confirming a replacement would clear, named for the summary */
export function authoredGoals(item: GearItem): string[] {
  return [
    ...(item.itemLevel != null ? [`Item level ${item.itemLevel}`] : []),
    ...(item.enchant ? [`Enchant: ${item.enchant}`] : []),
    ...(item.gems.length ? [`Gems: ${item.gems.join(", ")}`] : []),
  ]
}

/**
 * One staging policy for Owned, Vault, Leaders, and Search: updates a local draft and never saves it.
 * A slot still holding the observed item is empty of authored intent, and a different target there asks first.
 */
export async function stagePlanItem(input: {
  character: Character
  activity: Activity
  item?: ItemSummary
  exact?: GearItem
  preferredSlot?: GearSlot
  slots?: GearSlot[]
  replace?: boolean
}): Promise<StageResult> {
  const context = { className: input.character.className, specId: input.character.specId, level: input.character.level }
  let summary = input.item
  if (summary && (summary.classId == null || summary.subclassId == null || summary.allowableClassMask == null || summary.specIds == null || summary.primaryStats == null)) {
    const recorded = await api.getItem(summary.id).catch(() => null)
    if (recorded) summary = recorded
  }
  if (!summary && input.exact?.itemId) summary = (await api.getItem(input.exact.itemId).catch(() => null)) ?? undefined
  const fixedSlot = input.preferredSlot ?? input.exact?.slot
  const compatible = (slot: GearSlot) => !summary || getItemCompatibility(summary, context, { slot }).compatible
  if (summary && !getItemCompatibility(summary, context).compatible) return { status: "incompatible" }
  const key = planKey(input.character.id, input.activity, input.character.specId)
  let memory = gearMemory.get(key)
  if (!memory) {
    const draft = await api.getGearDraft({ characterId: input.character.id, activity: input.activity, specId: input.character.specId })
    memory = { items: draft?.items ?? input.character.gear.map((item) => ({ ...item })), name: draft?.name ?? "My upgrade plan", dirty: false }
  }
  const candidates = (fixedSlot ? [fixedSlot] : input.slots?.length ? input.slots : gearSlotSchema.options).filter(compatible)
  const slot = pickPlanSlot(candidates, memory.items.filter((item) => !isPlannedItemEquipped(input.character.gear.find((observed) => observed.slot === item.slot), item)), fixedSlot)
  if (!slot) return { status: "incompatible" }
  const existing = memory.items.find((item) => item.slot === slot)
  const observed = input.character.gear.find((item) => item.slot === slot)
  const incoming = input.exact ? stagedFromExact(input.exact, slot) : itemToGear(slot, summary!, existing)
  const authored = !!existing && !isPlannedItemEquipped(observed, existing)
  if (authored && sameVariant(existing!, incoming)) return { status: "noop", slot }
  if (authored && !input.replace) return { status: "conflict", slot, current: existing!, incoming }
  gearMemory.set(key, { ...memory, items: [...memory.items.filter((item) => item.slot !== slot), incoming], dirty: true })
  publish()
  return { status: authored ? "replaced" : "added", slot }
}

/**
 * Puts simulated items onto a saved plan in one step. A plan without unsaved edits is saved right away; a plan with
 * unsaved edits in the planner only gains the items, so the player's own pending changes are never saved for them
 */
export async function addSimulatedItemsToPlan(input: { character: Character; activity: Activity; items: GearItem[] }): Promise<{ saved: boolean; slots: GearSlot[] }> {
  const key = planKey(input.character.id, input.activity, input.character.specId)
  const draft = await api.getGearDraft({ characterId: input.character.id, activity: input.activity, specId: input.character.specId })
  const memory = gearMemory.get(key) ?? { items: draft?.items ?? input.character.gear.map((item) => ({ ...item })), name: draft?.name ?? "My upgrade plan", dirty: false }
  const slots = input.items.map((item) => item.slot)
  const items = [...memory.items.filter((item) => !slots.includes(item.slot)), ...input.items.map((item) => stagedFromExact(item, item.slot))]
  if (memory.dirty) {
    gearMemory.set(key, { ...memory, items, dirty: true })
    publish()
    return { saved: false, slots }
  }
  const saved = await api.saveGearDraft({ id: draft?.id ?? crypto.randomUUID(), characterId: input.character.id, specId: input.character.specId, activity: input.activity, rulesetId: draft?.rulesetId ?? "unknown", name: memory.name, items, updatedAt: new Date().toISOString() })
  gearMemory.set(key, { items: saved?.items ?? items, name: memory.name, dirty: false })
  publish()
  return { saved: true, slots }
}

/** Whether every item is already on the plan at that level or higher */
export function planHolds(plan: GearItem[] | null | undefined, items: GearItem[]) {
  return !!plan && items.length > 0 && items.every((item) => plan.some((planned) => planned.slot === item.slot && planned.itemId === item.itemId && (planned.itemLevel ?? 0) >= (item.itemLevel ?? 0)))
}
