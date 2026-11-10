import { useEffect, useReducer } from "react"
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query"
import { gearSlotSchema, type Activity, type Character, type GearDraft, type GearItem, type GearSlot, type StatWeights } from "../../shared/domain"
import { toast } from "../components/ui/toast"
import { errorMessage } from "./notify"
import type { ItemSummary } from "../../shared/gamedata"
import { api } from "./client"
import { getItemCompatibility } from "../../shared/item-compatibility"
import { isPlannedItemEquipped } from "./gear-plan-match"
import { slotNames } from "./slot-names"

export const gearMemory = new Map<string, { items: GearItem[]; name: string; dirty: boolean; statWeights?: StatWeights }>()

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

/** The app's query client, so plans saved outside the planner refresh every view that shows them */
let planClient: QueryClient | null = null
export function usePlanQueryClient() {
  const client = useQueryClient()
  useEffect(() => { planClient = client; return () => { if (planClient === client) planClient = null } }, [client])
}

/** Whose plan it is, plus the gear they wear, which Undo returns to when the plan had never been saved */
export const planOwner = (character: Character, activity: Activity): PlanOwner => ({ characterId: character.id, activity, specId: character.specId, gear: character.gear })
export type PlanOwner = { characterId: string; activity: Activity; specId: number | null; gear: GearItem[] }
let savedToast: string | null = null

/**
 * Saves a plan and offers to undo it. Undo puts back the plan as it was before this save; a plan that was never
 * saved goes back to the gear the character wears. Memory is only marked clean when no newer edit arrived meanwhile
 */
export async function savePlan(owner: PlanOwner, next: { items: GearItem[]; name: string; statWeights?: StatWeights }, options: { undo?: boolean; message?: string; replace?: boolean } = {}): Promise<GearDraft> {
  const key = planKey(owner.characterId, owner.activity, owner.specId)
  const before = await api.getGearDraft({ characterId: owner.characterId, activity: owner.activity, specId: owner.specId })
  const saved = await api.saveGearDraft({ id: before?.id ?? crypto.randomUUID(), characterId: owner.characterId, specId: owner.specId, activity: owner.activity, rulesetId: before?.rulesetId ?? "unknown", name: next.name.trim() || "My upgrade plan", items: next.items, statWeights: next.statWeights, updatedAt: new Date().toISOString() })
  const current = gearMemory.get(key)
  if (options.replace || !current || (current.items === next.items && current.name === next.name)) // The saved list keeps its identity, so an open planner does not reset fields the player is still typing in
    gearMemory.set(key, { items: next.items, name: next.name, statWeights: next.statWeights, dirty: false })
  publish()
  void planClient?.invalidateQueries({ queryKey: ["gear-draft", owner.characterId] })
  if (options.undo !== false) {
    if (savedToast) toast.close(savedToast)
    savedToast = toast.add({ type: "success", title: options.message ?? "Plan saved", timeout: 6000, actionProps: { children: "Undo", onClick: () => void undoPlan(owner, before) } })
  }
  return saved
}

export async function undoPlan(owner: PlanOwner, before: GearDraft | null) {
  try {
    await savePlan(owner, { items: before?.items ?? owner.gear.map((item) => ({ ...item })), name: before?.name ?? "My upgrade plan", statWeights: before?.statWeights }, { undo: false, replace: true })
    toast.add({ type: "info", title: before ? "Plan change undone" : "Plan reset to your equipped gear", timeout: 4000 })
  } catch (error) {
    toast.add({ type: "error", title: "Could not undo", description: errorMessage(error), timeout: 6000 })
  }
}

export function pickPlanSlot(slots: GearSlot[], items: GearItem[], preferred?: GearSlot): GearSlot | undefined {
  if (preferred && slots.includes(preferred)) return preferred
  const empty = slots.find((slot) => !items.some((item) => item.slot === slot && item.itemId))
  return empty ?? slots[0]
}

/** A new target starts at the top crest rank, such as Myth 6/6, from the search row when it carried one, else from its upgrade tracks */
export async function plannedLevel(item: ItemSummary & { maxLevel?: { itemLevel: number; ladderLevel?: number } | null }): Promise<number | null> {
  const top = (max: { itemLevel: number; ladderLevel?: number } | null | undefined) => max ? max.ladderLevel ?? max.itemLevel : null
  if (item.maxLevel?.itemLevel) return top(item.maxLevel)
  try { return top((await api.itemPower({ id: item.id }))?.tracks?.max) } catch { return null }
}

