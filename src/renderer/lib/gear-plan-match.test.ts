import { describe, expect, it } from "vite-plus/test";
import type { GearItem } from "../../shared/domain";
import { clearRenamedPlanIdentity, isPlannedItemEquipped } from "./gear-plan-match";

function gear(patch: Partial<GearItem> = {}): GearItem {
  return {
    slot: "head", itemId: 42, name: "Planned helm", itemLevel: 300,
    enchant: null, enchantCoverage: "unknown", gems: [], gemsCoverage: "unknown",
    appearanceId: null, itemLink: null, stats: [], effects: [], ...patch,
  };
}

describe("equipped plan targets", () => {
  it("matches a recorded item ID in the same slot", () => {
    expect(isPlannedItemEquipped(gear(), gear())).toBe(true);
    expect(isPlannedItemEquipped(gear(), gear({ itemId: 43 }))).toBe(false);
    expect(isPlannedItemEquipped(gear(), gear({ slot: "shoulder" }))).toBe(false);
  });

  it("keeps missing items and manual same-name targets unmatched", () => {
    expect(isPlannedItemEquipped(undefined, undefined)).toBe(false);
    expect(isPlannedItemEquipped(gear(), undefined)).toBe(false);
    expect(isPlannedItemEquipped(undefined, gear())).toBe(false);
    expect(isPlannedItemEquipped(gear(), gear({ itemId: null }))).toBe(false);
    expect(isPlannedItemEquipped(gear({ itemId: null }), gear({ itemId: null }))).toBe(false);
    expect(isPlannedItemEquipped(gear({ itemId: 0 }), gear({ itemId: 0 }))).toBe(false);
  });

  it("matches only the item identity while preserving different levels and unknown enhancements", () => {
    const current = gear();
    const planned = gear({ itemLevel: 310, enchant: "Planned enchant", gems: ["Planned gem"] });
    expect(isPlannedItemEquipped(current, planned)).toBe(true);
    expect(current.itemLevel).toBe(300);
    expect(current.enchantCoverage).toBe("unknown");
    expect(current.gemsCoverage).toBe("unknown");
    expect(planned.itemLevel).toBe(310);
  });
});

describe("manually edited plan identity", () => {
  const current = gear({
    itemLink: "item:42", appearanceId: 123,
    stats: [{ text: "+100 Strength", secondary: false }], effects: ["Recorded item effect"],
  });

  it("clears item-specific data for a manually renamed target and no longer matches equipped gear", () => {
    const renamed = clearRenamedPlanIdentity(current, { ...current, name: "My replacement helm" });
    expect(renamed).toMatchObject({
      name: "My replacement helm", itemId: null, itemLink: null, appearanceId: null, stats: [], effects: [],
      itemLevel: 300, enchantCoverage: "unknown", gemsCoverage: "unknown",
    });
    expect(isPlannedItemEquipped(current, renamed)).toBe(false);
    expect(current.itemId).toBe(42);
  });

  it("keeps identity when only level, enchant, and gems change", () => {
    const updated = clearRenamedPlanIdentity(current, {
      ...current, itemLevel: 310, enchant: "New enchant", gems: ["New gem"],
    });
    expect(updated).toMatchObject({
      itemId: 42, itemLink: "item:42", appearanceId: 123,
      itemLevel: 310, enchant: "New enchant", gems: ["New gem"],
    });
    expect(isPlannedItemEquipped(current, updated)).toBe(true);
  });
});
