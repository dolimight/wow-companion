import { useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../components/ui/hover-card";
import { api } from "../../lib/client";
import type { GearItem } from "../../../shared/domain";
import type { EnhancementOption, ItemSummary } from "../../../shared/gamedata";
import { ItemIcon } from "./ItemIcon";
import "./item-hover-card.css";

/** Compose the existing row so inspecting an item never consumes its click action */
export function ItemHoverCard({ itemId, item, gear, name, enhancement, active = false, onDismiss, children }: { itemId?: number | null; item?: ItemSummary; gear?: GearItem; name?: string; enhancement?: EnhancementOption & { kind: 'enchant' | 'gem' }; active?: boolean; onDismiss?: () => void; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const id = itemId ?? enhancement?.itemId ?? gear?.itemId ?? item?.id;
  const visible = open || active;
  const details = useQuery({
    queryKey: ["item-tooltip", id], queryFn: () => api.itemTooltip(id!),
    enabled: visible && !!id, staleTime: (query) => query.state.data?.preview ? 5 * 60_000 : 0, retry: false,
  });
  const local = details.data?.item ?? item;
  const preview = details.data?.preview;
  const title = enhancement?.name ?? local?.name ?? name ?? gear?.name ?? (id ? `Item #${id}` : "Planned item");
  const exact = !!gear?.stats.length || !!gear?.effects.length;
  const stats = exact ? gear!.stats : preview?.stats ?? [];
  const effects = exact ? gear!.effects : preview?.effects ?? [];
  const localDescription = details.data?.item?.description;
  const description = enhancement && !stats.length && !effects.length && localDescription && !localDescription.includes('$') ? localDescription : null;
  const source = local?.sources[0];
  const baseLevel = preview?.level ?? local?.itemLevel;
  if (!id && !gear) return children;
  return (
    <HoverCard open={visible} onOpenChange={next => { setOpen(next); if (!next) onDismiss?.(); }}>
      <HoverCardTrigger render={children} delay={250} closeDelay={120} tabIndex={enhancement ? -1 : 0} />
      <HoverCardContent className="item-hover-card" side="right" align="start" sideOffset={10}>
        <header className="item-hover-heading">
          <ItemIcon icon={local?.icon ?? enhancement?.icon} quality={local?.quality ?? enhancement?.quality} size="large" label={`${title} icon`} />
          <div><strong className={`quality-text-${local?.quality ?? enhancement?.quality ?? 1}`}>{title}</strong>
            {enhancement ? <span>{enhancement.kind === 'gem' ? 'Gem' : 'Enchant'}</span> : <>
              <span>{gear?.itemLevel != null ? `Item level ${gear.itemLevel}` : baseLevel ? `Base item level ${baseLevel}` : "Item level unknown"}</span>
              <small>{[preview?.slot ?? local?.slot, preview?.subclass ?? local?.armor].filter(Boolean).join(" · ")}</small>
            </>}
          </div>
        </header>
        {preview?.binding && <p className="item-hover-binding">{preview.binding}</p>}
        {(stats.length > 0 || effects.length > 0 || description || !!preview?.weapon.length) && <section className="item-hover-lines">
          <h4>{enhancement ? "Enhancement effects" : exact ? "Recorded equipped stats" : `Base item stats${baseLevel ? ` · item level ${baseLevel}` : ""}`}</h4>
          {!exact && preview?.weapon.map((line, i) => <p key={`weapon-${i}`}>{line}</p>)}
          {stats.map((line, i) => <p key={`stat-${i}`} className={line.secondary ? "item-hover-secondary" : undefined}>{line.text}</p>)}
          {effects.map((line, i) => <p key={`effect-${i}`} className="item-hover-effect">{line}</p>)}
          {description && <p className="item-hover-effect">{description}</p>}
          {!exact && gear && <small className="item-hover-note">Stats at your equipped item level haven't been recorded yet</small>}
        </section>}
        {gear && <section className="item-hover-lines">
          <h4>Your enhancements</h4>
          <p>{gear.enchant ? `Enchant: ${gear.enchant}` : gear.enchantCoverage === "complete" ? "No enchant" : "Enchant not recorded"}</p>
          {gear.gems.length ? gear.gems.map((gem, i) => <p key={i}>Gem: {gem}</p>) : <p>{gear.gemsCoverage === "complete" ? "No gems" : "Gems not recorded"}</p>}
        </section>}
        {!gear && !!preview?.sockets.length && <p>{preview.sockets.join(" · ")}</p>}
        {preview?.requirement && <p className="item-hover-note">{preview.requirement}</p>}
        {preview?.set && <p>{preview.set}</p>}
        {source && <p className="item-hover-source">{source.encounter} · {source.instance}</p>}
        {details.isFetching && !preview && !exact && <p className="item-hover-note" role="status">Loading item stats…</p>}
        {!details.isFetching && !exact && !preview && !description && <p className="item-hover-note">Stats unavailable · connect Blizzard data in Settings or refresh your character</p>}
      </HoverCardContent>
    </HoverCard>
  );
}
