import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, CircleAlert, Sparkles, WandSparkles, X } from "lucide-react";
import type { Character, GearItem, GearSlot } from "../../../shared/domain";
import type { ItemSummary } from "../../../shared/gamedata";
import { socketLabel, type ItemSockets } from "../../../shared/sockets";
import { GearSlotIcon } from "../../components/GearSlotIcon";
import { Button } from "../../components/ui/primitives";
import { assetUrl } from "../../lib/assets";
import { trimmedFigure } from "../../lib/portrait";
import { isPlannedItemEquipped } from "../../lib/gear-plan-match";
import { ItemHoverCard } from "../items/ItemHoverCard";
import { ItemIcon } from "../items/ItemIcon";
import type { EmbellishmentRules } from "../../../shared/item-enhancements";
import { EnhancementSlots } from "./EnhancementSlots";
import "./character-panel.css";

/** The in-game character panel's arrangement: armor down the left, jewelry and trinkets down the right, weapons under the character */
const leftSlots: GearSlot[] = ["head", "neck", "shoulder", "back", "chest", "wrist"];
const rightSlots: GearSlot[] = ["hands", "waist", "legs", "feet", "finger1", "finger2", "trinket1", "trinket2"];
const weaponSlots: GearSlot[] = ["mainHand", "offHand"];

type SlotFacts = {
  sockets: ItemSockets | null;
  enchantable: boolean | null;
  embellishment: string | null;
  outstanding: string | null;
};

/** Plan contents the item or slot can't hold */
export type PlanIssue =
  | { slot: GearSlot; kind: "gems"; extra: number; room: number }
  | { slot: GearSlot; kind: "enchant"; enchant: string }
  | { slot: GearSlot; kind: "slot"; reason: string; item: string };

function issueText(issue: PlanIssue, slotName: string) {
  switch (issue.kind) {
    case "gems": return issue.room ? `${slotName} holds ${issue.room} gem${issue.room === 1 ? "" : "s"} · ${issue.extra} extra` : `${slotName} has no sockets · ${issue.extra} gem${issue.extra === 1 ? "" : "s"} planned`;
    case "enchant": return `${slotName} can't be enchanted · ${issue.enchant}`;
    case "slot": return `${issue.item} can't go in the ${slotName.toLowerCase()} · ${issue.reason}`;
    default: { const unhandled: never = issue; return unhandled; }
  }
}

