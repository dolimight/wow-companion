import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCw } from "lucide-react";
import { api } from "../../lib/client";
import { Button, Sheet } from "../../components/ui/primitives";
import { Toggle } from "../../components/ui/toggle";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useConnections } from "../connections/connections";
import { ago } from "../sync/sync";
import type { Character } from "../../../shared/domain";
import "./realms.css";

type Report = Awaited<ReturnType<typeof api.realmStatus>>;
type Realm = Extract<Report, { configured: true }>["realms"][number];
type Health = "up" | "queue" | "down" | "unknown";

const regionNames: Record<string, string> = { us: "Americas and Oceania", eu: "Europe", kr: "Korea", tw: "Taiwan" };
/** Same rule as Blizzard's realm slugs, so a character's realm name finds its connected realm */
export const realmSlug = (realm: string) => realm.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
const health = (realm: Realm): Health => !realm.up ? "down" : realm.queue ? "queue" : "up";
const healthText: Record<Health, string> = { up: "Up", queue: "Queue", down: "Down", unknown: "Unknown" };

/** Live realm state for the Blizzard key's region, checked again every minute while the app is open */
export function useRealmStatus() {
  const connections = useConnections();
  const region = connections.data?.blizzard.region ?? "us";
  const configured = connections.data?.blizzard.configured ?? false;
  return { region, configured, status: useQuery({ queryKey: ["realm-status", region], queryFn: () => api.realmStatus(region), enabled: configured, refetchInterval: 60_000, refetchOnWindowFocus: true, retry: 1 }) };
}

/** The connected realms the player's characters live on, each once */
function yourRealms(realms: Realm[], characters: Character[], region: string) {
  const bySlug = new Map(realms.flatMap(realm => realm.realms.map(entry => [entry.slug, realm] as const)));
  const found = new Map<number, { realm: Realm; characters: string[] }>();
  for (const character of characters) {
    if (character.region !== region) continue;
    const realm = bySlug.get(realmSlug(character.realm));
    if (!realm) continue;
    const entry = found.get(realm.id) ?? { realm, characters: [] };
    entry.characters.push(character.name);
    found.set(realm.id, entry);
  }
  return [...found.values()];
}

function summary(report: Report | undefined, mine: ReturnType<typeof yourRealms>, configured: boolean): { health: Health; text: string } {
  if (!configured) return { health: "unknown", text: "Connect Blizzard data to see realm status" };
  if (!report || !report.configured) return { health: "unknown", text: "Checking realms" };
  const watched = mine.length ? mine.map(entry => entry.realm) : report.realms;
  const down = watched.filter(realm => !realm.up), queued = watched.filter(realm => realm.up && realm.queue);
  const name = (realm: Realm) => realm.realms[0]!.name;
  if (down.length) return { health: "down", text: down.length === 1 ? `${name(down[0]!)} is down` : `${down.length} ${mine.length ? "of your realms are" : "realms are"} down` };
  if (queued.length) return { health: "queue", text: queued.length === 1 ? `${name(queued[0]!)} has a queue` : `${queued.length} realms have queues` };
  return { health: "up", text: mine.length ? (mine.length === 1 ? `${name(mine[0]!.realm)} is up` : `All ${mine.length} of your realms are up`) : "All realms are up" };
}

/** Short label for the title bar chip, so the state reads without opening the panel */
function chipText(report: Report | undefined, mine: ReturnType<typeof yourRealms>, configured: boolean, state: Health) {
  if (!configured || !report?.configured) return "Realms";
  if (mine.length === 1) return `${mine[0]!.realm.realms[0]!.name} · ${healthText[state]}`;
  return state === "up" ? "Realms up" : state === "down" ? "Realm down" : "Realm queue";
}

/** Title bar chip with a status light; the full list opens in a panel */
export function RealmStatusButton({ characters, onClick }: { characters: Character[]; onClick: () => void }) {
  const { configured, region, status } = useRealmStatus();
  const report = status.data;
  const mine = report?.configured ? yourRealms(report.realms, characters, region) : [];
  const { health: state, text } = summary(report, mine, configured);
  return (
    <Tooltip>
      <TooltipTrigger render={<Button className="realm-chip" data-health={state} onClick={onClick} aria-label={`${text}. Open realm status`} />}>
        <i className="realm-dot" data-health={state} aria-hidden="true" />
        <span>{chipText(report, mine, configured, state)}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{text}</TooltipContent>
    </Tooltip>
  );
}

