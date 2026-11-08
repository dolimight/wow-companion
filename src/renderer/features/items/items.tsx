import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ExternalLink, Search, Sparkles, X } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppSelect } from "../../components/AppSelect";
import { Toggle } from "../../components/ui/toggle";
import { Badge, Button, Sheet } from "../../components/ui/primitives";
import { Term } from "../../components/Term";
import { api } from "../../lib/client";
import { ItemIcon } from "./ItemIcon";
import { ItemHoverCard } from "./ItemHoverCard";
import { ItemPowerSection, wowheadItemUrl } from "./ItemPower";
import { errorMessage, notify } from "../../lib/notify";
import { gearSlotsForInventoryType, qualityNames, type ItemSummary, type ItemSearchCharacter } from "../../../shared/gamedata";
import { getItemCompatibility } from "../../../shared/item-compatibility";
import type { AppearanceSlot, Character, GearItem } from "../../../shared/domain";
import "./items.css";

export { ItemIcon } from "./ItemIcon";

export function useGameData() {
  return useQuery({ queryKey: ["game-data-status"], queryFn: () => api.gameDataStatus(), staleTime: 2000 });
}

function useDebounced<T>(value: T, delay = 160) {
  const [current, setCurrent] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setCurrent(value), delay); return () => clearTimeout(timer); }, [value, delay]);
  return current;
}

export function sourceLine(item: Pick<ItemSummary, "sources">) {
  const source = item.sources[0];
  if (!source) return null;
  return `${source.kind === "raid" ? "Raid" : source.kind === "dungeon" ? "Dungeon" : "Drops"} · ${source.encounter}, ${source.instance}`;
}

const slotOptions: Array<{ value: AppearanceSlot | "any"; label: string }> = [
  { value: "any", label: "Any slot" }, { value: "head", label: "Head" }, { value: "neck", label: "Neck" }, { value: "shoulder", label: "Shoulders" }, { value: "back", label: "Back" }, { value: "chest", label: "Chest" },
  { value: "wrist", label: "Wrists" }, { value: "hands", label: "Hands" }, { value: "waist", label: "Waist" }, { value: "legs", label: "Legs" }, { value: "feet", label: "Feet" },
  { value: "finger1", label: "Rings" }, { value: "trinket1", label: "Trinkets" }, { value: "mainHand", label: "Main hand" }, { value: "offHand", label: "Off hand" },
];

