import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CircleHelp, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../../lib/client";
import { errorMessage, notify } from "../../lib/notify";
import { addItemToPlan, usePlanItemIds } from "../../lib/plan-item";
import { Term } from "../../components/Term";
import { AppSelect } from "../../components/AppSelect";
import { Badge, Button } from "../../components/ui/primitives";
import { ItemIcon, useGameData, useReadableGear } from "../items/items";
import { ItemHoverCard } from "../items/ItemHoverCard";
import { ItemCompareCard } from "../items/ItemCompareCard";
import type { Activity, Character, CharacterStats, GearItem } from "../../../shared/domain";
import { topRegionNames, topSlotGroups, type TopCount, type TopPlayers, type TopRegion } from "../../../shared/top-players";
import type { ItemSummary } from "../../../shared/gamedata";
import "./top-players.css";

async function copy(text: string, what: string) {
  try { await navigator.clipboard.writeText(text); notify(`${what} copied`); } catch { notify("Copy failed, select the text and copy it manually"); }
}
const same = (a: string | null | undefined, b: string | null | undefined) => !!a && !!b && (a.toLowerCase().includes(b.toLowerCase()) || b.toLowerCase().includes(a.toLowerCase()));

/** The lowest-level equipped item in the slot group that is not already this item, which is the one a swap would replace */
function swapTarget(mine: GearItem[], entry: TopCount) {
  return [...mine].filter((item) => item.itemId && item.itemId !== entry.id).sort((a, b) => (a.itemLevel ?? Infinity) - (b.itemLevel ?? Infinity))[0];
}

function Share({ entry, total }: { entry: TopCount; total: number }) {
  return <span className="top-share" aria-label={`${entry.count} of ${total} players`}>{entry.count}/{total}</span>;
}

function activityLabel(activity: Activity) {
  switch (activity) {
    case "mythicPlus":
      return "Mythic+";
    case "raiding":
      return "Raiding";
    case "pvp":
      return "PvP";
    default: {
      const _never: never = activity;
      return _never;
    }
  }
}

function planItemFromEntry(entry: TopCount, known?: ItemSummary): ItemSummary {
  return known ?? {
    id: entry.id,
    name: entry.name,
    quality: 4,
    itemLevel: 0,
    requiredLevel: 0,
    slot: "",
    inventoryType: 0,
    armor: null,
    icon: null,
    expansion: 0,
    sources: [],
  };
}

function ItemCell({
  entry,
  items,
  total,
  onAdd,
  replaces,
  stats,
}: {
  entry: TopCount | undefined;
  items: Map<number, ItemSummary>;
  total: number;
  onAdd?: () => void;
  /** The equipped item this one would replace, for a side-by-side hover */
  replaces?: GearItem;
  stats?: CharacterStats | null;
}) {
  if (!entry) return <span className="muted">Unknown</span>;
  const item = items.get(entry.id);
  return (
    <div className="top-item-row">
      {(() => {
        const row = (
          <div className="top-item">
            <ItemIcon icon={item?.icon} quality={item?.quality ?? 4} size="small" />
            <span className={`quality-text-${item?.quality ?? 4}`}>{item?.name ?? entry.name}</span>
            <Share entry={entry} total={total} />
          </div>
        );
        return replaces
          ? <ItemCompareCard top={{ id: entry.id, name: entry.name, level: entry.level ?? null, item }} mine={replaces} topLevel={entry.level} stats={stats}>{row}</ItemCompareCard>
          : <ItemHoverCard itemId={entry.id} item={item} name={entry.name}>{row}</ItemHoverCard>;
      })()}
      {onAdd && (
        <Button variant="quiet" onClick={onAdd} aria-label={`Add ${item?.name ?? entry.name} to your plan`}>
          Add to plan
        </Button>
      )}
    </div>
  );
}

