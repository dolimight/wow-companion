import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ClipboardPaste, Copy, Sparkles, Users, X } from "lucide-react";
import type { Character, GearDraft } from "../../../shared/domain";
import { decodeLoadout, type DecodedLoadout, type TalentNode, type TalentSection, type TalentTree } from "../../../shared/talents";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/primitives";
import { api } from "../../lib/client";
import { iconUrl } from "../../lib/assets";
import { errorMessage, notify } from "../../lib/notify";
import { ItemIcon } from "../items/ItemIcon";
import { useGameData } from "../items/items";
import "./plan-talents.css";

type Talents = NonNullable<GearDraft["talents"]>;
const CELL = 34, STEP = 600, NODE = 28;

/** Decodes a build against the tree, or explains why it doesn't fit */
function readBuild(tree: TalentTree, loadout: string): { decoded: DecodedLoadout } | { error: string } {
  try {
    const byId = new Map(tree.nodes.map((node) => [node.id, node]));
    const decoded = decodeLoadout(loadout, tree.order, (id) => byId.get(id)?.entries[0]?.maxRanks ?? 1);
    if (decoded.specId !== tree.specId) return { error: "This build is for another specialization" };
    return { decoded };
  } catch (error) { return { error: errorMessage(error) }; }
}

/** The hero tree a build picked, from its selection node */
function heroOf(tree: TalentTree, decoded: DecodedLoadout) {
  const byId = new Map(tree.nodes.map((node) => [node.id, node]));
  const pick = decoded.picks.find((entry) => byId.get(entry.nodeId)?.section === "selection");
  const sub = pick ? byId.get(pick.nodeId)!.entries[pick.entryIndex ?? 0]?.subTreeId : undefined;
  return tree.subTrees.find((entry) => entry.id === sub) ?? null;
}

/**
 * The plan's talent build: take the character's own, a popular one from top players, or paste an export string,
 * then see it on the class, hero, and specialization trees from the installed game, and copy it for the game
 */