/** An exact copy seen on a real character; its level and bonus IDs beat anything the game files suggest */
export type ObservedCopy = { itemLevel: number; bonusIds: number[] | null }

export function itemToGear(slot: GearSlot, item: ItemSummary, previous?: GearItem, level?: number | null, copy?: ObservedCopy | null): GearItem {
  const itemLevel = copy?.itemLevel || level || item.itemLevel || previous?.itemLevel || null
  return {
    slot,
    name: item.name,
    itemId: item.id,
    itemLevel,
    ...(copy?.bonusIds ? { bonusIds: copy.bonusIds, variantCoverage: "partial" as const } : {}),
    levelSource: copy ? "observed" : itemLevel ? "estimated" : null,
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
      statWeights: draft?.statWeights,
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
  const level = await plannedLevel(input.item)
  const items = [...memory.items.filter((item) => item.slot !== slot), itemToGear(slot, item, previous, level)]
  gearMemory.set(key, { ...memory, items, dirty: true })
  publish()
  // Plans save as they change; the toast offers Undo
  await savePlan(planOwner(input.character, input.activity), { items, name: memory.name, statWeights: memory.statWeights }, { message: `Added ${item.name} to ${slotNames[slot]}` })
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
  return { ...item, slot, enchant: null, enchantCoverage: "unknown", gems: [], gemsCoverage: "unknown", stats: item.stats ?? [], effects: item.effects ?? [], levelSource: item.levelSource ?? (item.itemLevel != null ? "observed" : null) }
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
  copy?: ObservedCopy | null
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
    memory = { items: draft?.items ?? input.character.gear.map((item) => ({ ...item })), name: draft?.name ?? "My upgrade plan", statWeights: draft?.statWeights, dirty: false }
  }
  const candidates = (fixedSlot ? [fixedSlot] : input.slots?.length ? input.slots : gearSlotSchema.options).filter(compatible)
  const slot = pickPlanSlot(candidates, memory.items.filter((item) => !isPlannedItemEquipped(input.character.gear.find((observed) => observed.slot === item.slot), item)), fixedSlot)
  if (!slot) return { status: "incompatible" }
  const existing = memory.items.find((item) => item.slot === slot)
  const observed = input.character.gear.find((item) => item.slot === slot)
  const incoming = input.exact ? stagedFromExact(input.exact, slot) : itemToGear(slot, summary!, existing, input.copy ? null : await plannedLevel(input.item ?? summary!), input.copy)
  const authored = !!existing && !isPlannedItemEquipped(observed, existing)
  if (authored && sameVariant(existing!, incoming)) return { status: "noop", slot }
  if (authored && !input.replace) return { status: "conflict", slot, current: existing!, incoming }
  const items = [...memory.items.filter((item) => item.slot !== slot), incoming]
  gearMemory.set(key, { ...memory, items, dirty: true })
  publish()
  await savePlan(planOwner(input.character, input.activity), { items, name: memory.name, statWeights: memory.statWeights }, { message: `${authored ? "Replaced" : "Added"} ${incoming.name} on ${slotNames[slot]} in ${input.character.name}’s plan` })
  return { status: authored ? "replaced" : "added", slot }
}

/** Puts simulated items onto the plan and saves it, like every other plan change */
export async function addSimulatedItemsToPlan(input: { character: Character; activity: Activity; items: GearItem[]; message?: string }): Promise<{ saved: boolean; slots: GearSlot[] }> {
  const key = planKey(input.character.id, input.activity, input.character.specId)
  const draft = await api.getGearDraft({ characterId: input.character.id, activity: input.activity, specId: input.character.specId })
  const memory = gearMemory.get(key) ?? { items: draft?.items ?? input.character.gear.map((item) => ({ ...item })), name: draft?.name ?? "My upgrade plan", statWeights: draft?.statWeights, dirty: false }
  const slots = input.items.map((item) => item.slot)
  const items = [...memory.items.filter((item) => !slots.includes(item.slot)), ...input.items.map((item) => stagedFromExact(item, item.slot))]
  gearMemory.set(key, { ...memory, items, dirty: true })
  publish()
  await savePlan(planOwner(input.character, input.activity), { items, name: memory.name, statWeights: memory.statWeights }, { message: input.message })
  return { saved: true, slots }
}

/** Whether every item is already on the plan at that level or higher */
export function planHolds(plan: GearItem[] | null | undefined, items: GearItem[]) {
  return !!plan && items.length > 0 && items.every((item) => plan.some((planned) => planned.slot === item.slot && planned.itemId === item.itemId && (planned.itemLevel ?? 0) >= (item.itemLevel ?? 0)))
}
