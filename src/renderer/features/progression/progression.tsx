import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Check, CircleHelp, ExternalLink, Info, RefreshCw } from "lucide-react";
import type { Activity, Character, GearSlot } from "../../../shared/domain";
import type { ItemVariant } from "../../../shared/gear-variants";
import type { ProgressionResult } from "../../../shared/progression-evaluation";
import {formatCurrency} from "../../../shared/currency-display";
import { defaultContentPreferences, type ContentPreferences } from "../../../shared/season-rules";
import { AppSelect } from "../../components/AppSelect";
import { Badge, Button, Field, Sheet } from "../../components/ui/primitives";
import { Toggle } from "../../components/ui/toggle";
import { api } from "../../lib/client";
import { errorMessage, notify } from "../../lib/notify";
import "./progression.css";

type ViewKey = "equipped" | "ownedUpgrade" | "contentScoped" | "legalMaximum" | "affordable";
const views: Array<{ value: ViewKey; label: string; description: string }> = [
  {
    value: "equipped",
    label: "Equipped gear",
    description: "Your recorded equipment, with its original observation time",
  },
  {
    value: "ownedUpgrade",
    label: "Upgrade gear you own",
    description: "The highest legal configuration using upgrades of your recorded items",
  },
  {
    value: "contentScoped",
    label: "Your content ceiling",
    description: "Equipment available through the activities and acquisition methods you choose",
  },
  {
    value: "legalMaximum",
    label: "Season legal maximum",
    description: "The highest legal set available now under a validated seasonal ruleset",
  },
  {
    value: "affordable",
    label: "Affordable now",
    description: "A legal upgrade configuration within your observed currency balances",
  },
];
const activities: Array<{ value: Activity; label: string }> = [
  { value: "mythicPlus", label: "Mythic+" },
  { value: "raiding", label: "Raiding" },
  { value: "pvp", label: "PvP" },
];
const slotNames: Record<GearSlot, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulder",
  back: "Cloak",
  chest: "Chest",
  wrist: "Wrist",
  hands: "Hands",
  waist: "Waist",
  legs: "Legs",
  feet: "Feet",
  finger1: "Ring 1",
  finger2: "Ring 2",
  trinket1: "Trinket 1",
  trinket2: "Trinket 2",
  mainHand: "Main hand",
  offHand: "Off hand",
};
const difficulties = [
  { value: "normal", label: "Normal" },
  { value: "heroic", label: "Heroic" },
  { value: "mythic", label: "Mythic" },
];
const methods = [
  { value: "dungeon", label: "Dungeon drops" },
  { value: "raid", label: "Raid drops" },
  { value: "vault", label: "Great Vault" },
  { value: "world", label: "World rewards" },
  { value: "vendor", label: "Vendors" },
];
const number = (value: number | null | undefined) => (value == null ? "Unknown" : value.toFixed(1));
const sentence = (value: string) => value.replace(/\.+\s*$/, "");
const observed = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })
    : "Observation time unknown";
const date = (value: string | null | undefined) =>
  value && Number.isFinite(Date.parse(value))
    ? new Date(value).toLocaleDateString(undefined, { dateStyle: "medium" })
    : "Unknown";

export function useProgression(characterId: string, activity: Activity) {
  return useQuery({
    queryKey: ["progression", characterId, activity],
    queryFn: () => api.getProgression({ characterId, activity }),
  });
}

export function ProgressionSummary({
  character,
  activity,
}: {
  character: Character;
  activity: Activity;
}) {
  const result = useProgression(character.id, activity);
  const maximum = result.data?.legalMaximum;
  return (
    <div className="progression-summary" aria-label="Gear progression summary">
      <div>
        <span>Validated season ceiling</span>
        <strong>{number(maximum?.itemLevel)}</strong>
      </div>
      <p>
        {maximum?.status === "supported" && maximum.itemLevel != null && character.itemLevel != null
          ? `${number(Math.max(0, maximum.itemLevel - character.itemLevel))} item levels to the legal maximum`
          : sentence(
              maximum?.reasons[0] ??
                (result.isError
                  ? "Progression could not be loaded"
                  : "Seasonal rules are checked before a maximum is shown"),
            )}
      </p>
      <Link
        className="button button-quiet"
        to="/characters/$characterId/$section"
        params={{ characterId: character.id, section: "progression" }}
      >
        See progression <ArrowRight size={14} />
      </Link>
    </div>
  );
}

