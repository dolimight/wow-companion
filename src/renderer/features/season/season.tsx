import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Gem, LineChart, Minus, Plus, Sparkles, Users } from "lucide-react";
import { api } from "../../lib/client";
import { errorMessage } from "../../lib/notify";
import { Badge, Button } from "../../components/ui/primitives";
import { Term } from "../../components/Term";
import type { Character } from "../../../shared/domain";
import { comfortableLevel, keyLevels, overallVerdict, seasonDungeons, tonightKeys, verdictLabels, type KeyVerdict } from "../../../shared/key-range";
import { crestPlan } from "../../../shared/crest-plan";
import { currencyName } from "../../../shared/currency-display";
import { CurrencyLabel } from "../../components/CurrencyLabel";
import { dungeonVaultPlan } from "../../../shared/vault-plan";
import { vaultTracks, weeklyRuns } from "../../../shared/weekly";
import type { SeasonRuleset } from "../../../shared/season-rules";
import type { TimelinePoint } from "../../../shared/timeline";
import "./season.css";
import { Card } from "../../components/ui/card";

const affixRegions = ["us", "eu", "kr", "tw"] as const;
type AffixRegion = (typeof affixRegions)[number];
const affixRegion = (region: string): AffixRegion => (affixRegions as readonly string[]).includes(region.toLowerCase()) ? (region.toLowerCase() as AffixRegion) : "us";

export function useAffixes(region: string) {
  const value = affixRegion(region);
  return useQuery({ queryKey: ["weekly-affixes", value], queryFn: () => api.weeklyAffixes(value), staleTime: 60 * 60_000, retry: false });
}

/** This week's Mythic+ affixes, each with the game's own description on hover */
export function AffixList({ region }: { region: string }) {
  const affixes = useAffixes(region);
  if (affixes.isError) return <p className="secondary small">{errorMessage(affixes.error)}</p>;
  if (!affixes.data) return <p className="secondary small">Loading this week's affixes…</p>;
  return (
    <ul className="affix-list">
      {affixes.data.affixes.map((affix) => (
        <li key={affix.id} title={affix.description ?? undefined}>
          <strong>{affix.name}</strong>
          {affix.description && <span>{affix.description}</span>}
        </li>
      ))}
    </ul>
  );
}

export function AffixesSurface({ region }: { region: string }) {
  return (
    <Card as="section" >
      <div className="surface-heading">
        <div>
          <h2>This week's <Term term="affix">affixes</Term></h2>
          <p>Mythic+ modifiers for {affixRegion(region).toUpperCase()} until the weekly reset · from Raider.IO</p>
        </div>
        <Sparkles size={16} className="secondary" aria-hidden />
      </div>
      <AffixList region={region} />
    </Card>
  );
}

/** A short run list for tonight, built from season bests, with the week's affixes beside it */
export function TonightKeys({ character, action }: { character: Character; action?: ReactNode }) {
  const { dungeons } = useMemo(() => seasonDungeons(character), [character]);
  const picks = useMemo(() => tonightKeys(dungeons), [dungeons]);
  return (
    <Card as="section" aria-labelledby="tonight-keys-title">
      <div className="surface-heading">
        <div>
          <h2 id="tonight-keys-title">Keys to run tonight</h2>
          <p>Your lowest dungeons first, each at a level your history says you can time</p>
        </div>
        {action}
      </div>
      <div className="tonight-keys">
        <ol className="tonight-key-list">
          {picks.map((pick) => (
            <li key={pick.dungeon} className={`kv-${pick.verdict}`}>
              <span className="tonight-key-level">+{pick.level}</span>
              <div>
                <strong>{pick.dungeon}</strong>
                <small>{pick.reason}</small>
              </div>
            </li>
          ))}
          {!picks.length && <li className="kv-nodata"><div><strong>No suggestion yet</strong><small>Time a key so there is a level to build from</small></div></li>}
        </ol>
        <div className="tonight-affixes">
          <h3><Term term="affix">Affixes</Term> this week</h3>
          <AffixList region={character.region} />
        </div>
      </div>
    </Card>
  );
}

/** Steps that fill or raise each Mythic+ vault choice, aimed at the level the character can time */
export function VaultPlan({ character, now }: { character: Character; now: number }) {
  const track = vaultTracks(character.weekly, character.region, now).find((entry) => entry.kind === "dungeon");
  const runs = weeklyRuns(character.weekly, character.region, now);
  const target = comfortableLevel(seasonDungeons(character).dungeons);
  const steps = track ? dungeonVaultPlan(track, runs.runs.map((run) => run.level), target) : [];
  if (!steps.length) return null;
  return (
    <div className="vault-plan">
      <h3>Dungeon vault plan{target != null ? ` · aiming at +${target}` : ""}</h3>
      <ul>
        {steps.map((step) => <li key={step.slot} className={step.unlocked ? "done" : ""}>{step.text}</li>)}
      </ul>
      <p className="week-footnote">{target != null ? `+${target} is the highest level you've timed or earned in most dungeons. ` : ""}A choice's reward is the level of your Nth best key this week. Reward item levels stay Unknown until this season's vault table is verified</p>
    </div>
  );
}

