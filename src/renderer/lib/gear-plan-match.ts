import type { GearItem } from "../../shared/domain";

/** Match the chosen item in this slot, without treating popularity or a name as BiS evidence */
export function isPlannedItemEquipped(current?: GearItem, planned?: GearItem): boolean {
  return !!current && !!planned && current.slot === planned.slot &&
    current.itemId != null && current.itemId > 0 && current.itemId === planned.itemId;
}

/** A typed replacement name has no verified connection to the previously selected game item */
export function clearRenamedPlanIdentity(previous: GearItem | undefined, next: GearItem): GearItem {
  if (previous?.name.trim() === next.name.trim()) return next;
  return { ...next, itemId: null, itemLink: null, appearanceId: null, stats: [], effects: [] };
}
