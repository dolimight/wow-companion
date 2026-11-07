import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AppSelect } from "../../components/AppSelect";
import { Term } from "../../components/Term";
import { api } from "../../lib/client";
import { specPrimaryStat } from "../../../shared/item-compatibility";
import type { ItemDetail, ItemPowerStat, ItemSearchCharacter } from "../../../shared/gamedata";

const primaryNames = { strength: "Strength", agility: "Agility", intellect: "Intellect" } as const;

/** A flexible primary stat reads as the one this character would actually get */
function statLabel(stat: ItemPowerStat, character: ItemSearchCharacter | null) {
  if (!stat.name.includes(" or ")) return stat.name;
  const primary = specPrimaryStat(character?.specId);
  const name = primary ? primaryNames[primary] : null;
  return name && stat.name.split(" or ").includes(name) ? name : stat.name;
}

export function wowheadItemUrl(id: number, options: { itemLevel?: number | null; bonusIds?: number[] | null } = {}) {
  const query = [options.bonusIds?.length ? `bonus=${options.bonusIds.join(":")}` : null, options.itemLevel ? `ilvl=${Math.round(options.itemLevel)}` : null].filter(Boolean).join("&");
  return `https://www.wowhead.com/item=${id}${query ? `?${query}` : ""}`;
}

/**
 * Stats, effects, upgrade track, and loot table for one item, at its highest reachable level by default.
 * Values are worked out from the installed game's scaling tables; anything the files can't settle is marked
 */
export function ItemPowerSection({ item, character, onLevel }: { item: ItemDetail; character: ItemSearchCharacter | null; onLevel?: (level: number | null) => void }) {
  const [picked, setPicked] = useState<number | null>(null);
  const power = useQuery({
    queryKey: ["item-power", item.id, picked, character],
    queryFn: () => api.itemPower({ id: item.id, itemLevel: picked, character }),
    placeholderData: (previous) => previous,
    staleTime: 5 * 60_000,
  });
  const data = power.data;
  useEffect(() => { if (data) onLevel?.(data.level ?? null); }, [data, onLevel]);
  if (power.isPending) return <p className="muted small">Working out stats…</p>;
  if (!data) return null;
  const { tracks, level } = data;
  const choices = tracks?.tracks.flatMap((track) => track.levels.map((itemLevel, index) => ({ value: String(itemLevel), label: `${track.name} ${index + 1}/${track.ranks} · ${itemLevel}` }))) ?? [];
  const unique = [...new Map(choices.map((choice) => [choice.value, choice])).values()].sort((a, b) => Number(b.value) - Number(a.value));
  if (tracks && !unique.some((choice) => choice.value === String(tracks.max.itemLevel))) unique.unshift({ value: String(tracks.max.itemLevel), label: `${tracks.max.track} ${tracks.max.rank}/${tracks.max.ranks} · ${tracks.max.itemLevel}` });
  const current = String(level ?? "");
  const choose = (value: string) => setPicked(Number(value) === tracks?.max.itemLevel ? null : Number(value));
  const stats = data.power?.stats;
  const primary = stats?.filter((stat) => !stat.secondary) ?? [];
  const secondary = stats?.filter((stat) => stat.secondary) ?? [];
  const heading = data.basis === "base" ? `At base item level ${level ?? "unknown"}` : data.basis === "picked" ? `At item level ${level}` : `At its highest level, ${tracks!.max.track} ${tracks!.max.rank}/${tracks!.max.ranks} · ${tracks!.max.itemLevel}`;
  return (
    <>
      <section className="item-power" aria-busy={power.isFetching}>
        <div className="item-power-head">
          <h3>{heading}</h3>
          {unique.length > 1 && <AppSelect aria-label="Item level to show stats at" value={current} onValueChange={choose} options={unique} />}
        </div>
        {data.basis === "season" && <p className="muted small">Mythic+ drops get their upgrade track when they drop, and the game files don't say which. This shows the season's top track, which the Great Vault can give</p>}
        {data.basis === "base" && <p className="muted small">This item isn't on a current-season upgrade track, so stats are shown at its base item level</p>}
        {!data.power ? (
          <p className="muted small">Stats for this level aren't in your game data yet. Rebuild item data in Settings → Connections</p>
        ) : (
          <dl className="item-power-stats">
            {data.power.armor != null && <div><dt>Armor</dt><dd>{data.power.armor.toLocaleString()}</dd></div>}
            {primary.map((stat) => <div key={stat.type}><dt>{statLabel(stat, character)}</dt><dd>+{stat.value.toLocaleString()}</dd></div>)}
            {secondary.map((stat) => <div key={stat.type} className="secondary"><dt>{stat.name}</dt><dd>+{stat.value.toLocaleString()}</dd></div>)}
            {stats === null && <div><dt>Stats</dt><dd>Unknown</dd></div>}
          </dl>
        )}
        {data.power?.setPiece && secondary.length > 0 && <p className="muted small">Set pieces can drop with their secondary stats rearranged; the total stays the same</p>}
        {data.power && data.power.effects.length > 0 && (
          <ul className="item-power-effects">
            {data.power.effects.map((effect, index) => (
              <li key={index}><strong>{effect.label}:</strong> {effect.text}{effect.cooldown ? ` (${effect.cooldown} cooldown)` : ""}{!effect.complete && <small> Some values couldn't be read from the game files and show as ?</small>}</li>
            ))}
          </ul>
        )}
      </section>
      {tracks && tracks.tracks.length > 0 && (
        <section>
          <h3><Term term="upgrade track">Upgrade tracks</Term></h3>
          <table className="item-tracks">
            <thead><tr><th>Track</th><th>Ranks</th><th>Item level</th></tr></thead>
            <tbody>{tracks.tracks.map((track) => <tr key={track.name} data-max={track.name === tracks.max.track || undefined}><td>{track.name}</td><td>1–{track.ranks}</td><td>{track.minLevel}–{track.maxLevel}</td></tr>)}</tbody>
          </table>
          <p className="muted small">{tracks.max.assumed ? `${tracks.season}: Mythic+ gear lands on one of these tracks depending on the keystone level` : `${tracks.season}, from your installed game files. Harder difficulties drop on higher tracks; crests and gold upgrade an item through its ranks`}</p>
        </section>
      )}
      {data.loot.length > 0 && (
        <section>
          <h3>Drop chance</h3>
          <ul className="item-loot">
            {data.loot.map((boss) => (
              <li key={boss.encounter + boss.instance}>
                <span>{boss.encounter}, {boss.instance}</span>
                <strong>{boss.forCharacter != null && boss.forCharacter > 0 ? `1 of ${boss.forCharacter} items for your spec` : `1 of ${boss.total} items`}</strong>
              </li>
            ))}
          </ul>
          <p className="muted small">Blizzard doesn't publish drop chances. This counts the items in the same boss's loot{character ? " that your class and specialization can use" : ""}, so a smaller number means better odds when that boss gives you loot</p>
        </section>
      )}
    </>
  );
}