export function PlanTalents({ character, live, talents, onChange }: {
  /** The character as the plan's specialization */
  character: Character;
  /** The character as synced, whose own build is offered when it's for this specialization */
  live: Character;
  talents: Talents | null;
  onChange: (talents: Talents | null) => void;
}) {
  const status = useGameData();
  const ready = status.data?.state === "ready" || status.data?.state === "not-indexed";
  const specId = character.specId;
  const tree = useQuery({ queryKey: ["talent-tree", specId], queryFn: () => api.talentTree(specId!), enabled: !!specId && !!status.data?.install, staleTime: Infinity });
  const specs = useQuery({ queryKey: ["specializations"], queryFn: () => api.specializations(), enabled: !!status.data?.install, staleTime: Infinity });
  const top = useQuery({ queryKey: ["top-players", specId, "us"], queryFn: () => api.topPlayers({ specId: specId!, specName: character.specName, className: character.className, region: "us" }), enabled: !!specId, staleTime: 30 * 60_000, retry: false });
  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const specIcon = specs.data?.find((spec) => spec.id === specId)?.icon ?? null;
  const own = live.talents?.loadout && (live.talents.specId ?? live.specId) === specId ? live.talents.loadout : null;
  const build = tree.data && talents ? readBuild(tree.data, talents.loadout) : null;

  const sources = useMemo(() => {
    if (!tree.data) return [];
    const list: Array<{ key: string; label: string; detail: string; loadout: string; icon: number | null; source: string }> = [];
    if (own) { const read = readBuild(tree.data, own); list.push({ key: "own", label: `Your ${character.specName} build`, detail: "decoded" in read ? heroOf(tree.data, read.decoded)?.name ?? "Current build" : "Current build", loadout: own, icon: specIcon, source: `Your build · ${live.talents?.source ?? "synced"}` }); }
    for (const entry of (top.data?.builds ?? []).slice(0, 5)) {
      const read = readBuild(tree.data, entry.loadout);
      if (!("decoded" in read)) continue;
      const hero = heroOf(tree.data, read.decoded);
      list.push({ key: entry.loadout, label: entry.count > 1 ? `Used by ${entry.count} of ${top.data!.players.length}` : entry.players[0] ?? "Top player", detail: hero?.name ?? "Top build", loadout: entry.loadout, icon: hero?.icon ?? specIcon, source: entry.count > 1 ? `Top ${character.specName} players · ${entry.count} of ${top.data!.players.length}` : `Top player · ${entry.players[0] ?? "unnamed"}` });
    }
    return list;
  }, [tree.data, own, top.data, specIcon, character.specName, live.talents?.source]);

  function paste() {
    if (!tree.data) return;
    const value = text.trim();
    const read = readBuild(tree.data, value);
    if ("error" in read) { notify(read.error); return; }
    onChange({ loadout: value, source: "Pasted string" });
    setPasting(false); setText("");
  }
  async function copy() {
    if (!talents) return;
    try { await navigator.clipboard.writeText(talents.loadout); notify("Talent string copied · in game open Talents, choose Import, and paste it"); }
    catch (error) { notify(errorMessage(error)); }
  }

  return (
    <section className="surface plan-talents" aria-labelledby="plan-talents-heading">
      <div className="plan-talents-heading">
        <ItemIcon icon={specIcon} size="medium" fallback={<Sparkles />} />
        <div>
          <h2 id="plan-talents-heading">Talents</h2>
          <p>{talents ? talents.source : `Pick a ${character.specName} build for this plan`}</p>
        </div>
        <div className="plan-talents-actions">
          {talents && <Button onClick={() => void copy()}><Copy size={14} aria-hidden="true" />Copy string</Button>}
          {talents && <Button variant="quiet" onClick={() => onChange(null)}><X size={14} aria-hidden="true" />Clear</Button>}
        </div>
      </div>

      <div className="plan-talents-sources" role="group" aria-label="Talent builds to use">
        {sources.map((source) => (
          <button key={source.key} type="button" className="plan-talent-source" aria-pressed={talents?.loadout === source.loadout}
            onClick={() => onChange({ loadout: source.loadout, source: source.source })}>
            <ItemIcon icon={source.icon} size="small" fallback={<Users />} />
            <span><strong>{source.label}</strong><small>{source.detail}</small></span>
          </button>
        ))}
        {top.isPending && specId && <span className="plan-talent-source" data-loading=""><Users aria-hidden="true" /><span><strong>Top builds</strong><small>Loading…</small></span></span>}
        {!pasting
          ? <button type="button" className="plan-talent-source" onClick={() => setPasting(true)}><span className="plan-talent-source-glyph"><ClipboardPaste aria-hidden="true" /></span><span><strong>Paste a string</strong><small>From the game or a guide</small></span></button>
          : <form className="plan-talent-paste" onSubmit={(event) => { event.preventDefault(); paste(); }}>
              <Input autoFocus value={text} maxLength={400} placeholder="Paste a talent export string" onChange={(event) => setText(event.target.value)} />
              <Button type="submit" variant="primary" disabled={!text.trim()}>Use</Button>
              <Button type="button" variant="quiet" onClick={() => { setPasting(false); setText(""); }}>Cancel</Button>
            </form>}
      </div>

      {!specId ? <p className="muted">The plan's specialization is unknown, so no talent tree can be shown</p>
        : tree.isPending ? <p className="muted" role="status">Reading talents from your game files…</p>
          : tree.isError ? <p className="error" role="alert">{errorMessage(tree.error)}</p>
            : !tree.data ? <p className="muted">This specialization has no talent tree in your game files</p>
              : build && "error" in build ? <p className="error" role="alert">{build.error}</p>
                : <TalentTreeView tree={tree.data} decoded={build && "decoded" in build ? build.decoded : null} />}
      {!ready && <p className="muted small">Talent names and icons come from your installed game</p>}
    </section>
  );
}