/** Item search that runs entirely against the local index built from the user's WoW install */
export function ItemSearchDialog({ open, onOpenChange, character, slot: fixedSlot, title = "Search items", onPick, addLabel }: { open: boolean; onOpenChange: (open: boolean) => void; character?: Character; slot?: AppearanceSlot; title?: string; onPick?: (item: ItemSummary) => void; addLabel?: string }) {
  const status = useGameData();
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<AppearanceSlot | "any">(fixedSlot ?? "any");
  const [source, setSource] = useState<"any" | "dungeon" | "raid">("any");
  const [current, setCurrent] = useState(true);
  const [highlighted, setHighlighted] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setSlot(fixedSlot ?? "any"); setText(""); setHighlighted(""); } }, [open, fixedSlot, character?.id, character?.className, character?.specId, character?.level]);
  const debouncedText = useDebounced(text);
  const query = {text:debouncedText,slot:fixedSlot??slot,source,current};
  const context = character ? {className:character.className,specId:character.specId,level:character.level} : null;
  const ready = status.data?.state === "ready";
  const results = useInfiniteQuery({
    queryKey: ["item-search-pages", character?.id, context, query],
    queryFn: ({ pageParam }) => api.searchItemsPage({ text: query.text, slot: fixedSlot ?? (query.slot === "any" ? null : query.slot), character:context, source: query.source, currentOnly: query.current, limit: 40, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: page => page.nextOffset ?? undefined,
    enabled: open && ready,
  });
  const items = results.data?.pages.flatMap(page => page.items) ?? [];
  useEffect(() => { list.current?.scrollTo(0, 0); setHighlighted(""); }, [debouncedText, fixedSlot, slot, source, current, character?.id, character?.className, character?.specId, character?.level]);
  const loadMore = () => { if (results.hasNextPage && !results.isFetching && !results.isFetchNextPageError) void results.fetchNextPage(); };
  const pickItem = (item: ItemSummary) => {
    const compatibility = getItemCompatibility(item, context, {slot:fixedSlot ?? (slot === "any" ? null : slot)});
    if (!compatibility.compatible) { notify(compatibility.reason ?? "This item doesn't match this character or slot"); return; }
    if (onPick) { onPick(item); onOpenChange(false); } else setHighlighted(String(item.id));
  };
  const previewItem = (item: ItemSummary) => { if (addLabel) setHighlighted(String(item.id)); else pickItem(item); };
  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="item-search-dialog" showCloseButton={false}>
          <div className="item-search-heading"><DialogTitle><Search size={18} aria-hidden="true" />{title}</DialogTitle><Button variant="icon" aria-label="Close item search" onClick={() => onOpenChange(false)}><X size={18} aria-hidden="true" /></Button></div>
          <DialogDescription className="sr-only">{character ? `Search items for ${character.name}'s class and specialization` : "Search every item in your installed game data"}</DialogDescription>
          <Command shouldFilter={false} className="item-search" value={highlighted} onValueChange={setHighlighted}>
            <CommandInput value={text} onValueChange={setText} placeholder={fixedSlot ? "Search items for this slot" : "Search items by name"} aria-label="Search items" />
            <div className="item-search-filters">
              {!fixedSlot && <AppSelect aria-label="Slot" value={slot} onValueChange={(value) => setSlot(value as AppearanceSlot | "any")} options={slotOptions} />}
              <AppSelect aria-label="Where it comes from" value={source} onValueChange={(value) => setSource(value as typeof source)} options={[{ value: "any", label: "Any source" }, { value: "dungeon", label: "Dungeons" }, { value: "raid", label: "Raids" }]} />
              <Toggle type="button" variant="outline" className="workspace-toggle" pressed={current} onPressedChange={setCurrent} aria-label="This season only">
                <span>This season only</span><span className="toggle-state">{current ? "On" : "Off"}</span>
              </Toggle>
            </div>
            <div className="item-search-context" role="status">
              {character ? <><strong>For {character.name}</strong><span>{[character.specName !== "Unknown" ? character.specName : null, character.className !== "Unknown" ? character.className : "Class unknown", character.level != null ? `Level ${character.level}` : null].filter(Boolean).join(" · ")}</span>{!character.specId && <span>Specialization unknown — refresh this character for spec filtering</span>}</> : <span>Select a character to filter by class and specialization</span>}
            </div>
            <div className="item-search-body" data-has-preview={ready && !!items.length || undefined}>
            <CommandList ref={list} className="item-search-list" aria-busy={results.isFetching} onScroll={event => {
              const node = event.currentTarget;
              if (node.scrollHeight - node.scrollTop - node.clientHeight < 180) loadMore();
            }}>
              {!ready ? (
                <GameDataPending state={status.data?.state} progress={status.data?.progress?.step} />
              ) : results.isError && !items.length ? (
                <div className="item-search-empty" role="alert"><p>{errorMessage(results.error)}</p><Button onClick={() => void results.refetch()}>Try again</Button></div>
              ) : (
                <>
                  <CommandEmpty className="item-search-empty">{results.isFetching ? "Searching…" : character ? "No compatible items match — try another name, source, or season filter" : "No items match — try another name or turn off a filter"}</CommandEmpty>
                  {items.map((item) => (
                    <ItemHoverCard key={item.id} item={item}><CommandItem value={String(item.id)} onFocus={() => setHighlighted(String(item.id))} onSelect={() => previewItem(item)} className="item-result">
                      <ItemIcon icon={item.icon} quality={item.quality} />
                      <span className="item-result-text">
                        <strong className={`quality-text-${item.quality}`}>{item.name}</strong>
                        <small>{[item.slot, item.armor && item.armor[0]!.toUpperCase() + item.armor.slice(1), item.itemLevel ? `Base ${item.itemLevel}` : null, item.maxLevel ? `Up to ${item.maxLevel.itemLevel} (${item.maxLevel.track} ${item.maxLevel.rank}/${item.maxLevel.ranks}${item.maxLevel.assumed ? ", assumed" : ""})` : null].filter(Boolean).join(" · ")}</small>
                        {sourceLine(item) && <small className="item-result-source">{sourceLine(item)}</small>}
                        {context && !getItemCompatibility(item,context).verified && <small>{getItemCompatibility(item,context).reason ?? "Some equipment restrictions are unknown"}</small>}
                      </span>
                    </CommandItem></ItemHoverCard>
                  ))}
                  {items.length > 0 && <div className="item-search-pagination">
                    {results.isFetchNextPageError ? <><p role="alert">Could not load more items</p><Button onClick={() => void results.fetchNextPage()}>Try again</Button></>
                      : results.hasNextPage ? <Button disabled={results.isFetchingNextPage} onClick={() => void results.fetchNextPage()}>{results.isFetchingNextPage ? "Loading more items…" : "Load more items"}</Button>
                        : <p role="status">All matching items shown</p>}
                  </div>}
                </>
              )}
            </CommandList>
            <aside className="item-search-detail" aria-live="polite">
              {ready && items.some(item=>item.id===Number(highlighted)) ? <ItemDetail id={Number(highlighted)} onPick={onPick ? pickItem : undefined} addLabel={addLabel} character={context} equipped={character?.gear} slot={fixedSlot ?? (slot === "any" ? null : slot)} compact /> : <div className="item-search-preview-empty"><Search size={24} aria-hidden="true" /><p>Use the arrow keys or hover to see details</p></div>}
            </aside>
            </div>
            <div className="item-search-footer">
              <span>{onPick && !addLabel ? "Press Enter to add the highlighted item to your plan" : "Use the arrow keys to compare items"}</span>
              <span role="status">{ready ? `${results.isFetching && !results.isFetchingNextPage ? 'Searching…' : `${items.length} shown${results.isFetchingNextPage ? ' · Loading more…' : ''}`} · Local game data ${status.data?.indexedVersion ?? 'version unknown'}` : 'Local game data is not ready'}</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function GameDataPending({ state, progress }: { state?: string; progress?: string }) {
  return (
    <div className="item-search-empty">
      {state === "indexing" ? (<><Sparkles size={18} /> Preparing item data from your game · {progress ?? "Working"}</>)
        : state === "no-install" || !state ? "Item search needs World of Warcraft on this computer. Open Settings → Connections to find it"
        : state === "error" ? "Item data could not be prepared. Open Settings → Connections to try again"
        : "Item data has not been prepared yet. Open Settings → Connections to start"}
    </div>
  );
}

function describe(data: ItemSummary) { return `${qualityNames[data.quality] ?? "Item"} · ${data.slot}${data.armor ? ` · ${data.armor[0]!.toUpperCase()}${data.armor.slice(1)}` : ""}`; }

export function ItemSheet({ id, onOpenChange, onPick }: { id: number | null; onOpenChange: (open: boolean) => void; onPick?: (item: ItemSummary) => void }) {
  const item = useQuery({ queryKey: ["item", id], queryFn: () => api.getItem(id!), enabled: id != null });
  return (
    <Sheet open={id != null} onOpenChange={onOpenChange} title={item.data?.name ?? "Item"} description={item.data ? describe(item.data) : undefined}>
      {id != null && <ItemDetail id={id} onPick={onPick} />}
    </Sheet>
  );
}

export function ItemDetail({ id, onPick, addLabel, compact = false, character = null, slot = null, equipped }: { id: number; onPick?: (item: ItemSummary) => void; addLabel?: string; compact?: boolean; character?: ItemSearchCharacter | null; slot?: AppearanceSlot | null; equipped?: GearItem[] }) {
  const item = useQuery({ queryKey: ["item", id], queryFn: () => api.getItem(id) });
  const [shownLevel, setShownLevel] = useState<number | null>(null);
  useEffect(() => setShownLevel(null), [id]);
  const open = (url: string) => void api.openExternal(url).catch((error) => notify(errorMessage(error)));
  const slots = item.data ? new Set<string>(gearSlotsForInventoryType(item.data.inventoryType)) : new Set<string>();
  const inSlot = (equipped ?? []).filter((gear) => slots.has(gear.slot) && gear.itemId);
  const data = item.data;
  const compatibility = data ? getItemCompatibility(data,character,{slot}) : null;
  return item.isPending ? <p className="muted small">Loading item…</p> : !data ? <p className="muted small">This item is not in your installed game data</p> : (
        <div className="item-sheet">
          {compact && <div className="item-sheet-title"><strong className={`quality-text-${data.quality}`}>{data.name}</strong><small>{describe(data)}</small></div>}
          <div className="item-sheet-hero">
            <ItemIcon icon={data.icon} quality={data.quality} size="large" />
            <div className="detail-list">
              <div className="detail-row"><span><Term term="base item level">Base item level</Term></span><strong>{data.itemLevel || "Unknown"}</strong></div>
              {data.requiredLevel > 0 && <div className="detail-row"><span>Requires level</span><strong>{data.requiredLevel}</strong></div>}
              {data.sockets > 0 && <div className="detail-row"><span><Term term="socket">Sockets</Term></span><strong>{data.sockets}</strong></div>}
              {data.bonding && <div className="detail-row"><span>Binding</span><strong>{data.bonding}</strong></div>}
            </div>
          </div>
          {data.description && <p className="item-sheet-description">“{data.description}”</p>}
          <section>
            <h3>Where to get it</h3>
            {data.sources.length ? (
              <ul className="item-sources">
                {data.sources.map((source, index) => <li key={index}><Badge tone={source.kind === "raid" ? "blue" : "neutral"}>{source.kind === "raid" ? "Raid" : source.kind === "dungeon" ? "Dungeon" : "Other"}</Badge><span>{source.encounter} in {source.instance}</span></li>)}
              </ul>
            ) : <p className="muted small">The in-game Adventure Guide doesn't list a boss for this item. It may be crafted, sold, or a quest reward</p>}
          </section>
          <ItemPowerSection key={data.id} item={data} character={character} onLevel={setShownLevel} />
          {inSlot.length > 0 && (
            <section>
              <h3>Equipped now</h3>
              <ul className="item-equipped">
                {inSlot.map((gear) => (
                  <li key={gear.slot}>
                    <button type="button" className="item-equipped-link" onClick={() => open(wowheadItemUrl(gear.itemId!, { itemLevel: gear.itemLevel, bonusIds: gear.bonusIds }))} aria-label={`Open ${gear.name} on Wowhead`}>
                      <span>{gear.name}</span><ExternalLink size={13} aria-hidden="true" />
                    </button>
                    <small>{gear.itemLevel != null ? `Item level ${Math.round(gear.itemLevel)}` : "Item level unknown"}{gear.itemLevel != null && shownLevel != null ? ` · ${shownLevel - Math.round(gear.itemLevel) >= 0 ? "+" : "−"}${Math.abs(shownLevel - Math.round(gear.itemLevel))} with this item` : ""}</small>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {character && compatibility?.reason && <p className="secondary small" role={compatibility.compatible ? undefined : "alert"}>{compatibility.reason}</p>}
          <div className="actions">
            {onPick && <Button variant="primary" disabled={!compatibility?.compatible} onClick={() => onPick(data)}>{addLabel ?? "Add to plan"}</Button>}
            <Button onClick={() => open(wowheadItemUrl(data.id, { itemLevel: shownLevel }))}><ExternalLink />Open on Wowhead</Button>
          </div>
        </div>
  );
}

/** Opens item search from anywhere with Ctrl+K or Cmd+K */
export function useItemSearchShortcut(open: () => void) {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); open(); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);
}

/** Resolves "Enchant #123" and "Gem #456" placeholders from older imports into readable names */
export function useReadableGear(gear: Array<{ enchant: string | null; gems: string[] }>) {
  const enchantIds = useMemo(() => gear.flatMap((item) => { const match = item.enchant?.match(/^Enchant #(\d+)$/); return match ? [Number(match[1])] : []; }), [gear]);
  const gemIds = useMemo(() => gear.flatMap((item) => item.gems.flatMap((gem) => { const match = gem.match(/^Gem #(\d+)$/); return match ? [Number(match[1])] : []; })), [gear]);
  const status = useGameData();
  const ready = status.data?.state === "ready";
  const enchants = useQuery({ queryKey: ["enchant-names", enchantIds], queryFn: () => api.enchantNames(enchantIds), enabled: ready && enchantIds.length > 0 });
  const gems = useQuery({ queryKey: ["gem-names", gemIds], queryFn: () => api.getItems(gemIds), enabled: ready && gemIds.length > 0 });
  return {
    enchant(value: string | null) { const match = value?.match(/^Enchant #(\d+)$/); return match ? enchants.data?.[Number(match[1])] ?? value : value; },
    gem(value: string) { const match = value.match(/^Gem #(\d+)$/); return match ? gems.data?.find((item) => item.id === Number(match[1]))?.name ?? value : value; },
  };
}

export function SearchButton({ onClick }: { onClick: () => void }) {
  return (
    <Button className="title-search" onClick={onClick} aria-label="Search items" aria-keyshortcuts="Control+K">
      <Search />
      <span>Search items</span>
      <kbd>Ctrl K</kbd>
    </Button>
  );
}