/** Crests held, crests needed, and the equipped upgrades that buy the most item level per crest */
export function CrestBudget({ character, tracks }: { character: Character; tracks: SeasonRuleset["upgradeTracks"] }) {
  const currencies = character.progressionResources?.currencies ?? null;
  const plan = useMemo(() => crestPlan(character.gear, tracks, currencies), [character.gear, tracks, currencies]);
  if (!plan.steps.length && !plan.totals.length) return null;
  const affordable = new Set(plan.affordable.map((step) => step.slot));
  return (
    <Card as="section" className="crest-budget" aria-labelledby="crest-title">
      <div className="surface-heading">
        <div>
          <h2 id="crest-title"><Term term="crest">Crest</Term> budget</h2>
          <p>{currencies ? `Balances from the addon${character.progressionResources?.observedAt ? ` · ${new Date(character.progressionResources.observedAt).toLocaleDateString()}` : ""}` : "Balances unknown · log in with the addon to read them"}</p>
        </div>
        <Gem size={16} className="secondary" aria-hidden />
      </div>
      {plan.totals.length > 0 && (
        <dl className="crest-totals">
          {plan.totals.map((total) => (
            <Card size="sm" key={total.currencyId}>
              <dt><CurrencyLabel id={total.currencyId} /></dt>
              <dd>
                <strong>{total.balance == null ? "Unknown" : total.balance.toLocaleString()}</strong> held
                <small>{total.full ? `${total.next.toLocaleString()} for every next rank · ${total.full.toLocaleString()} to finish every track` : "None of your equipped gear upgrades with these"}</small>
              </dd>
            </Card>
          ))}
        </dl>
      )}
      <h3 className="crest-heading">Best value next upgrades</h3>
      <ol className="crest-steps">
        {plan.steps.slice(0, 8).map((step) => (
          <li key={step.slot} className={affordable.has(step.slot) ? "affordable" : ""}>
            <div>
              <strong>{step.name}</strong>
              <small>{step.track} · {step.fromLevel} → {step.toLevel}</small>
            </div>
            <span>{step.crestId ? <CurrencyLabel id={step.crestId} amount={step.crests} /> : "No crest"}{step.gold ? ` · ${step.gold.toLocaleString()} gold` : ""}</span>
            {/* Only judge affordability against a crest balance the addon actually read */}
            {currencies && (!step.crestId || plan.totals.find((total) => total.currencyId === step.crestId)?.balance != null) && <Badge tone={affordable.has(step.slot) ? "green" : "neutral"}>{affordable.has(step.slot) ? "Affordable now" : "Needs more"}</Badge>}
          </li>
        ))}
      </ol>
      <p className="week-footnote">Ranked by item levels per crest. Base prices from the season rules; a rank you've reached before on that slot can cost less in game{plan.unknownSlots.length ? ` · ${plan.unknownSlots.length} item${plan.unknownSlots.length === 1 ? " has" : "s have"} no known upgrade track` : ""}</p>
    </Card>
  );
}

