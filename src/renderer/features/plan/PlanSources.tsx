import type { ReactNode } from "react";
import { ArrowUpCircle, Castle, CircleHelp, Hammer, Shield, Swords } from "lucide-react";
import type { GearItem, GearSlot } from "../../../shared/domain";
import type { ItemSummary } from "../../../shared/gamedata";
import { isPlannedItemEquipped } from "../../lib/gear-plan-match";
import { ItemIcon } from "../items/ItemIcon";
import "./plan-sources.css";

type Needed = { item: GearItem; info: ItemSummary | undefined };
type Group = { key: string; kind: "raid" | "dungeon" | "other" | "crafted" | "set" | "upgrade" | "unknown"; title: string; note: string; bosses: Map<string, Needed[]> };

const kindOrder: Record<Group["kind"], number> = { raid: 0, dungeon: 1, other: 2, set: 3, crafted: 4, upgrade: 5, unknown: 6 };

function groupIcon(kind: Group["kind"]): ReactNode {
  switch (kind) {
    case "raid": return <Castle aria-hidden="true" />;
    case "dungeon": return <Swords aria-hidden="true" />;
    case "other": return <Shield aria-hidden="true" />;
    case "set": return <Shield aria-hidden="true" />;
    case "crafted": return <Hammer aria-hidden="true" />;
    case "upgrade": return <ArrowUpCircle aria-hidden="true" />;
    case "unknown": return <CircleHelp aria-hidden="true" />;
    default: { const unhandled: never = kind; return unhandled; }
  }
}

/** Where each planned item still has to come from, grouped by the content to run */
export function planSources(items: GearItem[], gear: GearItem[], itemMap: Map<number, ItemSummary>) {
  const groups = new Map<string, Group>();
  const add = (key: string, base: Omit<Group, "key" | "bosses">, boss: string, entry: Needed) => {
    const group = groups.get(key) ?? { key, ...base, bosses: new Map() };
    group.bosses.set(boss, [...(group.bosses.get(boss) ?? []), entry]);
    groups.set(key, group);
  };
  for (const item of items) {
    const observed = gear.find((own) => own.slot === item.slot);
    const info = item.itemId ? itemMap.get(item.itemId) : undefined;
    const entry = { item, info };
    if (isPlannedItemEquipped(observed, item)) {
      if (item.itemLevel != null && observed?.itemLevel != null && item.itemLevel > observed.itemLevel)
        add("upgrade", { kind: "upgrade", title: "Upgrade what you have", note: "Already equipped · spend crests at the upgrade vendor" }, "", entry);
      continue;
    }
    if (!item.itemId) continue;
    const sources = info?.sources ?? [];
    const instances = [...new Set(sources.map((source) => source.instance))];
    if (instances.length) {
      for (const instance of instances) {
        const here = sources.filter((source) => source.instance === instance);
        const kind = here[0]!.kind;
        add(`${kind}:${instance}`, { kind, title: instance, note: kind === "raid" ? "Raid" : kind === "dungeon" ? "Dungeon" : "Other content" }, here.map((source) => source.encounter).join(" or "), entry);
      }
    } else if (info?.crafted) add("crafted", { kind: "crafted", title: "Crafting", note: "Order it from a crafter or make it yourself" }, "", entry);
    else if (info?.setPiece) add("set", { kind: "set", title: "Tier set", note: "Raid bosses, or convert a piece at the Catalyst" }, "", entry);
    else add("unknown", { kind: "unknown", title: "Elsewhere", note: "Not in the Adventure Guide · a vendor, quest, or other reward" }, "", entry);
  }
  return [...groups.values()].sort((a, b) => kindOrder[a.kind] - kindOrder[b.kind] || count(b) - count(a) || a.title.localeCompare(b.title));
}

function count(group: Group) {
  return [...group.bosses.values()].reduce((sum, list) => sum + list.length, 0);
}

export function PlanSources({ items, gear, itemMap, slotNames, onSelect }: {
  items: GearItem[];
  gear: GearItem[];
  itemMap: Map<number, ItemSummary>;
  slotNames: Record<GearSlot, string>;
  onSelect: (slot: GearSlot) => void;
}) {
  const groups = planSources(items, gear, itemMap);
  return (
    <section className="plan-sources" aria-labelledby="plan-sources-title">
      <header>
        <h3 id="plan-sources-title">Where to get it</h3>
        <p className="muted">{groups.length ? "What to run for the gear you don't have yet · vendor stock isn't in the game files, so those items land under Elsewhere" : "Everything in this plan is already equipped at its planned level"}</p>
      </header>
      {groups.length > 0 && (
        <div className="plan-sources-grid">
          {groups.map((group) => (
            <article key={group.key} className="plan-source" data-kind={group.kind}>
              <header>
                <span className="plan-source-icon">{groupIcon(group.kind)}</span>
                <div><strong>{group.title}</strong><small>{group.note}</small></div>
                <span className="plan-source-count">{count(group)}</span>
              </header>
              <ul>
                {[...group.bosses].map(([boss, entries]) => (
                  <li key={boss || "items"}>
                    {boss && <span className="plan-source-boss">{boss}</span>}
                    {entries.map(({ item, info }) => (
                      <button key={item.slot} type="button" className="plan-source-item" onClick={() => onSelect(item.slot)} aria-label={`${item.name}, ${slotNames[item.slot]} · show slot`}>
                        <ItemIcon icon={info?.icon} quality={info?.quality} size="small" />
                        <span className={`quality-text-${info?.quality ?? 1}`}>{item.name}</span>
                        <small>{slotNames[item.slot]}{item.itemLevel != null ? ` · ${Math.round(item.itemLevel)}` : ""}</small>
                      </button>
                    ))}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