export function TopPlayersPage({ character }: { character: Character }) {
  const ready = character.specId != null && character.specId > 0 && character.specName !== "Unknown" && character.className !== "Unknown" && !character.demo;
  const [region, setRegion] = useState<TopRegion>("us");
  const queryClient = useQueryClient();
  const settings = useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });
  const activity = settings.data?.characterActivities?.[character.id] ?? settings.data?.activity ?? "mythicPlus";
  const planned = usePlanItemIds(character, activity);
  const top = useQuery({
    queryKey: ["top-players", character.specId, region],
    queryFn: () => api.topPlayers({ specId: character.specId!, specName: character.specName, className: character.className, region }),
    enabled: ready,
    staleTime: 30 * 60_000,
    retry: false,
  });
  const refresh = useMutation({
    mutationFn: (input: { specId: number; specName: string; className: string; region: TopRegion }) => api.topPlayers({ ...input, force: true }),
    onSuccess: (result, input) => queryClient.setQueryData(["top-players", input.specId, input.region], result),
  });
  const currentRefresh = refresh.variables?.specId === character.specId && refresh.variables?.region === region;
  const data = top.data;
  const ids = useMemo(() => {
    if (!data) return [];
    const all = Object.values(data.slots).flatMap((slot) => [...(slot?.items ?? []), ...(slot?.gems ?? [])].map((entry) => entry.id));
    return [...new Set([...all, ...character.gear.flatMap((item) => (item.itemId ? [item.itemId] : []))])].slice(0, 200);
  }, [data, character.gear]);
  const gameData = useGameData();
  const items = useQuery({ queryKey: ["items", ids], queryFn: () => api.getItems(ids), enabled: gameData.data?.state === "ready" && ids.length > 0 });
  const itemMap = useMemo(() => new Map((items.data ?? []).map((item) => [item.id, item])), [items.data]);
  const readable = useReadableGear(character.gear);

  if (!ready)
    return (
      <>
        <PageHeading character={character} />
        <section className="surface">
          <div className="unknown-note">
            <CircleHelp />
            <p>{character.demo ? "Demo characters can't be compared with real players" : "Refresh this character first so its class and specialization are known"}</p>
          </div>
        </section>
      </>
    );
  return (
    <>
      <PageHeading character={character} data={data} region={region} onRegionChange={setRegion} refreshing={top.isFetching || (currentRefresh && refresh.isPending)} onRefresh={() => refresh.mutate({ specId: character.specId!, specName: character.specName, className: character.className, region })} />
      {(top.isError || (currentRefresh && refresh.isError)) && (
        <section className="surface"><p className="secondary small" role="alert">{errorMessage(currentRefresh && refresh.isError ? refresh.error : top.error)}</p></section>
      )}
      {!data && top.isFetching && <section className="surface"><p className="secondary small">Collecting the top {character.specName} {character.className} players… this takes a few seconds the first time</p></section>}
      {data && (
        <>
          <div className="top-summary">
            <div><small>Players compared</small><strong>{data.players.length}</strong></div>
            <div><small>Their average <Term term="item level">item level</Term></small><strong>{data.averageItemLevel?.toFixed(1) ?? "Unknown"}</strong></div>
            <div><small>Your item level</small><strong>{character.itemLevel?.toFixed(1) ?? "Unknown"}</strong></div>
          </div>
          <BuildsSurface data={data} character={character} />
          <section className="surface top-gear">
            <div className="surface-heading">
              <div>
                <h2>Gear top players wear</h2>
                <p>From {data.gearPlayers} of these players' equipped gear. Add a popular item to {character.name}'s {activityLabel(activity)} plan</p>
              </div>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Slot</th>
                    <th>Most worn</th>
                    <th>Yours</th>
                    <th><Term term="enchant">Enchant</Term></th>
                    <th><Term term="gem">Gems</Term></th>
                  </tr>
                </thead>
                <tbody>
                  {topSlotGroups.map(({ group, label, slots }) => {
                    const slot = data.slots[group];
                    if (!slot) return null;
                    const mine = character.gear.filter((item) => slots.includes(item.slot));
                    const popular = slot.items.slice(0, group === "rings" || group === "trinkets" ? 2 : 1);
                    const matches = mine.filter((item) => slot.items.some((entry) => entry.id === item.itemId && entry.count > 1));
                    const myEnchants = mine.map((item) => readable.enchant(item.enchant)).filter(Boolean) as string[];
                    const topEnchant = slot.enchants[0];
                    return (
                      <tr key={group}>
                        <td className="top-slot">{label}</td>
                        <td>
                          <div className="top-stack">
                            {popular.map((entry) => (
                              <ItemCell
                                key={entry.id}
                                entry={entry}
                                items={itemMap}
                                total={data.gearPlayers}
                                replaces={swapTarget(mine, entry)}
                                stats={character.stats}
                                onAdd={mine.some((item) => item.itemId === entry.id) || planned.has(entry.id) ? undefined : () => {
                                  void addItemToPlan({
                                    character,
                                    activity,
                                    item: planItemFromEntry(entry, itemMap.get(entry.id)),
                                    slots,
                                  }).then((slot) => {
                                    if (!slot) {
                                      notify(`${entry.name} doesn't match this character's class, specialization, or gear slot`);
                                      return;
                                    }
                                    notify(`Added ${itemMap.get(entry.id)?.name ?? entry.name} to ${character.name}'s ${activityLabel(activity)} plan`);
                                  }).catch((error) => notify(errorMessage(error)));
                                }}
                              />
                            ))}
                          </div>
                        </td>
                        <td>
                          <div className="top-stack">
                            {mine.length ? mine.map((item) => {
                              const known = item.itemId ? itemMap.get(item.itemId) : undefined;
                              const match = matches.includes(item);
                              const row = (
                                <div className="top-item">
                                  <ItemIcon icon={known?.icon} quality={known?.quality ?? 1} size="small" />
                                  <span>{known?.name ?? item.name}</span>
                                  {match && <Badge tone="green"><Check size={11} />Popular</Badge>}
                                </div>
                              );
                              // Hovering your item shows what the most-worn item you don't have would change
                              const candidate = popular.find((entry) => !mine.some((owned) => owned.itemId === entry.id));
                              return candidate && item.itemId
                                ? <ItemCompareCard key={item.slot} top={{ id: candidate.id, name: candidate.name, level: candidate.level ?? null, item: itemMap.get(candidate.id) }} mine={item} topLevel={candidate.level} stats={character.stats}>{row}</ItemCompareCard>
                                : <ItemHoverCard key={item.slot} itemId={item.itemId} item={known} gear={item}>{row}</ItemHoverCard>;
                            }) : <span className="muted">Unknown</span>}
                          </div>
                        </td>
                        <td>
                          {topEnchant ? (
                            <div className="top-enchant">
                              <span>{topEnchant.name} <Share entry={topEnchant} total={data.gearPlayers} /></span>
                              {myEnchants.length > 0 ? (
                                same(myEnchants[0], topEnchant.name) ? <small className="ok">You have it</small> : myEnchants.every((name) => /^Enchant #\d+$/.test(name)) ? <small>Yours isn't recognized yet</small> : <small>Yours: {myEnchants.join(", ")}</small>
                              ) : mine.length ? <small className="warn">You have none</small> : null}
                            </div>
                          ) : <span className="muted">None used</span>}
                        </td>
                        <td>
                          {slot.gems.length ? (
                            <div className="top-gems">
                              {slot.gems.slice(0, 2).map((gem) => (
                                <ItemHoverCard key={gem.id} itemId={gem.id} item={itemMap.get(gem.id)} name={gem.name}>
                                  <span className="top-gem">{itemMap.get(gem.id)?.name ?? gem.name} <Share entry={gem} total={data.gearPlayers} /></span>
                                </ItemHoverCard>
                              ))}
                            </div>
                          ) : <span className="muted">None used</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="surface">
            <div className="surface-heading">
              <h2>Players compared</h2>
            </div>
            <ol className="top-players">
              {data.players.map((player) => (
                <li key={player.url}>
                  <span className="top-player-name">{player.name}<small>{player.realm} · {player.region.toUpperCase()}</small></span>
                  <span className="top-player-score">{player.score != null ? <><Term term="mythic+ score">Score</Term> {Math.round(player.score).toLocaleString()}</> : null}{player.keyLevel != null ? ` · best key +${player.keyLevel}` : ""}</span>
                  <Button variant="quiet" onClick={() => void api.openExternal(player.url)} aria-label={`Open ${player.name} on Raider.IO`}><ExternalLink /></Button>
                </li>
              ))}
            </ol>
          </section>
        </>
      )}
    </>
  );
}

function PageHeading({ character, data, region, onRegionChange, refreshing, onRefresh }: { character: Character; data?: TopPlayers; region?: TopRegion; onRegionChange?: (region: TopRegion) => void; refreshing?: boolean; onRefresh?: () => void }) {
  return (
    <div className="page-heading">
      <div>
        <h1>Top players</h1>
        <p>{data ? `${data.population} · ${data.source} · ${new Date(data.observedAt).toLocaleDateString()}` : `What the best ${character.specName} ${character.className} players use in Mythic+`}</p>
      </div>
      {onRefresh && <div className="top-heading-actions">
        {region && onRegionChange && <AppSelect aria-label="Top players region" value={region} onValueChange={(value) => onRegionChange(value as TopRegion)} options={Object.entries(topRegionNames).map(([value, label]) => ({ value, label }))} />}
        <Button disabled={refreshing} onClick={onRefresh}>
          <RefreshCw className={refreshing ? "spin" : ""} />
          {refreshing ? "Updating…" : "Update"}
        </Button>
      </div>}
    </div>
  );
}

function BuildsSurface({ data, character }: { data: TopPlayers; character: Character }) {
  const mine = character.talents?.specId == null || character.talents.specId === character.specId ? character.talents?.loadout : null;
  // Builds shared by several players come first, then the highest-ranked players' own builds
  const shared = data.builds.filter((build) => build.count > 1).map((build) => ({ ...build, title: `Used by ${build.count} of ${data.players.length}`, detail: build.players.slice(0, 3).join(", ") + (build.players.length > 3 ? "…" : "") }));
  const individual = data.players.flatMap((player, index) => player.loadout && !shared.some((build) => build.loadout === player.loadout) ? [{ loadout: player.loadout, count: 1, players: [player.name], title: `#${index + 1} ${player.name}`, detail: `${player.realm} · ${player.region.toUpperCase()}${player.score != null ? ` · score ${Math.round(player.score).toLocaleString()}` : ""}` }] : []);
  const listed = [...shared, ...individual].slice(0, 6);
  return (
    <section className="surface">
      <div className="surface-heading">
        <div>
          <h2>Talent builds</h2>
          <p>Copy a <Term term="talent string">talent string</Term>, then in game open Talents, choose Import, and paste it</p>
        </div>
        {mine && <Button onClick={() => void copy(mine, "Your talent string")}><Copy />Copy yours</Button>}
      </div>
      {listed.length ? (
        <ul className="top-builds">
          {listed.map((build) => (
            <li key={build.loadout}>
              <div>
                <strong>{build.title}</strong>
                <small>{build.detail}</small>
              </div>
              {mine === build.loadout && <Badge tone="green">Same as yours</Badge>}
              <Button variant="quiet" onClick={() => void copy(build.loadout, "Talent string")}><Copy />Copy</Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="secondary small">These players' talents aren't public right now</p>
      )}
    </section>
  );
}