function linePath(points: Array<{ x: number; y: number }>) {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(" ");
}
function SeriesChart({ points, value, label, format }: { points: TimelinePoint[]; value: (point: TimelinePoint) => number | null; label: string; format: (value: number) => string }) {
  const series = points.flatMap((point) => { const v = value(point); return v == null ? [] : [{ at: Date.parse(point.at), v }]; });
  if (!series.length) return <div className="timeline-chart empty"><h3>{label}</h3><p className="secondary small">Not observed yet</p></div>;
  const width = 560, height = 140, pad = 8;
  const first = series[0]!.at, span = Math.max(1, series.at(-1)!.at - first);
  const min = Math.min(...series.map((entry) => entry.v)), max = Math.max(...series.map((entry) => entry.v));
  const range = Math.max(1, max - min);
  const xy = series.map((entry) => ({ x: series.length === 1 ? width / 2 : pad + ((entry.at - first) / span) * (width - pad * 2), y: height - pad - ((entry.v - min) / range) * (height - pad * 2) }));
  const latest = series.at(-1)!, start = series[0]!;
  const change = latest.v - start.v;
  return (
    <div className="timeline-chart">
      <div className="timeline-chart-heading">
        <h3>{label}</h3>
        <strong>{format(latest.v)}</strong>
        {series.length > 1 && change !== 0 && <Badge tone={change > 0 ? "green" : "amber"}>{change > 0 ? "+" : ""}{format(change)} since {new Date(start.at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</Badge>}
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${label} from ${format(start.v)} to ${format(latest.v)}`}>
        <path className="timeline-line" d={linePath(xy)} />
        {xy.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={series.length > 40 ? 0 : 3}><title>{`${new Date(series[index]!.at).toLocaleString()} · ${format(series[index]!.v)}`}</title></circle>)}
      </svg>
      <div className="timeline-axis"><span>{new Date(start.at).toLocaleDateString()}</span><span>{format(min)}–{format(max)}</span><span>{new Date(latest.at).toLocaleDateString()}</span></div>
    </div>
  );
}

/** Mythic+ score and item level over time, from every observation the app has recorded on this computer */
export function SeasonTimeline({ character }: { character: Character }) {
  const timeline = useQuery({ queryKey: ["timeline", character.id], queryFn: () => api.characterTimeline(character.id) });
  const season = character.ratings.mythicPlus?.seasonId ?? null;
  const points = (timeline.data?.points ?? []).filter((point) => season == null || point.season == null || point.season === season);
  return (
    <Card as="section" className="season-timeline" aria-labelledby="timeline-title">
      <div className="surface-heading">
        <div>
          <h2 id="timeline-title">Season timeline</h2>
          <p>Recorded each time the app sees a change · {points.length} observation{points.length === 1 ? "" : "s"}</p>
        </div>
        <LineChart size={16} className="secondary" aria-hidden />
      </div>
      {timeline.isError ? <p className="secondary small">{errorMessage(timeline.error)}</p> : (
        <div className="timeline-grid">
          <SeriesChart points={points} value={(point) => point.score} label="Mythic+ score" format={(value) => Math.round(value).toLocaleString()} />
          <SeriesChart points={points} value={(point) => point.itemLevel} label="Item level" format={(value) => value.toFixed(1).replace(/\.0$/, "")} />
        </div>
      )}
      {points.length < 2 && <div className="unknown-note"><CircleHelp /><p>The timeline starts with this version of the app and grows as your characters sync, so earlier history isn't shown</p></div>}
    </Card>
  );
}

const verdictTone: Record<KeyVerdict, "green" | "amber" | "neutral"> = { timed: "green", reach: "green", stretch: "amber", notyet: "neutral", nodata: "neutral" };
/** Every character at one key level, plus who still has Great Vault choices to fill this week */
export function AltReadiness({ characters, identity, now }: { characters: Character[]; identity: (character: Character) => ReactNode; now: number }) {
  const rows = useMemo(() => characters.map((character) => ({ character, dungeons: seasonDungeons(character).dungeons })), [characters]);
  const [level, setLevel] = useState(() => {
    const comforts = rows.map((row) => comfortableLevel(row.dungeons)).filter((value): value is number => value != null);
    return comforts.length ? Math.max(...comforts) : 10;
  });
  return (
    <Card as="section" className="alt-readiness" aria-labelledby="alt-title">
      <div className="surface-heading">
        <div>
          <h2 id="alt-title">Alts at a key level</h2>
          <p>Who can run +{level}, judged from each character's own season bests, and who still has vault choices open</p>
        </div>
        <div className="alt-stepper">
          <Button variant="icon" aria-label="Lower key level" disabled={level <= keyLevels.min} onClick={() => setLevel(level - 1)}><Minus size={16} /></Button>
          <strong aria-live="polite">+{level}</strong>
          <Button variant="icon" aria-label="Higher key level" disabled={level >= keyLevels.max} onClick={() => setLevel(level + 1)}><Plus size={16} /></Button>
          <Users size={16} className="secondary" aria-hidden />
        </div>
      </div>
      <div className="table-wrap">
        <table className="data-table">
          <thead><tr><th>Character</th><th>At +{level}</th><th>Dungeons timed at +{level}</th><th>Vault still open</th></tr></thead>
          <tbody>
            {rows.map(({ character, dungeons }) => {
              const result = overallVerdict(dungeons, level);
              const open = vaultTracks(character.weekly, character.region, now).filter((track) => track.progress != null && (track.remaining ?? 0) > 0);
              return (
                <tr key={character.id}>
                  <td>{identity(character)}</td>
                  <td><Badge tone={verdictTone[result.verdict]}>{verdictLabels[result.verdict]}</Badge></td>
                  <td>{dungeons.length ? `${result.counts.timed} of ${dungeons.length}` : "Unknown"}</td>
                  <td>{open.length ? open.map((track) => `${track.label}: ${track.remaining} more`).join(" · ") : vaultTracks(character.weekly, character.region, now).some((track) => track.progress != null) ? "All filled" : "Unknown"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!rows.length && <div className="inline-empty">Add a character to compare alts</div>}
      </div>
    </Card>
  );
}