function TalentTreeView({ tree, decoded }: { tree: TalentTree; decoded: DecodedLoadout | null }) {
  const picks = new Map((decoded?.picks ?? []).map((pick) => [pick.nodeId, pick]));
  const hero = decoded ? heroOf(tree, decoded) : null;
  const heroId = hero?.id ?? tree.subTrees[0]?.id;
  const spent = (section: TalentSection) => tree.nodes.filter((node) => node.section === section && (section !== "hero" || node.subTreeId === heroId)).reduce((sum, node) => { const pick = picks.get(node.id); return sum + (pick?.purchased ? pick.ranks : 0); }, 0);
  const panels: Array<{ key: string; title: string; icon: number | null; nodes: TalentNode[]; points: number }> = [
    { key: "class", title: "Class", icon: null, nodes: tree.nodes.filter((node) => node.section === "class"), points: spent("class") },
    { key: "hero", title: hero?.name ?? tree.subTrees.find((entry) => entry.id === heroId)?.name ?? "Hero", icon: (hero ?? tree.subTrees[0])?.icon ?? null, nodes: tree.nodes.filter((node) => node.section === "hero" && node.subTreeId === heroId), points: spent("hero") },
    { key: "spec", title: "Specialization", icon: null, nodes: tree.nodes.filter((node) => node.section === "spec"), points: spent("spec") },
  ];
  return (
    <div className="talent-trees">
      {panels.map((panel) => panel.nodes.length > 0 && (
        <TalentPanel key={panel.key} title={panel.title} icon={panel.icon} points={decoded ? panel.points : null} nodes={panel.nodes} edges={tree.edges} picks={picks} hasBuild={!!decoded} />
      ))}
    </div>
  );
}

function TalentPanel({ title, icon, points, nodes, edges, picks, hasBuild }: {
  title: string; icon: number | null; points: number | null; nodes: TalentNode[]; edges: Array<[number, number]>;
  picks: Map<number, DecodedLoadout["picks"][number]>; hasBuild: boolean;
}) {
  const minX = Math.min(...nodes.map((node) => node.x)), minY = Math.min(...nodes.map((node) => node.y));
  const at = (node: TalentNode) => ({ left: ((node.x - minX) / STEP) * CELL, top: ((node.y - minY) / STEP) * CELL });
  const width = Math.max(...nodes.map((node) => at(node).left)) + CELL, height = Math.max(...nodes.map((node) => at(node).top)) + CELL;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = edges.filter(([from, to]) => byId.has(from) && byId.has(to));
  return (
    <section className="talent-panel" aria-label={`${title} talents`}>
      <header>
        {icon && <ItemIcon icon={icon} size="small" />}
        <strong>{title}</strong>
        {points != null && <span>{points} point{points === 1 ? "" : "s"}</span>}
      </header>
      <div className="talent-canvas" style={{ width, height }}>
        <svg width={width} height={height} aria-hidden="true">
          {lines.map(([from, to]) => {
            const a = at(byId.get(from)!), b = at(byId.get(to)!);
            const lit = !!picks.get(from) && !!picks.get(to);
            return <line key={`${from}-${to}`} x1={a.left + CELL / 2} y1={a.top + CELL / 2} x2={b.left + CELL / 2} y2={b.top + CELL / 2} data-lit={lit || undefined} />;
          })}
        </svg>
        {nodes.map((node) => {
          const pick = picks.get(node.id);
          const chosen = pick ? node.entries[pick.entryIndex ?? 0] ?? node.entries[0]! : null;
          const shown = chosen ?? node.entries[0]!;
          const max = shown.maxRanks;
          const label = node.entries.length > 1
            ? `${node.entries.map((entry) => entry.name).join(" or ")}${chosen ? ` · chose ${chosen.name}` : ""}`
            : `${shown.name}${max > 1 ? ` · ${pick?.ranks ?? 0}/${max}` : ""}`;
          return (
            <span key={node.id} className="talent-node" data-choice={node.entries.length > 1 || undefined} data-picked={pick ? true : undefined}
              data-dim={hasBuild && !pick ? true : undefined} data-granted={pick && !pick.purchased ? true : undefined}
              style={{ left: at(node).left + (CELL - NODE) / 2, top: at(node).top + (CELL - NODE) / 2 }} title={label} aria-label={label}>
              {shown.icon ? <img src={iconUrl(shown.icon) ?? undefined} alt="" width={NODE} height={NODE} /> : <Sparkles aria-hidden="true" />}
              {max > 1 && pick && <small>{pick.ranks}/{max}</small>}
            </span>
          );
        })}
      </div>
    </section>
  );
}
