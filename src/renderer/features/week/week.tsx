import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, CircleHelp, Coins, KeyRound, RefreshCw, Sun } from "lucide-react";
import { api } from "../../lib/client";
import { errorMessage, notify } from "../../lib/notify";
import { Term } from "../../components/Term";
import { Badge, Button } from "../../components/ui/primitives";
import { useConnections } from "../connections/connections";
import type { Character } from "../../../shared/domain";
import { diminishing, drBrackets } from "../../../shared/diminishing";
import { hasResetSchedule, nextDailyReset, nextWeeklyReset, vaultTracks, weeklyLockouts, weeklyRuns, type VaultTrack } from "../../../shared/weekly";
import "./week.css";

export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function countdown(ms: number) {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const rest = minutes % 60;
  if (days) return `${days}d ${hours}h`;
  if (hours) return `${hours}h ${rest}m`;
  return `${rest}m`;
}
const regionNames: Record<string, string> = { us: "Americas & Oceania", eu: "Europe", kr: "Korea", tw: "Taiwan", cn: "China" };
const ordinal = (n: number) => ["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`;
const activityWord: Record<VaultTrack["kind"], [string, string]> = { raid: ["raid boss", "raid bosses"], dungeon: ["Mythic+ dungeon", "Mythic+ dungeons"], world: ["delve or world activity", "delves or world activities"] };

/** Reset countdowns for every region that has characters, so nobody has to know their server's schedule */
export function ResetTimes({ regions }: { regions: string[] }) {
  const now = useNow();
  const known = [...new Set(regions.map((region) => region.toLowerCase()))].filter(hasResetSchedule);
  const list = known.length ? known : ["us"];
  return (
    <section className="surface">
      <div className="surface-heading">
        <h2>Resets</h2>
        <CalendarClock size={16} className="secondary" aria-hidden />
      </div>
      <div className="reset-list">
        {list.map((region) => {
          const weekly = nextWeeklyReset(region, now)!;
          const daily = nextDailyReset(region, now)!;
          return (
            <div className="reset-region" key={region}>
              {list.length > 1 && <h3>{regionNames[region] ?? region.toUpperCase()}</h3>}
              <div className="reset-row">
                <span><Term term="weekly reset">Weekly reset</Term></span>
                <strong>{countdown(weekly - now)}</strong>
                <small>{new Date(weekly).toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" })}</small>
              </div>
              <div className="reset-row">
                <span><Term term="daily reset">Daily reset</Term></span>
                <strong>{countdown(daily - now)}</strong>
                <small>{new Date(daily).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</small>
              </div>
            </div>
          );
        })}
      </div>
      <p className="week-footnote">Times are shown in your computer's time zone</p>
    </section>
  );
}

const shortReward = (reward: string) => reward.replace(/^Mythic +/, "+").replace("Raid Finder", "LFR")
function VaultPips({ track, compact = false }: { track: VaultTrack; compact?: boolean }) {
  return (
    <div className="vault-pips" role="list" aria-label={`${track.label} rewards`}>
      {track.slots.map((slot, index) => (
        <div role="listitem" key={index} className={`vault-pip ${slot.unlocked ? "unlocked" : ""}`} aria-label={slot.unlocked ? `${ordinal(index + 1)} choice unlocked${slot.reward ? `, ${slot.reward}` : ""}` : `${ordinal(index + 1)} choice needs ${slot.threshold}`}>
          <span className="vault-pip-bar" />
          <small>{slot.unlocked ? (slot.reward ? (compact ? shortReward(slot.reward) : slot.reward) : "Unlocked") : `${slot.threshold}`}</small>
        </div>
      ))}
    </div>
  );
}

function trackHint(track: VaultTrack) {
  if (track.progress == null) return track.note ?? "No progress observed this week";
  if (track.remaining === 0) return "All choices unlocked";
  const index = track.slots.findIndex((slot) => !slot.unlocked) + 1;
  const [one, many] = activityWord[track.kind];
  return `${track.remaining} more ${track.remaining === 1 ? one : many} unlocks your ${ordinal(index)} choice`;
}

export function VaultTrackRow({ track, compact = false }: { track: VaultTrack; compact?: boolean }) {
  const max = track.slots.at(-1)?.threshold ?? 0;
  return (
    <div className={`vault-track ${compact ? "compact" : ""}`}>
      <div className="vault-track-label">
        <strong>{track.label}</strong>
        <span className={track.progress == null ? "muted" : ""}>{track.progress == null ? "Unknown" : `${Math.min(track.progress, max)} of ${max}`}</span>
      </div>
      <VaultPips track={track} compact={compact} />
      {!compact && <p className="vault-hint">{trackHint(track)}</p>}
    </div>
  );
}

function sourceSummary(tracks: VaultTrack[]) {
  if (tracks.some((track) => track.exact)) return { tone: "green" as const, label: "Live from the game" };
  if (tracks.some((track) => track.source)) return { tone: "amber" as const, label: "Estimated" };
  return { tone: "neutral" as const, label: "Not observed" };
}

/** One character's Great Vault and lockouts for the current reset week */
export function CharacterWeek({ character, action }: { character: Character; action?: ReactNode }) {
  const now = useNow();
  const tracks = useMemo(() => vaultTracks(character.weekly, character.region, now), [character.weekly, character.region, now]);
  const lockouts = weeklyLockouts(character.weekly, character.region, now);
  const runs = weeklyRuns(character.weekly, character.region, now);
  const summary = sourceSummary(tracks);
  const sources = [...new Set(tracks.flatMap((track) => (track.source ? [track.source] : [])))];
  return (
    <section className="surface">
      <div className="surface-heading">
        <div>
          <h2><Term term="great vault">Great Vault</Term> this week</h2>
          <p>{sources.length ? `From ${sources.join(" and ")}` : "Install the addon or connect Blizzard data to track it"}</p>
        </div>
        <Badge tone={summary.tone}>{summary.label}</Badge>
      </div>
      <div className="vault-tracks">
        {tracks.map((track) => <VaultTrackRow key={track.kind} track={track} />)}
      </div>
      {(lockouts.lockouts.length > 0 || runs.runs.length > 0) && (
        <div className="week-details">
          {lockouts.lockouts.length > 0 && (
            <div>
              <h3><Term term="lockout">Lockouts</Term></h3>
              <ul className="week-list">
                {lockouts.lockouts.map((lockout, index) => (
                  <li key={index}>
                    <span>{lockout.name}{lockout.difficulty ? ` · ${lockout.difficulty}` : ""}</span>
                    <strong>{lockout.killed}/{lockout.total}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {runs.runs.length > 0 && (
            <div>
              <h3>Keys this week</h3>
              <ul className="week-list">
                {[...runs.runs].sort((a, b) => b.level - a.level).slice(0, 8).map((run, index) => (
                  <li key={index}>
                    <span>{run.dungeon}</span>
                    <strong>+{run.level}{run.timed === false ? " · over time" : ""}</strong>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {tracks.some((track) => !track.exact && track.source) && (
        <div className="unknown-note">
          <CircleHelp />
          <p>Estimates follow this season's usual vault rules. Log in with the addon installed for the exact rewards</p>
        </div>
      )}
      {action}
    </section>
  );
}

function Sparkline({ points }: { points: Array<{ at: string; gold: number }> }) {
  if (points.length < 2) return null;
  const width = 240;
  const height = 48;
  const values = points.map((point) => point.gold);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const first = Date.parse(points[0]!.at);
  const span = Math.max(1, Date.parse(points.at(-1)!.at) - first);
  const path = points.map((point, index) => `${index ? "L" : "M"}${(((Date.parse(point.at) - first) / span) * width).toFixed(1)},${(height - 4 - ((point.gold - min) / Math.max(1, max - min)) * (height - 8)).toFixed(1)}`).join(" ");
  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`Price ranged from ${min.toLocaleString()} to ${max.toLocaleString()} gold`}>
      <path d={path} />
    </svg>
  );
}

export function TokenSurface() {
  const connections = useConnections();
  const region = connections.data?.blizzard.region ?? "us";
  const configured = connections.data?.blizzard.configured ?? false;
  const token = useQuery({ queryKey: ["wow-token", region], queryFn: () => api.wowToken(region), enabled: configured, refetchInterval: 20 * 60_000, retry: false });
  const data = token.data && token.data.configured ? token.data : null;
  const week = data?.history.filter((point) => Date.parse(point.at) >= Date.now() - 7 * 86_400_000) ?? [];
  const change = week.length > 1 ? week.at(-1)!.gold - week[0]!.gold : null;
  return (
    <section className="surface">
      <div className="surface-heading">
        <h2><Term term="wow token">WoW Token</Term></h2>
        <Coins size={16} className="secondary" aria-hidden />
      </div>
      {!configured ? (
        <div className="token-empty">
          <p>Connect Blizzard data to see the current token price for your region</p>
          <Link className="button button-secondary" to="/setup"><KeyRound />Connect Blizzard data</Link>
        </div>
      ) : token.isError ? (
        <p className="secondary small">{errorMessage(token.error)}</p>
      ) : !data ? (
        <p className="secondary small">Loading the current price…</p>
      ) : (
        <>
          <div className="token-price">
            <strong>{data.gold.toLocaleString()}</strong>
            <span>gold</span>
            {change != null && change !== 0 && <Badge tone={change > 0 ? "amber" : "green"}>{change > 0 ? "+" : ""}{change.toLocaleString()} this week</Badge>}
          </div>
          <Sparkline points={week} />
          <p className="week-footnote">{region.toUpperCase()} price from Blizzard · updated {new Date(data.updatedAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}{week.length < 2 ? " · history builds while the app is open" : ""}</p>
        </>
      )}
    </section>
  );
}

const statRows: Array<{ key: "crit" | "haste" | "mastery" | "versatility"; label: string }> = [
  { key: "crit", label: "Critical strike" },
  { key: "haste", label: "Haste" },
  { key: "mastery", label: "Mastery" },
  { key: "versatility", label: "Versatility" },
];
export function StatsSurface({ character }: { character: Character }) {
  const stats = character.stats;
  if (!stats) return null;
  const highest = Math.max(1, ...statRows.map((row) => stats[row.key] ?? 0));
  return (
    <section className="surface">
      <div className="surface-heading">
        <div>
          <h2>Stats</h2>
          <p>From {stats.source}{stats.observedAt ? ` · ${new Date(stats.observedAt).toLocaleDateString()}` : ""}</p>
        </div>
        <Sun size={16} className="secondary" aria-hidden />
      </div>
      <div className="metric-strip stat-primary">
        <div><small>{stats.primary?.name ?? "Main stat"}</small><strong>{stats.primary ? stats.primary.value.toLocaleString() : "Unknown"}</strong></div>
        <div><small>Stamina</small><strong>{stats.stamina?.toLocaleString() ?? "Unknown"}</strong></div>
        <div><small>Health</small><strong>{stats.health?.toLocaleString() ?? "Unknown"}</strong></div>
      </div>
      <h3 className="stat-heading"><Term term="secondary stats">Secondary stats</Term></h3>
      <div className="stat-bars">
        {statRows.map((row) => {
          const value = stats[row.key];
          // Mastery is rating times a class-specific scale, so its sheet percentage can't be mapped back to rating
          const reading = value == null || row.key === "mastery" ? null : diminishing(Math.max(0, stats.ratingBonus?.[row.key] ?? value));
          return (
            <div className="stat-row" key={row.key}>
              <div className="stat-bar">
                <span>{row.label}</span>
                {row.key === "mastery" ? <div className="stat-track"><span style={{ width: `${((value ?? 0) / highest) * 100}%` }} /></div> : <DrTrack raw={reading?.raw ?? 0} />}
                <strong>{value == null ? "Unknown" : `${value.toFixed(1)}%`}</strong>
              </div>
              {reading && (
                <small className="stat-hint">
                  {reading.capped ? "At the cap, more rating adds nothing" : reading.nextValue === 1 ? "Full value, the next point isn't reduced" : `The next point keeps ${Math.round(reading.nextValue * 100)}% of its value`}
                  {reading.lost >= 0.05 ? ` · ${reading.lost.toFixed(1)}% lost so far` : ""}
                </small>
              )}
            </div>
          );
        })}
      </div>
      <h3 className="stat-heading dr-heading"><Term term="diminishing returns">Diminishing returns brackets</Term></h3>
      <p className="dr-intro">As your stat rating increases past the baseline, penalties apply progressively to the rating points above each threshold</p>
      <ul className="dr-brackets">
        {drBrackets.map((bracket, index) => (
          <li key={index} style={{ "--dr": bracket.penalty } as React.CSSProperties}>
            <i aria-hidden />
            <span>{bracket.from}% – {bracket.to}%</span>
            <strong>{bracket.penalty === 0 ? "No reduction" : `${Math.round(bracket.penalty * 100)}% penalty`}</strong>
          </li>
        ))}
      </ul>
      <p className="week-footnote">The hard cap from gear rating is {drBrackets.at(-1)!.to}%. Position is worked out from the percentages on your character sheet for critical strike, haste, and versatility, so it is an estimate until the game reports the rating part</p>
    </section>
  );
}

/** Six bracket segments sized by their raw width; each fills as the stat moves through it and dims as the penalty grows */
function DrTrack({ raw }: { raw: number }) {
  const shown = 78;
  return (
    <div className="dr-track" role="img" aria-label={`${raw.toFixed(1)}% before diminishing returns`}>
      {drBrackets.map((bracket, index) => {
        const width = Math.min(bracket.to, shown) - bracket.from;
        if (width <= 0) return null;
        const filled = Math.max(0, Math.min(1, (raw - bracket.from) / (bracket.to - bracket.from)));
        return (
          <span key={index} className="dr-segment" style={{ flexGrow: width, "--dr": bracket.penalty } as React.CSSProperties}>
            <span style={{ width: `${filled * 100}%` }} />
          </span>
        );
      })}
    </div>
  );
}

/** Refreshes every live character one at a time so provider rate limits are respected */
export function useRefreshAll(characters: Character[]) {
  const client = useQueryClient();
  const [state, setState] = useState<{ done: number; total: number } | null>(null);
  async function run() {
    const live = characters.filter((character) => !character.demo && !character.archived);
    if (!live.length) return;
    setState({ done: 0, total: live.length });
    let failed = 0;
    for (const [index, character] of live.entries()) {
      try { await api.refreshCharacter({ id: character.id }); } catch { failed += 1; }
      setState({ done: index + 1, total: live.length });
    }
    setState(null);
    await client.invalidateQueries();
    notify(failed ? `Refreshed ${live.length - failed} of ${live.length} characters` : "All characters refreshed");
  }
  return { run, state };
}

export function WeekPage({ characters, identity, onOpen }: { characters: Character[]; identity: (character: Character) => ReactNode; onOpen: (character: Character) => void }) {
  const now = useNow();
  const live = characters.filter((character) => !character.archived);
  const refresh = useRefreshAll(live);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>This week</h1>
          <p>Great Vault progress, lockouts, and resets for every character in one place</p>
        </div>
        <Button disabled={!!refresh.state} onClick={() => void refresh.run()}>
          <RefreshCw className={refresh.state ? "spin" : ""} />
          {refresh.state ? `Refreshing ${refresh.state.done} of ${refresh.state.total}…` : "Refresh all characters"}
        </Button>
      </div>
      <div className="week-top">
        <ResetTimes regions={live.map((character) => character.region)} />
        <TokenSurface />
      </div>
      <div className="surface-heading week-table-heading">
        <div>
          <h2><Term term="great vault">Great Vault</Term> by character</h2>
          <p>Each bar fills as you clear content. Every filled bar is one more reward to choose from after the reset</p>
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table week-table">
          <thead>
            <tr>
              <th>Character</th>
              <th>Raids</th>
              <th>Dungeons</th>
              <th>Delves & world</th>
              <th>Source</th>
            </tr>
          </thead>
          <tbody>
            {live.map((character) => {
              const tracks = vaultTracks(character.weekly, character.region, now);
              const summary = sourceSummary(tracks);
              return (
                <tr key={character.id} className="selectable" tabIndex={0} aria-label={`Open ${character.name} weekly progress`} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onOpen(character)}}} onClick={() => onOpen(character)}>
                  <td>{identity(character)}</td>
                  {tracks.map((track) => (
                    <td key={track.kind}><VaultTrackRow track={track} compact /></td>
                  ))}
                  <td><Badge tone={summary.tone}>{character.demo ? "Demo" : summary.label}</Badge></td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!live.length && <div className="inline-empty">Add a character to track their week</div>}
      </div>
      <div className="roster-footnote">
        <CircleHelp />
        <p>
          The addon reads the in-game Great Vault directly. Without it, dungeons are estimated from Raider.IO and raids from Blizzard's raid history
          <br />Delve progress is only visible through the addon
        </p>
      </div>
    </>
  );
}