export function CharacterPanel({ character, items, selected, onSelect, itemMap, slotNames, facts, plannedLevel, issues, onRemoveInvalid, embellishments, closedSlots, footer }: {
  issues: PlanIssue[];
  onRemoveInvalid: (slot: GearSlot | null) => void;
  character: Character;
  items: GearItem[];
  selected: GearSlot;
  onSelect: (slot: GearSlot) => void;
  itemMap: Map<number, ItemSummary>;
  slotNames: Record<GearSlot, string>;
  facts: (slot: GearSlot, item: GearItem | undefined) => SlotFacts;
  plannedLevel: number | null;
  embellishments: EmbellishmentRules | null;
  /** Slots this specialization can't fill, with the reason shown in place of an item */
  closedSlots: Partial<Record<GearSlot, string>>;
  footer?: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  const [pulse, setPulse] = useState<{ slot: GearSlot; at: number } | null>(null);
  useEffect(() => { if (!pulse) return; const timer = window.setTimeout(() => setPulse(null), 1500); return () => clearTimeout(timer); }, [pulse]);
  const order = [...leftSlots, ...rightSlots, ...weaponSlots];
  // Selects the slot and points at its tile, so a gap found in the slot list leads straight to the gear it belongs to
  const pick = (slot: GearSlot) => {
    onSelect(slot);
    setPulse({ slot, at: Date.now() });
    requestAnimationFrame(() => panel.current?.querySelector<HTMLElement>(`[data-gear-slot="${slot}"]`)?.scrollIntoView({ block: "nearest", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  const tile = (slot: GearSlot, side: "left" | "right") => {
    const planned = items.find((item) => item.slot === slot);
    return (
      <SlotTile key={slot} pulse={pulse?.slot === slot ? pulse.at : null} slot={slot} side={side} name={slotNames[slot]} selected={slot === selected} onSelect={onSelect}
        planned={planned} observed={character.gear.find((item) => item.slot === slot)} itemMap={itemMap} facts={facts}
        closed={closedSlots[slot]}
        issues={issues.filter((issue) => issue.slot === slot)} />
    );
  };
  return (
    <section ref={panel} className="character-panel" aria-label={`${character.name}'s planned gear`}>
      <div className="character-panel-doll">
        <div className="character-panel-column" data-side="left">{leftSlots.map((slot) => tile(slot, "left"))}</div>
        <PanelStage character={character} plannedLevel={plannedLevel} />
        <div className="character-panel-column" data-side="right">{rightSlots.map((slot) => tile(slot, "right"))}</div>
      </div>
      <div className="character-panel-weapons">{weaponSlots.map((slot) => tile(slot, slot === "mainHand" ? "right" : "left"))}</div>
      {(footer || items.length > 0 || issues.length > 0) && (
        <footer className="character-panel-footer">
          {issues.length > 0 && (
            <div className="character-panel-issues" role="group" aria-label="Plan problems">
              <div className="character-panel-issues-heading">
                <strong><CircleAlert aria-hidden="true" />{issues.length === 1 ? "1 thing in this plan doesn't fit" : `${issues.length} things in this plan don't fit`}</strong>
                {issues.length > 1 && <Button variant="quiet" onClick={() => onRemoveInvalid(null)}>Remove all</Button>}
              </div>
              <ul>
                {issues.map((issue) => (
                  <li key={`${issue.slot}-${issue.kind}`}>
                    <button type="button" className="character-panel-issue-slot" onClick={() => onSelect(issue.slot)}>{issueText(issue, slotNames[issue.slot])}</button>
                    <Button variant="quiet" onClick={() => onRemoveInvalid(issue.slot)} aria-label={`Remove from ${slotNames[issue.slot]}`}><X aria-hidden="true" />Remove</Button>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {items.length > 0 && <EnhancementSlots items={items} order={order} slotNames={slotNames} itemMap={itemMap} facts={facts} embellishments={embellishments} onPick={pick} />}
          {footer}
        </footer>
      )}
    </section>
  );
}

/** Planned gems against the item's sockets, as in 1 of 2 gems or No sockets */
function gemSummary(item: GearItem | undefined, sockets: ItemSockets | null) {
  const count = item?.gems.length ?? 0;
  const gemsText = (n: number) => `${n} gem${n === 1 ? "" : "s"}`;
  if (sockets) {
    const room = sockets.sockets + sockets.addable;
    if (count > room) return room ? `${gemsText(count)} · item holds ${room}` : `${gemsText(count)} · item has no sockets`;
    if (count > sockets.sockets) return `${count} of ${gemsText(room)} · with an added socket`;
    if (!count && item?.gemsCoverage !== "complete") return `Gems unknown · ${socketLabel(sockets)}`;
    if (!sockets.sockets) return socketLabel(sockets);
    return `${count} of ${gemsText(sockets.sockets)}${sockets.addable ? ` · ${sockets.addable} more can be added` : ""}`;
  }
  return count ? gemsText(count) : item?.gemsCoverage === "complete" ? "No gems in draft" : "Gems unknown";
}

function PanelStage({ character, plannedLevel }: { character: Character; plannedLevel: number | null }) {
  const source = assetUrl(character.renders?.main);
  const [figure, setFigure] = useState<{ source: string; image: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    if (source) void trimmedFigure(source).then((image) => { if (active) setFigure({ source, image }); });
    return () => { active = false; };
  }, [source]);
  const image = figure?.source === source ? figure.image ?? source : null;
  const equipped = character.itemLevel;
  const gain = plannedLevel != null && equipped != null ? plannedLevel - equipped : null;
  return (
    <div className="character-panel-stage">
      <header>
        <strong>{character.name}</strong>
        <small>{[character.specName !== "Unknown" ? character.specName : null, character.className !== "Unknown" ? character.className : null].filter(Boolean).join(" ") || "Specialization unknown"}</small>
      </header>
      {image ? <img src={image} alt="" /> : source ? null : <span className="character-panel-initial" aria-hidden="true">{character.name.slice(0, 1).toUpperCase()}</span>}
      <div className="character-panel-level" aria-label={`Planned item level ${plannedLevel?.toFixed(1) ?? "unknown"}`}>
        <small>Planned item level</small>
        <strong data-unknown={plannedLevel == null || undefined}>{plannedLevel?.toFixed(1) ?? "—"}</strong>
        <small>{equipped == null ? "Equipped unknown" : `Equipped ${equipped.toFixed(1)}${gain ? ` · ${gain > 0 ? "+" : "−"}${Math.abs(gain).toFixed(1)}` : ""}`}</small>
      </div>
    </div>
  );
}

function SlotTile({ pulse, slot, side, name, selected, onSelect, planned, observed, itemMap, facts, closed, issues }: {
  /** When set, the tile briefly points itself out; a new value restarts it */
  pulse: number | null;
  slot: GearSlot;
  issues: PlanIssue[];
  /** Why this specialization can't fill the slot; a closed slot with nothing planned can't be picked */
  closed?: string;
  side: "left" | "right";
  name: string;
  selected: boolean;
  onSelect: (slot: GearSlot) => void;
  planned: GearItem | undefined;
  observed: GearItem | undefined;
  itemMap: Map<number, ItemSummary>;
  facts: (slot: GearSlot, item: GearItem | undefined) => SlotFacts;
}) {
  const info = planned?.itemId ? itemMap.get(planned.itemId) : undefined;
  const now = observed?.itemId ? itemMap.get(observed.itemId) : undefined;
  const equipped = isPlannedItemEquipped(observed, planned);
  const { sockets, enchantable, embellishment, outstanding } = facts(slot, planned);
  const delta = planned?.itemLevel != null && observed?.itemLevel != null ? Math.round(planned.itemLevel - observed.itemLevel) : null;
  const quality = planned ? info?.quality ?? 1 : 1;
  const gems = planned?.gems.length ?? 0;
  const room = sockets ? sockets.sockets + sockets.addable : 0;
  const pips = Math.max(room, gems);
  const badEnchant = issues.some((issue) => issue.kind === "enchant");
  const showEnchant = enchantable !== false || badEnchant;
  // Nothing can go here for this specialization, so the slot says why instead of offering a pick
  if (closed && !planned) return (
    <div className="panel-slot" data-side={side} data-gear-slot={slot} data-closed="">
      <span className="panel-slot-icon"><ItemIcon icon={null} size="large" fallback={<GearSlotIcon slot={slot} />} /></span>
      <div className="panel-slot-text">
        <span className="panel-slot-name panel-slot-empty">{name}</span>
        <span className="panel-slot-closed">{closed}</span>
      </div>
    </div>
  );
  return (
    <div
      className="panel-slot"
      data-side={side}
      data-gear-slot={slot}
      data-invalid={issues.length > 0 || undefined}
      data-selected={selected || undefined}
      data-pulse={pulse != null || undefined}
      data-target-equipped={equipped || undefined}
      role="button"
      tabIndex={0}
      aria-pressed={selected}
      aria-label={`Edit ${name}`}
      aria-description={equipped ? "Target equipped" : undefined}
      onClick={() => onSelect(slot)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(slot); }
      }}
    >
      <ItemHoverCard itemId={planned?.itemId} item={info} gear={planned}>
        <span className="panel-slot-icon">
          <ItemIcon icon={info?.icon} quality={planned ? quality : undefined} size="large" fallback={<GearSlotIcon slot={slot} />} />
          {embellishment && <span className="panel-slot-embellished" title={embellishment}><Sparkles aria-hidden="true" /></span>}
        </span>
      </ItemHoverCard>
      <div className="panel-slot-text">
        <span className={planned ? `panel-slot-name quality-text-${quality}` : "panel-slot-name panel-slot-empty"}>{planned?.name ?? name}</span>
        <span className="panel-slot-level">
          {planned?.itemLevel != null ? <strong>{Math.round(planned.itemLevel)}</strong> : <span className="muted">{planned ? "Level unknown" : "Nothing planned"}</span>}
          {delta ? <span className="panel-slot-delta" data-sign={delta > 0 ? "up" : "down"}>{delta > 0 ? "+" : "−"}{Math.abs(delta)}</span> : null}
          {equipped && (delta && delta > 0 ? <span className="muted">Upgrade</span> : <span className="panel-slot-match"><Check aria-hidden="true" />Equipped</span>)}
          {planned?.levelSource === "estimated" && <span className="muted">Estimate</span>}
        </span>
        {planned && (showEnchant || pips > 0) && (
          <span className="panel-slot-enhancements">
            {showEnchant && <span className="panel-slot-enchant" data-state={badEnchant ? "invalid" : planned.enchant ? "set" : "missing"} title={badEnchant ? `${name} can't be enchanted` : planned.enchant ?? (planned.enchantCoverage === "complete" ? "No enchant planned" : "Enchant unknown")}><WandSparkles aria-hidden="true" />{planned.enchant ?? (planned.enchantCoverage === "complete" ? "No enchant" : "Enchant unknown")}</span>}
            {pips > 0 && <span className="panel-slot-gems" role="img" title={[gemSummary(planned, sockets), ...planned.gems].join("\n")} aria-label={[gemSummary(planned, sockets), ...planned.gems].join(", ")}>
              {Array.from({ length: pips }, (_, index) => <i key={index} data-state={sockets && index >= room ? "extra" : index < gems ? "set" : index < (sockets?.sockets ?? 0) ? "empty" : "addable"} />)}
            </span>}
          </span>
        )}
        {observed ? (
          <ItemHoverCard itemId={observed.itemId} item={now} gear={observed}>
            <span className="panel-slot-now">Now <span className={`quality-text-${now?.quality ?? 1}`}>{observed.name}</span>{observed.itemLevel != null ? ` · ${Math.round(observed.itemLevel)}` : ""}</span>
          </ItemHoverCard>
        ) : <span className="panel-slot-now">Nothing imported</span>}
        {outstanding && <span className="panel-slot-outstanding">{outstanding}</span>}
      </div>
    </div>
  );
}
