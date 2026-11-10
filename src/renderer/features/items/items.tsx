import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useHotkey } from "@tanstack/react-hotkeys";
import { ExternalLink, RefreshCw, Search, Sparkles, X } from "lucide-react";
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { AppSelect } from "../../components/AppSelect";
import { Toggle } from "../../components/ui/toggle";
import { Badge, Button, Sheet } from "../../components/ui/primitives";
import { Term } from "../../components/Term";
import { api } from "../../lib/client";
import { ItemIcon } from "./ItemIcon";
import { ItemPowerSection, wowheadItemUrl } from "./ItemPower";
import { errorMessage, notify } from "../../lib/notify";
import { armorSlots, armorTypes, gearSlotsForInventoryType, qualityNames, trackRankLabel, type ArmorType, type ItemSearch, type ItemSummary, type ItemSearchCharacter } from "../../../shared/gamedata";
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

type Filters = { source: "any" | "dungeon" | "raid"; instance: string; stat: NonNullable<ItemSearch["stat"]>; quality: string; armor: ArmorType | "any"; withEffect: boolean; withSocket: boolean; levelBasis: "max" | "base"; minLevel: string; maxLevel: string };
const noFilters: Filters = { source: "any", instance: "any", stat: "any", quality: "any", armor: "any", withEffect: false, withSocket: false, levelBasis: "max", minLevel: "", maxLevel: "" };
type Sort = NonNullable<ItemSearch["sort"]>;
const sortOptions = [{ value: "relevance", label: "Best match" }, { value: "maxLevel", label: "Highest max item level" }, { value: "baseLevel", label: "Highest base item level" }];
const levelBasisOptions = [{ value: "max", label: "Max item level" }, { value: "base", label: "Base item level" }];
/** A typed item level, or null while the box is empty or not a whole number */
const levelValue = (text: string) => /^\d{1,4}$/.test(text.trim()) && Number(text) >= 1 ? Math.min(2000, Number(text)) : null;
const statOptions = [{ value: "any", label: "Any stat" }, { value: "crit", label: "Critical Strike" }, { value: "haste", label: "Haste" }, { value: "mastery", label: "Mastery" }, { value: "versatility", label: "Versatility" }];
const qualityOptions = [{ value: "any", label: "Any quality" }, ...[2, 3, 4, 5].map(quality => ({ value: String(quality), label: qualityNames[quality]! }))];
const armorOptions = [{ value: "any", label: "Any armor" }, ...armorTypes.map(armor => ({ value: armor, label: armor[0]!.toUpperCase() + armor.slice(1) }))];