function SourceButton({ url, children }: { url: string; children: ReactNode }) {
  return (
    <Button
      variant="quiet"
      className="progression-source-link"
      onClick={() => void api.openExternal(url).catch((error) => notify(errorMessage(error)))}
    >
      {children}
      <ExternalLink size={12} />
    </Button>
  );
}

function ItemFacts({ item, label }: { item: ItemVariant | null; label: string }) {
  if (!item)
    return (
      <div className="progression-evidence-item">
        <h3>{label}</h3>
        <p className="secondary small">No supported item recorded</p>
      </div>
    );
  return (
    <div className="progression-evidence-item">
      <h3>{label}</h3>
      <strong>{item.name}</strong>
      <dl>
        <div>
          <dt>Item level</dt>
          <dd>{number(item.itemLevel)}</dd>
        </div>
        <div>
          <dt>Observed</dt>
          <dd>{observed(item.observedAt)}</dd>
        </div>
        <div>
          <dt>Coverage</dt>
          <dd>
            {item.coverage === "complete"
              ? "Recorded"
              : item.coverage === "partial"
                ? "Partial observation"
                : "Unknown"}
          </dd>
        </div>
        <div>
          <dt>Upgrade track</dt>
          <dd>
            {item.upgradeTrackId ?? "Unknown"}
            {item.upgradeRank != null ? ` · Rank ${item.upgradeRank}` : ""}
          </dd>
        </div>
        <div>
          <dt>Source</dt>
          <dd>{item.source?.name ?? "Source unknown"}</dd>
        </div>
        {item.source?.difficulty && (
          <div>
            <dt>Difficulty</dt>
            <dd>{item.source.difficulty}</dd>
          </div>
        )}
      </dl>
      {item.source?.url && <SourceButton url={item.source.url}>Open item source</SourceButton>}
      {item.currencyCost?.length ? (
        <ul className="progression-reasons">
          {item.currencyCost.map((cost) => (
            <li key={cost.currencyId}>
              {formatCurrency(cost.currencyId,cost.amount)}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function WhyPanel({
  result,
  viewKey,
  slot,
  onClose,
}: {
  result: ProgressionResult;
  viewKey: ViewKey;
  slot: GearSlot | null;
  onClose: () => void;
}) {
  const view = result[viewKey];
  const details = result.slots.find((row) => row.slot === slot);
  const candidate = details ? (viewKey === "equipped" ? details.current : details[viewKey]) : null;
  const refs = details?.evidenceRefs ?? view.evidenceRefs;
  return (
    <Sheet
      open
      onOpenChange={(open) => !open && onClose()}
      title={
        slot ? `Why this ${slotNames[slot].toLowerCase()} result?` : "Why this progression result?"
      }
      description="The recorded items, rules, and remaining unknowns behind this view"
    >
      <div className="progression-evidence">
        <Badge tone={view.status === "supported" ? "green" : "amber"}>
          {view.status === "supported"
            ? "Supported result"
            : view.status === "partial"
              ? "Partial result"
              : "Unavailable"}
        </Badge>
        <ul className="progression-reasons">
          {[...new Set([...(details?.reasons ?? []), ...view.reasons])].map((reason) => (
            <li key={reason}>{sentence(reason)}</li>
          ))}
        </ul>
        {details && (
          <>
            <ItemFacts item={details.current} label="Currently equipped" />
            {viewKey !== "equipped" && (
              <ItemFacts
                item={candidate}
                label={views.find((option) => option.value === viewKey)!.label}
              />
            )}
          </>
        )}
        {result.ruleset ? (
          <section>
            <h3>{result.ruleset.name}</h3>
            <p className="secondary small">
              Effective {date(result.ruleset.effectiveFrom)}
              {result.ruleset.effectiveUntil
                ? ` through ${date(result.ruleset.effectiveUntil)}`
                : ""}
            </p>
            {result.ruleset.sources.map((source) => (
              <div className="progression-source" key={source.url}>
                <SourceButton url={source.url}>{source.title}</SourceButton>
                <small>Checked {date(source.checkedAt)}</small>
              </div>
            ))}
          </section>
        ) : (
          <p className="secondary small">
            No validated ruleset applies to this character's recorded build and season
          </p>
        )}
        {result.assumptions.length > 0 && (
          <section>
            <h3>Assumptions</h3>
            <ul className="progression-reasons">
              {result.assumptions.map((reason) => (
                <li key={reason}>{sentence(reason)}</li>
              ))}
            </ul>
          </section>
        )}
        {result.unresolved.length > 0 && (
          <section>
            <h3>Still unknown</h3>
            <ul className="progression-reasons">
              {result.unresolved.map((reason) => (
                <li key={reason}>{sentence(reason)}</li>
              ))}
            </ul>
          </section>
        )}
        <p className="secondary small">
          {refs.length
            ? `Based on ${refs.length} recorded evidence reference${refs.length === 1 ? "" : "s"}`
            : "No supporting observation references are available"}
        </p>
      </div>
    </Sheet>
  );
}

export function ProgressionPage({
  character,
  activity,
  onActivityChange,
}: {
  character: Character;
  activity: Activity;
  onActivityChange: (activity: Activity) => void;
}) {
  const query = useProgression(character.id, activity);
  const preferences = useQuery({
    queryKey: ["content-preferences", character.id, activity],
    queryFn: () => api.getContentPreferences({ characterId: character.id, activity }),
  });
  const [viewKey, setViewKey] = useState<ViewKey>("ownedUpgrade");
  const [draft, setDraft] = useState<ContentPreferences | null>(null);
  const [why, setWhy] = useState<{ slot: GearSlot | null } | null>(null);
  const [target, setTarget] = useState(character.targetItemLevel?.toString() ?? "");
  const client = useQueryClient();
  useEffect(() => {
    setDraft(null);
    setWhy(null);
  }, [character.id, activity]);
  useEffect(
    () => setTarget(character.targetItemLevel?.toString() ?? ""),
    [character.id, character.targetItemLevel],
  );
  const selectedPreferences = draft ?? preferences.data ?? defaultContentPreferences(activity);
  const save = useMutation({
    mutationFn: api.saveContentPreferences,
    onSuccess: (saved, input) => {
      client.setQueryData(["content-preferences", input.characterId, input.activity], saved);
      void client.invalidateQueries({
        queryKey: ["progression", input.characterId, input.activity],
      });
      setDraft(null);
      notify("Content preferences saved");
    },
    onError: (error) => notify(errorMessage(error)),
  });
  const goal = useMutation({
    mutationFn: api.updateCharacter,
    onSuccess: () => {
      void client.invalidateQueries();
      notify("Personal target saved");
    },
    onError: (error) => notify(errorMessage(error)),
  });
  const result = query.data;
  const view = result?.[viewKey];
  const selection = views.find((option) => option.value === viewKey)!;
  function setPreference<K extends keyof ContentPreferences>(key: K, value: ContentPreferences[K]) {
    setDraft({ ...selectedPreferences, [key]: value });
  }
  function toggleList(
    key: "activities" | "difficulties" | "excludedMethods",
    value: string,
    pressed: boolean,
  ) {
    const next = pressed
      ? [...new Set([...selectedPreferences[key], value])]
      : selectedPreferences[key].filter((entry) => entry !== value);
    if (key === "activities") setPreference("activities", next as Activity[]);
    else setPreference(key, next);
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Gear progression</h1>
          <p>
            {character.name} · {character.specName !== "Unknown" ? `${character.specName} ` : ""}
            {character.className} · Item-level goals and their requirements
          </p>
        </div>
        <Button
          aria-label="Refresh progression"
          onClick={() => void query.refetch()}
          disabled={query.isFetching}
        >
          <RefreshCw size={15} />
          Refresh
        </Button>
      </div>
      <div className="progression-toolbar">
        <AppSelect
          aria-label="Progression activity"
          value={activity}
          options={activities}
          onValueChange={(value) => onActivityChange(value as Activity)}
        />
        <AppSelect
          aria-label="Progression view"
          value={viewKey}
          options={views}
          onValueChange={(value) => setViewKey(value as ViewKey)}
        />
      </div>
      {query.isError ? (
        <div className="surface progression-error" role="alert">
          <p>{sentence(errorMessage(query.error))}</p>
          <Button onClick={() => void query.refetch()}>Try again</Button>
        </div>
      ) : query.isPending ? (
        <div className="loading-surface" role="status">
          Checking progression and seasonal rules…
        </div>
      ) : result && view ? (
        <>
          <div className="progression-result-heading">
            <div>
              <h2>{selection.label}</h2>
              <p>{selection.description}</p>
            </div>
            <div className="progression-result-value">
              <strong>{number(view.itemLevel)}</strong>
              <Badge tone={view.status === "supported" ? "green" : "amber"}>
                {view.status === "supported"
                  ? "Validated"
                  : view.status === "partial"
                    ? "Partial"
                    : "Unavailable"}
              </Badge>
            </div>
          </div>
          {view.status !== "supported" && (
            <div className="progression-notice" role="status">
              <CircleHelp size={17} />
              <div>
                <p>{sentence(view.reasons[0] ?? "Some requirements are unknown")}</p>
                {view.bestKnownItemLevel != null && (
                  <small>
                    Best known configuration: {number(view.bestKnownItemLevel)} · This is not a
                    verified ceiling
                  </small>
                )}
              </div>
              <Button variant="quiet" onClick={() => setWhy({ slot: null })}>
                Why this?
              </Button>
            </div>
          )}
          {result.seasonReference&&<details className="surface progression-season-reference"><summary>Installed-client seasonal reference · {result.seasonReference.candidateCount.toLocaleString()} item variants</summary><p className="secondary small">Build-specific base tracks and costs · Personal vendor quotes take precedence over undiscounted prices</p><div className="table-wrap"><table className="data-table"><thead><tr><th>Track</th><th>Ranks</th><th>Base cost per rank</th></tr></thead><tbody>{result.seasonReference.tracks.map(track=><tr key={track.id}><td>{track.name}</td><td>{track.ranks[0]?.itemLevel}–{track.ranks.at(-1)?.itemLevel}</td><td>{track.ranks[1]?.cost?.map(cost=>formatCurrency(cost.currencyId,cost.amount)).join(' + ')??'Unknown'}</td></tr>)}</tbody></table></div><ul className="secondary small">{result.seasonReference.limitations.map(reason=><li key={reason}>{reason}</li>)}</ul></details>}
          <div className="progression-layout">
            <section className="progression-slots" aria-label="Per-slot progression">
              <div className="surface-heading">
                <div>
                  <h2>Where your upgrades come from</h2>
                  <p>Recorded gear and supported options for each slot</p>
                </div>
                <Button variant="quiet" onClick={() => setWhy({ slot: null })}>
                  <Info size={14} />
                  View evidence
                </Button>
              </div>
              <div className="table-wrap">
                <table className="data-table progression-table">
                  <thead>
                    <tr>
                      <th scope="col">Slot</th>
                      <th scope="col">Equipped</th>
                      <th scope="col">
                        {view.status === "supported"
                          ? selection.label
                          : viewKey === "equipped"
                            ? "Recorded level"
                            : "Known option"}
                      </th>
                      <th scope="col">Gap</th>
                      <th scope="col">
                        <span className="sr-only">Explanation</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.slots.map((row) => {
                      const candidate = viewKey === "equipped" ? row.current : row[viewKey];
                      const gap =
                        row.current?.itemLevel != null && candidate?.itemLevel != null
                          ? Math.max(0, candidate.itemLevel - row.current.itemLevel)
                          : null;
                      return (
                        <tr key={row.slot}>
                          <th scope="row">{slotNames[row.slot]}</th>
                          <td>
                            <strong className="progression-item-name" data-unknown={!row.current||undefined}>
                              {row.current?.name ?? "Not observed"}
                            </strong>
                            <small>{number(row.current?.itemLevel)}</small>
                          </td>
                          <td>
                            <strong className="progression-item-name" data-unknown={!candidate||undefined}>
                              {candidate?.name ?? "No supported option"}
                            </strong>
                            <small>
                              {candidate ? number(candidate.itemLevel) : "Unknown"}
                              {candidate?.upgradeTrackId ? ` · ${candidate.upgradeTrackId}` : ""}
                              {candidate?.upgradeRank != null ? ` ${candidate.upgradeRank}` : ""}
                            </small>
                            {candidate?.source?.name && <small>{candidate.source.name}</small>}
                          </td>
                          <td className="progression-gap">
                            {gap == null ? (
                              "Unknown"
                            ) : gap === 0 ? (
                              <span className="progression-matched">
                                <Check size={13} />
                                Same level
                              </span>
                            ) : (
                              `+${number(gap)}`
                            )}
                          </td>
                          <td>
                            <Button
                              variant="quiet"
                              aria-label={`Explain ${slotNames[row.slot].toLowerCase()} progression`}
                              onClick={() => setWhy({ slot: row.slot })}
                            >
                              Why?
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="progression-settings">
              <section className="surface">
                <h2>Your content</h2>
                <p className="secondary small">
                  These choices affect your content ceiling, keeping the season legal maximum
                  separate
                </p>
                <fieldset>
                  <legend>Activities you play</legend>
                  <div className="progression-toggles">
                    {activities.map((option) => (
                      <Toggle
                        key={option.value}
                        variant="outline"
                        pressed={selectedPreferences.activities.includes(option.value)}
                        onPressedChange={(pressed) =>
                          toggleList("activities", option.value, pressed)
                        }
                        aria-label={`Include ${option.label}`}
                        disabled={save.isPending || preferences.isPending || preferences.isError}
                      >
                        {option.label}
                      </Toggle>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Difficulty</legend>
                  <p className="secondary small">
                    Leave all off to include any supported difficulty
                  </p>
                  <div className="progression-toggles">
                    {difficulties.map((option) => (
                      <Toggle
                        key={option.value}
                        variant="outline"
                        pressed={selectedPreferences.difficulties.includes(option.value)}
                        onPressedChange={(pressed) =>
                          toggleList("difficulties", option.value, pressed)
                        }
                        aria-label={`Include ${option.label} difficulty`}
                        disabled={save.isPending || preferences.isPending || preferences.isError}
                      >
                        {option.label}
                      </Toggle>
                    ))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Crafting</legend>
                  <Toggle
                    variant="outline"
                    pressed={selectedPreferences.allowCrafting}
                    onPressedChange={(pressed) => setPreference("allowCrafting", pressed)}
                    aria-label="Allow crafted gear"
                    disabled={save.isPending || preferences.isPending || preferences.isError}
                  >
                    {selectedPreferences.allowCrafting
                      ? "Crafted gear allowed"
                      : "Exclude crafted gear"}
                  </Toggle>
                </fieldset>
                <fieldset>
                  <legend>Acquisition methods to exclude</legend>
                  <div className="progression-toggles">
                    {methods.map((option) => (
                      <Toggle
                        key={option.value}
                        variant="outline"
                        pressed={selectedPreferences.excludedMethods.includes(option.value)}
                        onPressedChange={(pressed) =>
                          toggleList("excludedMethods", option.value, pressed)
                        }
                        aria-label={`Exclude ${option.label}`}
                        disabled={save.isPending || preferences.isPending || preferences.isError}
                      >
                        {option.label}
                      </Toggle>
                    ))}
                  </div>
                </fieldset>
                {preferences.isError && (
                  <div className="progression-preference-error" role="alert">
                    <p className="secondary small">
                      Saved preferences could not be loaded — retry before replacing them
                    </p>
                    <Button variant="quiet" onClick={() => void preferences.refetch()}>
                      Retry preferences
                    </Button>
                  </div>
                )}
                <Button
                  variant="primary"
                  disabled={
                    !draft || save.isPending || preferences.isPending || preferences.isError
                  }
                  onClick={() =>
                    save.mutate({
                      characterId: character.id,
                      activity,
                      preferences: selectedPreferences,
                    })
                  }
                >
                  {save.isPending ? "Saving…" : "Save content preferences"}
                </Button>
              </section>
              <section className="surface">
                <h2>Personal target</h2>
                <p className="secondary small">
                  A planning goal, separate from a validated season ceiling
                </p>
                <Field label="Target item level">
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={target}
                    placeholder="No target set"
                    onChange={(event) => setTarget(event.target.value)}
                  />
                </Field>
                <Button
                  disabled={goal.isPending}
                  onClick={() => {
                    const value = target.trim() ? Number(target) : null;
                    if (value != null && (!Number.isFinite(value) || value < 0)) {
                      notify("Enter a valid target item level");
                      return;
                    }
                    goal.mutate({ id: character.id, patch: { targetItemLevel: value } });
                  }}
                >
                  Save target
                </Button>
              </section>
              {view.costs.length > 0 && (
                <section className="surface">
                  <h2>Currency budget</h2>
                  <dl className="progression-budget">
                    {view.costs.map((cost) => (
                      <div key={cost.currencyId}>
                        <dt>{cost.currencyId}</dt>
                        <dd>
                          {cost.spent.toLocaleString()} spent ·{" "}
                          {cost.remaining == null
                            ? "Balance unknown"
                            : `${cost.remaining.toLocaleString()} remaining`}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </section>
              )}
            </aside>
          </div>
          <p className="progression-footnote">
            Equipped gear observed {observed(character.gearObservedAt ?? character.observedAt)}
            {result.ruleset
              ? ` · ${result.ruleset.name}`
              : " · Season rules not validated for this build"}
          </p>
          {why && (
            <WhyPanel
              result={result}
              viewKey={viewKey}
              slot={why.slot}
              onClose={() => setWhy(null)}
            />
          )}
        </>
      ) : null}
    </>
  );
}
