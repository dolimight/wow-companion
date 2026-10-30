import { useState, type ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "../../components/ui/hover-card";
import { api } from "../../lib/client";
import type { CharacterStats, GearItem } from "../../../shared/domain";
import type { ItemSummary } from "../../../shared/gamedata";
import { compareStats } from "../../../shared/stat-lines";
import { drBrackets } from "../../../shared/diminishing";
import { estimateSwap } from "../../../shared/swap-estimate";
import { ItemIcon } from "./ItemIcon";
import "./item-hover-card.css";
import "./item-compare-card.css";

type Side = { id: number; name: string; level: number | null; item?: ItemSummary };

const signed = (value: number, digits = 0) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toLocaleString(undefined, { maximumFractionDigits: digits })}`;

function Header({ label, side }: { label: string; side: Side }) {
  return (
    <div className="compare-side">
      <small>{label}</small>
      <div className="compare-item">
        <ItemIcon icon={side.item?.icon} quality={side.item?.quality} size="medium" />
        <div>
          <strong className={`quality-text-${side.item?.quality ?? 1}`}>{side.item?.name ?? side.name}</strong>
          <span>{side.level ? `Item level ${side.level}` : "Item level unknown"}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Hover card that sets an item against the one it would replace and spells out what changes.
 * Both items are compared at their base item level so the stat rows are like for like; the real
 * item-level gap, which upgrades widen, is stated separately
 */
export function ItemCompareCard({ top, mine, topLevel, stats, children }: { top: Side; mine: GearItem; topLevel?: number | null; stats?: CharacterStats | null; children: ReactElement }) {
  const [open, setOpen] = useState(false);
  const topTip = useQuery({ queryKey: ["item-tooltip", top.id], queryFn: () => api.itemTooltip(top.id), enabled: open, staleTime: 5 * 60_000, retry: false });
  const mineTip = useQuery({ queryKey: ["item-tooltip", mine.itemId], queryFn: () => api.itemTooltip(mine.itemId!), enabled: open && !!mine.itemId, staleTime: 5 * 60_000, retry: false });
  const mineSide: Side = { id: mine.itemId ?? 0, name: mine.name, level: mine.itemLevel, item: mineTip.data?.item ?? undefined };
  const topSide: Side = { ...top, level: topLevel ?? top.level, item: topTip.data?.item ?? top.item };
  const topStats = topTip.data?.preview?.stats ?? [];
  const mineStats = mineTip.data?.preview?.stats ?? [];
  const baseRows = topStats.length && mineStats.length ? compareStats(mineStats, topStats) : [];
  // With your exact stats and ratings the swap can be played out, including diminishing returns
  const estimate = topStats.length && mineStats.length && mine.stats.length
    ? estimateSwap({
        stats: stats ?? null,
        mine: { lines: mine.stats, baseLines: mineStats, level: mine.itemLevel, baseLevel: mineTip.data?.preview?.level ?? null },
        top: { lines: topStats, level: topSide.level, baseLevel: topTip.data?.preview?.level ?? null },
      })
    : null;
  const rows = estimate?.rows ?? baseRows;
  const levelChange = topSide.level != null && mineSide.level != null ? topSide.level - mineSide.level : null;
  const loading = topTip.isFetching || mineTip.isFetching;
  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger render={children} delay={250} closeDelay={120} tabIndex={0} />
      <HoverCardContent className="item-hover-card item-compare-card" side="right" align="start" sideOffset={10}>
        <div className="compare-heads">
          <Header label="Yours now" side={mineSide} />
          <ArrowRight className="compare-arrow" aria-hidden />
          <Header label="Top players" side={topSide} />
        </div>
        {levelChange != null && (
          <p className={`compare-summary ${levelChange > 0 ? "up" : levelChange < 0 ? "down" : ""}`}>
            {levelChange === 0 ? "Same item level" : `Swapping changes item level by ${signed(levelChange)}`}
          </p>
        )}
        {estimate && (
          <div className={`compare-verdict ${estimate.verdict}`} role="status">
            <strong>{estimate.verdict === "better" ? "Better for you" : estimate.verdict === "worse" ? "Not better for you" : "Mixed result"}</strong>
            {estimate.reasons.length > 0 && <ul>{estimate.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>}
          </div>
        )}
        {rows.length > 0 && (
          <table className="compare-table">
            <thead><tr><th>{estimate ? "Estimated stats" : "Base stats"}</th><th>Yours</th><th>Top</th><th>Change</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.name} className={row.secondary ? "secondary" : ""}>
                  <td>{row.name}</td>
                  <td>{row.mine ? row.mine.toLocaleString() : "—"}</td>
                  <td>{row.top ? row.top.toLocaleString() : "—"}</td>
                  <td className={row.delta > 0 ? "up" : row.delta < 0 ? "down" : ""}>{row.delta === 0 ? "0" : signed(row.delta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {estimate && estimate.dr.length > 0 && (
          <table className="compare-table compare-dr">
            <thead><tr><th>After diminishing returns</th><th>Now</th><th>After</th><th>Change</th></tr></thead>
            <tbody>
              {estimate.dr.map((entry) => (
                <tr key={entry.name}>
                  <td>
                    {entry.name}
                    {entry.bracketAfter > 0 && <small>{Math.round(drBrackets[entry.bracketAfter]!.penalty * 100)}% penalty bracket{entry.bracketAfter > entry.bracketBefore ? ", newly reached" : ""}</small>}
                  </td>
                  <td>{entry.before.toFixed(1)}%</td>
                  <td>{entry.after.toFixed(1)}%</td>
                  <td className={entry.change > 0.05 ? "up" : entry.change < -0.05 ? "down" : ""}>{Math.abs(entry.change) < 0.05 ? "0%" : `${signed(entry.change, 1)}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {loading && rows.length === 0 && <p className="item-hover-note" role="status">Comparing stats…</p>}
        {!loading && rows.length === 0 && <p className="item-hover-note">Stat changes need Blizzard data. Connect it in Settings and sync, then hover again</p>}
        {rows.length > 0 && (
          <small className="item-hover-note">
            {estimate
              ? "Estimated: the top item's stats are scaled to the item level top players wear it at, using how your own item's stats grow with item level. Percentages use your real ratings and diminishing returns, but mastery and buffs aren't included"
              : `Stats are compared before upgrades. ${mineSide.level ? `Yours is item level ${mineSide.level}` : "Your item level isn't recorded"}${topSide.level ? `, and top players wear theirs at about ${topSide.level}` : ""}. Sync again so your stat ratings are recorded for a full estimate`}
          </small>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