/** Item search that runs entirely against the local index built from the user's WoW install */
export function ItemSearchDialog({ open, onOpenChange, character, slot: fixedSlot, title = "Search items", onPick, addLabel }: { open: boolean; onOpenChange: (open: boolean) => void; character?: Character; slot?: AppearanceSlot; title?: string; onPick?: (item: ItemSummary) => void; addLabel?: string }) {
  const status = useGameData();
  const client = useQueryClient();
  const rebuild = useMutation({ mutationFn: () => api.rebuildItemData(), onSuccess: () => { notify("Item data prepared"); void client.invalidateQueries(); }, onError: (error) => notify(errorMessage(error)) });
  const [text, setText] = useState("");
  const [slot, setSlot] = useState<AppearanceSlot | "any">(fixedSlot ?? "any");
  const [filters, setFilters] = useState<Filters>(noFilters);
  const setFilter = <K extends keyof Filters>(key: K, value: Filters[K]) => setFilters(previous => ({ ...previous, [key]: value }));
  const { source } = filters;
  const [current, setCurrent] = useState(true);
  const [highlighted, setHighlighted] = useState("");
  const list = useRef<HTMLDivElement>(null);
  useEffect(() => { if (open) { setSlot(fixedSlot ?? "any"); setText(""); setHighlighted(""); } }, [open, fixedSlot, character?.id, character?.className, character?.specId, character?.level]);
  const debouncedText = useDebounced(text);
  const [sort, setSort] = useState<Sort>("relevance");
  // Typed item levels wait for a pause like the name box, so each keystroke doesn't start a search
  const levels = { min: useDebounced(levelValue(filters.minLevel), 300), max: useDebounced(levelValue(filters.maxLevel), 300) };
  const query = {text:debouncedText,slot:fixedSlot??slot,current,...filters,sort,levels};
  const shownSlot = fixedSlot ?? (slot === "any" ? null : slot);
  // Armor type only narrows armor slots, and a character already limits results to what they can wear
  const armorFilter = !character && (!shownSlot || armorSlots.has(shownSlot));
  const instances = useQuery({ queryKey: ["item-instances", current], queryFn: () => api.itemInstances(current), enabled: open && status.data?.state === "ready", staleTime: Infinity });
  const instanceOptions = [{ value: "any", label: "Any dungeon or raid" }, ...(instances.data ?? []).filter(entry => source === "any" || entry.kind === source).map(entry => ({ value: entry.name, label: entry.name }))];
  useEffect(() => { if (filters.instance !== "any" && instances.data && !instanceOptions.some(option => option.value === filters.instance)) setFilter("instance", "any"); }, [instances.data, source]);
  const activeFilters = (Object.keys(noFilters) as Array<keyof Filters>).filter(key => key !== "levelBasis" && filters[key] !== noFilters[key] && (key !== "armor" || armorFilter)).length;
  const context = character ? {className:character.className,specId:character.specId,level:character.level} : null;
  const ready = status.data?.state === "ready";
  const results = useInfiniteQuery({
    queryKey: ["item-search-pages", character?.id, context, query],
    queryFn: ({ pageParam }) => api.searchItemsPage({ text: query.text, slot: fixedSlot ?? (query.slot === "any" ? null : query.slot), character:context, source: query.source, currentOnly: query.current, instance: query.instance === "any" ? null : query.instance, stat: query.stat, quality: query.quality === "any" ? null : Number(query.quality), armor: armorFilter && query.armor !== "any" ? query.armor : null, withEffect: query.withEffect, withSocket: query.withSocket, sort: query.sort, levelBasis: query.levelBasis, minLevel: query.levels.min, maxLevel: query.levels.max, limit: 40, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: page => page.nextOffset ?? undefined,
    enabled: open && ready,
  });
  const items = results.data?.pages.flatMap(page => page.items) ?? [];
  useEffect(() => { list.current?.scrollTo(0, 0); setHighlighted(""); }, [debouncedText, fixedSlot, slot, filters, current, sort, levels.min, levels.max, character?.id, character?.className, character?.specId, character?.level]);
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
              <AppSelect aria-label="Where it comes from" value={source} onValueChange={(value) => setFilter("source", value as Filters["source"])} options={[{ value: "any", label: "Any source" }, { value: "dungeon", label: "Dungeons" }, { value: "raid", label: "Raids" }]} />
              <AppSelect aria-label="Dungeon or raid" value={filters.instance} onValueChange={(value) => setFilter("instance", value)} options={instanceOptions} />
              <AppSelect aria-label="Secondary stat" value={filters.stat} onValueChange={(value) => setFilter("stat", value as Filters["stat"])} options={statOptions} />
              <AppSelect aria-label="Quality" value={filters.quality} onValueChange={(value) => setFilter("quality", value)} options={qualityOptions} />
              {armorFilter && <AppSelect aria-label="Armor type" value={filters.armor} onValueChange={(value) => setFilter("armor", value as Filters["armor"])} options={armorOptions} />}
              <Toggle type="button" variant="outline" className="workspace-toggle" pressed={current} onPressedChange={setCurrent} aria-label="This season only">
                <span>This season only</span><span className="toggle-state">{current ? "On" : "Off"}</span>
              </Toggle>
              <Toggle type="button" variant="outline" className="workspace-toggle" pressed={filters.withEffect} onPressedChange={(pressed) => setFilter("withEffect", pressed)} aria-label="Has a special effect">
                <span>Has an effect</span><span className="toggle-state">{filters.withEffect ? "On" : "Off"}</span>
              </Toggle>
              <Toggle type="button" variant="outline" className="workspace-toggle" pressed={filters.withSocket} onPressedChange={(pressed) => setFilter("withSocket", pressed)} aria-label="Has a gem socket">
                <span>Has a socket</span><span className="toggle-state">{filters.withSocket ? "On" : "Off"}</span>
              </Toggle>
              <div className="item-level-range" role="group" aria-label="Item level range">
                <AppSelect aria-label="Item level to filter by" value={filters.levelBasis} onValueChange={(value) => setFilter("levelBasis", value as Filters["levelBasis"])} options={levelBasisOptions} />
                <input inputMode="numeric" aria-label="Lowest item level" placeholder="From" value={filters.minLevel} onChange={(event) => setFilter("minLevel", event.target.value.replace(/\D/g, "").slice(0, 4))} />
                <span aria-hidden="true">–</span>
                <input inputMode="numeric" aria-label="Highest item level" placeholder="To" value={filters.maxLevel} onChange={(event) => setFilter("maxLevel", event.target.value.replace(/\D/g, "").slice(0, 4))} />
              </div>
              <AppSelect aria-label="Sort results" value={sort} onValueChange={(value) => setSort(value as Sort)} options={sortOptions} />
              {activeFilters > 0 && <Button variant="quiet" onClick={() => setFilters(noFilters)}>Clear {activeFilters === 1 ? "filter" : `${activeFilters} filters`}</Button>}
            </div>
            {status.data?.outdated && status.data.state === "ready" && <div className="item-search-outdated" role="status">
              <span><strong>Item data is from an older version</strong> · Effects, stats, and upgrade tracks appear once it is prepared again{status.data.error ? ` · Last try: ${status.data.error}` : ""}</span>
              <Button disabled={rebuild.isPending} onClick={() => rebuild.mutate()}><RefreshCw />{rebuild.isPending ? "Preparing…" : "Prepare item data"}</Button>
            </div>}
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
                    <CommandItem key={item.id} value={String(item.id)} onFocus={() => setHighlighted(String(item.id))} onSelect={() => previewItem(item)} className="item-result">
                      <ItemIcon icon={item.icon} quality={item.quality} />
                      <span className="item-result-text">
                        <strong className={`quality-text-${item.quality}`}>{item.name}</strong>
                        <small>{[item.slot, item.armor && item.armor[0]!.toUpperCase() + item.armor.slice(1), item.itemLevel ? `Base ${item.itemLevel}` : null, item.maxLevel ? `Up to ${item.maxLevel.itemLevel} (${trackRankLabel(item.maxLevel.track, item.maxLevel.rank, item.maxLevel.ranks)}${item.maxLevel.assumed ? ", assumed" : ""})` : null].filter(Boolean).join(" · ")}</small>
                        {item.effects?.map((effect, index) => <small key={index} className="item-result-effect"><Sparkles aria-hidden="true" /><span><strong>{effect.label}:</strong> {effect.text}</span></small>)}
                        {sourceLine(item) && <small className="item-result-source">{sourceLine(item)}</small>}
                        {context && !getItemCompatibility(item,context).verified && <small>{getItemCompatibility(item,context).reason ?? "Some equipment restrictions are unknown"}</small>}
                      </span>
                    </CommandItem>
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

/** Opens item search from anywhere with Ctrl+K, or Cmd+K on a Mac, including from inside a text field */
export function useItemSearchShortcut(open: () => void) {
  useHotkey("Mod+K", () => open());
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