function RealmRow({ realm, note }: { realm: Realm; note?: string }) {
  const state = health(realm);
  const [first, ...rest] = realm.realms;
  return (
    <li className="realm-row" data-health={state}>
      <i className="realm-dot" data-health={state} aria-hidden="true" />
      <span className="realm-row-name">
        <strong>{first!.name}</strong>
        {(note || rest.length > 0) && <small>{[note, rest.length ? `Connected with ${rest.map(entry => entry.name).join(", ")}` : null].filter(Boolean).join(" · ")}</small>}
      </span>
      <span className="realm-row-meta">{realm.population ?? ""}</span>
      <span className="realm-pill" data-health={state}>{healthText[state]}</span>
    </li>
  );
}

export function RealmStatusSheet({ open, onOpenChange, characters }: { open: boolean; onOpenChange: (open: boolean) => void; characters: Character[] }) {
  const { configured, region, status } = useRealmStatus();
  const client = useQueryClient();
  const [text, setText] = useState("");
  const [problemsOnly, setProblemsOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const report = status.data;
  const realms = report?.configured ? report.realms : [];
  const mine = report?.configured ? yourRealms(realms, characters, region) : [];
  const counts = useMemo(() => ({ up: realms.filter(realm => realm.up).length, down: realms.filter(realm => !realm.up).length, queue: realms.filter(realm => realm.up && realm.queue).length }), [realms]);
  const query = realmSlug(text);
  const shown = realms.filter(realm => (!problemsOnly || !realm.up || realm.queue) && (!query || realm.realms.some(entry => entry.slug.includes(query))));
  async function refresh() {
    setRefreshing(true);
    try { client.setQueryData(["realm-status", region], await api.realmStatus(region, true)); } catch { void status.refetch(); } finally { setRefreshing(false); }
  }
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Realm status" description={configured ? `${regionNames[region] ?? region.toUpperCase()} realms from Blizzard · Checked again every minute while the app is open` : "Realm status comes from Blizzard's game data"}>
      {!configured ? <p className="muted">Connect Blizzard data in Settings → Connections to see which realms are up</p>
        : status.isError && !report ? <div className="realm-empty" role="alert"><p>Realm status could not be read from Blizzard</p><Button onClick={() => void status.refetch()}>Try again</Button></div>
        : !report?.configured ? <p className="muted">Checking realms…</p>
        : <div className="realm-sheet">
          <div className="realm-overview" role="status">
            <div><strong>{counts.up}</strong><span>Up</span></div>
            <div data-health={counts.down ? "down" : undefined}><strong>{counts.down}</strong><span>Down</span></div>
            <div data-health={counts.queue ? "queue" : undefined}><strong>{counts.queue}</strong><span>With a queue</span></div>
          </div>
          <div className="realm-checked">
            <span>Checked {ago(report.checkedAt)}{status.isError ? " · The latest check failed, showing the last known state" : ""}</span>
            <Button variant="quiet" disabled={refreshing} onClick={() => void refresh()}><RefreshCw className={refreshing ? "spin" : ""} />Check now</Button>
          </div>
          {mine.length > 0 && <section>
            <h3 className="realm-heading">Your realms</h3>
            <ul className="realm-list">{mine.map(entry => <RealmRow key={entry.realm.id} realm={entry.realm} note={entry.characters.slice(0, 3).join(", ") + (entry.characters.length > 3 ? ` and ${entry.characters.length - 3} more` : "")} />)}</ul>
          </section>}
          <section>
            <h3 className="realm-heading">All realms</h3>
            <div className="realm-tools">
              <input type="search" value={text} onChange={event => setText(event.target.value)} placeholder="Find a realm" aria-label="Find a realm" />
              <Toggle type="button" variant="outline" className="workspace-toggle" pressed={problemsOnly} onPressedChange={setProblemsOnly} aria-label="Only realms that are down or have a queue">
                <span>Problems only</span><span className="toggle-state">{problemsOnly ? "On" : "Off"}</span>
              </Toggle>
            </div>
            {shown.length ? <ul className="realm-list">{shown.map(realm => <RealmRow key={realm.id} realm={realm} />)}</ul>
              : <p className="muted realm-empty">{problemsOnly ? "Every matching realm is up with no queue" : "No realm matches that name"}</p>}
          </section>
        </div>}
    </Sheet>
  );
}
