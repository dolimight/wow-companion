import { useQuery } from "@tanstack/react-query";
import { Gem, Sparkles, WandSparkles } from "lucide-react";
import type { GearItem, GearSlot } from "../../../shared/domain";
import type { ItemSummary } from "../../../shared/gamedata";
import { embellishmentCounts, embellishmentOf, type EmbellishmentRules } from "../../../shared/item-enhancements";
import type { ItemSockets } from "../../../shared/sockets";
import { GearSlotIcon } from "../../components/GearSlotIcon";
import { api } from "../../lib/client";
import { ItemIcon } from "../items/ItemIcon";
import { useGameData } from "../items/items";
import "./enhancement-slots.css";

type Chip = { key: string; slot: GearSlot; state: "set" | "missing" | "unknown" | "optional" | "extra" | "open"; label: string; detail: string; icon?: number | null; quality?: number };
type Facts = { sockets: ItemSockets | null; enchantable: boolean | null };

/**
 * Enchants, gems, and embellishments across the plan as one slot per thing a slot can hold, so a gap is a visible
 * empty slot rather than a number. Pressing one selects its gear slot and points at it
 */
export function EnhancementSlots({ items, order, slotNames, itemMap, facts, embellishments, onPick }: {
  items: GearItem[];
  order: GearSlot[];
  slotNames: Record<GearSlot, string>;
  itemMap: Map<number, ItemSummary>;
  facts: (slot: GearSlot, item: GearItem | undefined) => Facts;
  embellishments: EmbellishmentRules | null;
  onPick: (slot: GearSlot) => void;
}) {
  const status = useGameData();
  const gemOptions = useQuery({ queryKey: ["enhancements", "gem", null], queryFn: () => api.enhancements({ kind: "gem", slot: null }), enabled: status.data?.state === "ready" });
  const gemByName = new Map((gemOptions.data ?? []).map((option) => [option.name, option]));
  const bySlot = new Map(items.map((item) => [item.slot, item]));
  const art = (item: GearItem | undefined) => { const info = item?.itemId ? itemMap.get(item.itemId) : undefined; return { icon: info?.icon ?? null, quality: info?.quality }; };

  const enchants: Chip[] = order.flatMap((slot): Chip[] => {
    const item = bySlot.get(slot);
    // An empty slot, such as the off hand beside a two-handed weapon, has nothing to enchant
    if (!item || facts(slot, item).enchantable !== true) return [];
    const name = slotNames[slot];
    if (item?.enchant) return [{ key: slot, slot, state: "set" as const, label: name, detail: `${name} · ${item.enchant}`, ...art(item) }];
    return [{ key: slot, slot, state: item.enchantCoverage === "complete" ? "missing" as const : "unknown" as const, label: name, detail: `${name} · ${item.enchantCoverage === "complete" ? "No enchant planned" : "Enchant unknown"}`, ...art(item) }];
  });

  const gems: Chip[] = order.flatMap((slot) => {
    const item = bySlot.get(slot);
    const sockets = facts(slot, item).sockets;
    if (!item || (!sockets?.sockets && !sockets?.addable && !item.gems.length)) return [];
    const fixed = sockets?.sockets ?? 0, room = fixed + (sockets?.addable ?? 0), name = slotNames[slot];
    return Array.from({ length: Math.max(room, item.gems.length) }, (_, index): Chip => {
      const gem = item.gems[index];
      if (gem) {
        const option = gemByName.get(gem);
        return { key: `${slot}:${index}`, slot, state: sockets && index >= room ? "extra" : "set", label: name, detail: `${name} · ${gem}${sockets && index >= room ? " · no socket for it" : index >= fixed ? " · in an added socket" : ""}`, icon: option?.icon ?? null, quality: option?.quality };
      }
      return index < fixed
        ? { key: `${slot}:${index}`, slot, state: item.gemsCoverage === "complete" ? "missing" : "unknown", label: name, detail: `${name} · ${item.gemsCoverage === "complete" ? "Empty socket" : "Gem unknown"}` }
        : { key: `${slot}:${index}`, slot, state: "optional", label: name, detail: `${name} · A socket can be added` };
    });
  });

  const counts = embellishmentCounts(embellishments, items).filter((category) => category.name === "Embellished" || category.count > 0);
  const embellished = counts.map((category) => {
    const holders = order.flatMap((slot) => { const item = bySlot.get(slot); return item && embellishmentOf(embellishments, item.bonusIds, item.embellishment)?.name === category.name ? [{ slot, item }] : []; });
    const chips: Chip[] = holders.map(({ slot, item }, index) => ({ key: `${category.name}:${slot}`, slot, state: index >= category.limit ? "extra" : "set", label: slotNames[slot], detail: `${slotNames[slot]} · ${item.embellishment?.name ?? item.name}${index >= category.limit ? " · over the limit" : ""}`, ...art(item) }));
    for (let index = holders.length; index < category.limit; index++) chips.push({ key: `${category.name}:open:${index}`, slot: order[0]!, state: "open", label: "Open", detail: "Unused · crafted gear can carry one" });
    return { category, chips };
  });

  const enchanted = enchants.filter((chip) => chip.state === "set").length;
  const fixedSockets = gems.filter((chip) => chip.state !== "optional").length;
  const gemmed = gems.filter((chip) => chip.state === "set").length;
  return (
    <div className="enhancement-slots">
      {enchants.length > 0 && (
        <SlotGroup icon={<WandSparkles aria-hidden="true" />} title="Enchants" summary={`${enchanted} of ${enchants.length}`} chips={enchants} onPick={onPick} />
      )}
      {gems.length > 0 && (
        <SlotGroup icon={<Gem aria-hidden="true" />} title="Gems" summary={`${gemmed} of ${fixedSockets} socket${fixedSockets === 1 ? "" : "s"}`} chips={gems} onPick={onPick} fallback={<Gem />} />
      )}
      {embellished.map(({ category, chips }) => (
        <SlotGroup key={category.name} icon={<Sparkles aria-hidden="true" />} title={category.name === "Embellished" ? "Embellishments" : category.name}
          summary={`${category.count} of ${category.limit}${category.over ? ` · ${category.over} too many` : ""}`} warn={category.over > 0} chips={chips} onPick={onPick} />
      ))}
    </div>
  );
}

function SlotGroup({ icon, title, summary, chips, onPick, warn, fallback }: { icon: React.ReactNode; title: string; summary: string; chips: Chip[]; onPick: (slot: GearSlot) => void; warn?: boolean; fallback?: React.ReactNode }) {
  return (
    <section className="enhancement-slot-group" aria-label={`${title} · ${summary}`}>
      <header>{icon}<strong>{title}</strong><span data-warn={warn || undefined}>{summary}</span></header>
      <ul>
        {chips.map((chip) => (
          <li key={chip.key}>
            {chip.state === "open"
              ? <span className="enhancement-slot" data-state="open" title={chip.detail}><span className="enhancement-slot-art" aria-hidden="true" /><small>{chip.label}</small></span>
              : (
                <button type="button" className="enhancement-slot" data-state={chip.state} title={chip.detail} aria-label={`${chip.detail} · show this slot`} onClick={() => onPick(chip.slot)}>
                  <span className="enhancement-slot-art">
                    {chip.state === "set" || chip.state === "extra" ? <ItemIcon icon={chip.icon} quality={chip.quality} size="small" fallback={fallback ?? <GearSlotIcon slot={chip.slot} />} /> : <GearSlotIcon slot={chip.slot} />}
                  </span>
                  <small>{chip.label}</small>
                </button>
              )}
          </li>
        ))}
      </ul>
    </section>
  );
}
