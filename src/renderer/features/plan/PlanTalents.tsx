import { useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronsUpDown, ClipboardPaste, Copy, Sparkles, Users, X } from "lucide-react";
import type { Character, GearDraft } from "../../../shared/domain";
import { decodeLoadout, type DecodedLoadout, type TalentNode, type TalentTree } from "../../../shared/talents";
import { blockReason, buildFrom, chooseHeroTree, chosenHero, encodeLoadout, learn, spent, unlearn, type Build } from "../../../shared/talent-editor";
import { effectText, type ItemStatBlock, type ScalingLevel } from "../../../shared/item-scaling";
import { Popover, PopoverContent, PopoverTrigger } from "../../components/ui/popover";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/primitives";
import { api } from "../../lib/client";
import { iconUrl } from "../../lib/assets";
import { errorMessage, notify } from "../../lib/notify";
import { ItemIcon } from "../items/ItemIcon";
import { useGameData } from "../items/items";
import "./plan-talents.css";
import { LatticeLoader } from "../../components/motion/LatticeLoader";

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
        : tree.isPending ? <LatticeLoader label="Reading talents from your game files" pattern="spiral" />
          : tree.isError ? <p className="error" role="alert">{errorMessage(tree.error)}</p>
            : !tree.data ? <p className="muted">This specialization has no talent tree in your game files</p>
              : build && "error" in build ? <p className="error" role="alert">{build.error}</p>
                : <TalentEditor tree={tree.data} decoded={build && "decoded" in build ? build.decoded : null}
                    onBuild={(next) => onChange({ loadout: encodeLoadout(tree.data!, next), source: talents?.source.endsWith("· edited") ? talents.source : `${talents?.source ?? "Built here"} · edited` })} />}
      {!ready && <p className="muted small">Talent names and icons come from your installed game</p>}
      {tree.data && <p className="muted small talent-hint">Hover a talent for details · click to learn it · right-click to remove a rank</p>}
    </section>
  );
}

// Talent spells don't scale with items, so only fixed values fill in; anything else stays marked unknown
const noItem: ItemStatBlock = { statTypes: [], alloc: [], socketShare: [], inventoryType: 0, classId: 0, subclassId: 0, quality: 4 };
const noLevel: ScalingLevel = { itemLevel: 0, epic: [], superior: [], good: [], damageReplace: 0, damageSecondary: 0, rating: null, stamina: null, armorTotal: null, armorQuality: null, shield: null, socketCost: null };
export function talentDescription(tree: TalentTree, spellId: number) {
  if (!spellId || !tree.spells[spellId]) return null;
  const spells = new Map(Object.entries(tree.spells).map(([id, spell]) => [Number(id), spell]));
  return effectText(spellId, spells, noItem, noLevel).text || null;
}

function TalentEditor({ tree, decoded, onBuild }: { tree: TalentTree; decoded: DecodedLoadout | null; onBuild: (build: Build) => void }) {
  const build = useMemo(() => buildFrom(tree, decoded), [tree, decoded]);
  const heroId = chosenHero(tree, build) ?? tree.subTrees[0]?.id ?? null;
  const hero = tree.subTrees.find((entry) => entry.id === heroId) ?? null;
  const currencyOf = (nodes: TalentNode[]) => nodes.find((node) => node.currency != null)?.currency ?? null;
  const panel = (key: string, title: string, icon: number | null, nodes: TalentNode[]) => {
    const currency = currencyOf(nodes);
    return { key, title, icon, nodes, used: spent(tree, build, currency), cap: currency != null ? tree.caps[currency] ?? null : null };
  };
  const panels = [
    panel("class", "Class", null, tree.nodes.filter((node) => node.section === "class")),
    panel("hero", hero?.name ?? "Hero", hero?.icon ?? null, tree.nodes.filter((node) => node.section === "hero" && node.subTreeId === heroId)),
    panel("spec", "Specialization", null, tree.nodes.filter((node) => node.section === "spec")),
  ];
  return (
    <div className="talent-trees">
      {panels.map((entry) => entry.nodes.length > 0 && (
        <TalentPanel {...entry} key={entry.key} tree={tree} build={build} onBuild={onBuild}
          heroPicker={entry.key === "hero" && tree.subTrees.length > 1 ? <HeroPicker tree={tree} chosen={chosenHero(tree, build)} onChoose={(id) => onBuild(chooseHeroTree(tree, build, id))} /> : null} />
      ))}
    </div>
  );
}

function HeroPicker({ tree, chosen, onChoose }: { tree: TalentTree; chosen: number | null; onChoose: (id: number) => void }) {
  return (
    <Popover>
      <PopoverTrigger className="talent-hero-switch" aria-label="Choose a hero tree"><ChevronsUpDown size={14} aria-hidden="true" /></PopoverTrigger>
      <PopoverContent side="bottom" className="talent-popover">
        <strong className="talent-popover-title">Hero tree</strong>
        {tree.subTrees.map((entry) => (
          <button key={entry.id} type="button" className="talent-choice" aria-pressed={entry.id === chosen} onClick={() => onChoose(entry.id)}>
            <ItemIcon icon={entry.icon} size="small" fallback={<Sparkles />} />
            <span><strong>{entry.name}</strong><small>{entry.description}</small></span>
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function TalentPanel({ title, icon, used, cap, nodes, tree, build, onBuild, heroPicker }: {
  title: string; icon: number | null; used: number; cap: number | null; nodes: TalentNode[]; tree: TalentTree; build: Build; onBuild: (build: Build) => void; heroPicker: ReactNode;
}) {
  const minX = Math.min(...nodes.map((node) => node.x)), minY = Math.min(...nodes.map((node) => node.y));
  const at = (node: TalentNode) => ({ left: ((node.x - minX) / STEP) * CELL, top: ((node.y - minY) / STEP) * CELL });
  const width = Math.max(...nodes.map((node) => at(node).left)) + CELL, height = Math.max(...nodes.map((node) => at(node).top)) + CELL;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const lines = tree.edges.filter(([from, to]) => byId.has(from) && byId.has(to));
  return (
    <section className="talent-panel" aria-label={`${title} talents`}>
      <header>
        {icon && <ItemIcon icon={icon} size="small" />}
        <strong>{title}</strong>
        <span data-full={cap != null && used >= cap || undefined}>{used}{cap != null ? ` / ${cap}` : ""}</span>
        {heroPicker}
      </header>
      <div className="talent-canvas" style={{ width, height }}>
        <svg width={width} height={height} aria-hidden="true">
          {lines.map(([from, to]) => {
            const a = at(byId.get(from)!), b = at(byId.get(to)!);
            return <line key={`${from}-${to}`} x1={a.left + CELL / 2} y1={a.top + CELL / 2} x2={b.left + CELL / 2} y2={b.top + CELL / 2} data-lit={(build.has(from) && build.has(to)) || undefined} />;
          })}
        </svg>
        {nodes.map((node) => <TalentButton key={node.id} node={node} tree={tree} build={build} onBuild={onBuild} style={{ left: at(node).left + (CELL - NODE) / 2, top: at(node).top + (CELL - NODE) / 2 }} />)}
      </div>
    </section>
  );
}

function TalentButton({ node, tree, build, onBuild, style }: { node: TalentNode; tree: TalentTree; build: Build; onBuild: (build: Build) => void; style: React.CSSProperties }) {
  const pick = build.get(node.id);
  const choice = node.entries.length > 1;
  const shown = node.entries[pick?.entryIndex ?? 0] ?? node.entries[0]!;
  const max = shown.maxRanks;
  const blocked = blockReason(tree, build, node.id);
  const learnable = !blocked;
  const label = `${choice ? node.entries.map((entry) => entry.name).join(" or ") : shown.name}${pick ? ` · ${pick.ranks}/${max}` : ""}`;
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={250} closeDelay={150}
        className="talent-node" style={style} aria-label={label}
        data-choice={choice || undefined} data-picked={pick ? true : undefined} data-granted={pick && !pick.purchased ? true : undefined}
        data-dim={!pick || undefined} data-available={!pick && learnable ? true : undefined}
        // A click learns, except on a choice where the popover asks which side
        onClick={(event) => { if (!choice && learnable) { event.preventDefault(); onBuild(learn(tree, build, node.id)); } }}
        onContextMenu={(event) => { event.preventDefault(); if (pick) onBuild(unlearn(tree, build, node.id)); }}>
        {shown.icon ? <img src={iconUrl(shown.icon) ?? undefined} alt="" width={NODE} height={NODE} /> : <Sparkles aria-hidden="true" />}
        {max > 1 && pick && <small>{pick.ranks}/{max}</small>}
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="talent-popover">
        {node.entries.map((entry, index) => {
          const active = !!pick && (pick.entryIndex ?? 0) === index;
          const reason = choice ? blockReason(tree, build, node.id, index) : blocked;
          return (
            <div key={entry.id} className="talent-detail" data-active={active || undefined}>
              <div className="talent-detail-head">
                <ItemIcon icon={entry.icon} size="medium" fallback={<Sparkles />} />
                <div>
                  <strong>{entry.name}</strong>
                  <small>{node.granted ? "Learned automatically" : active ? `Rank ${pick!.ranks} of ${entry.maxRanks}` : entry.maxRanks > 1 ? `${entry.maxRanks} ranks` : "1 rank"}</small>
                </div>
              </div>
              {talentDescription(tree, entry.spellId) && <p>{talentDescription(tree, entry.spellId)}</p>}
              {choice && !node.granted && (active
                ? <span className="talent-detail-state">Chosen</span>
                : <Button disabled={!!reason} onClick={() => onBuild(learn(tree, build, node.id, index))}>{pick ? "Switch to this" : "Choose this"}</Button>)}
              {choice && !active && reason && !pick && <small className="talent-detail-reason">{reason}</small>}
            </div>
          );
        })}
        {!node.granted && (
          <div className="talent-actions">
            {!choice && <Button variant="primary" disabled={!learnable} onClick={() => onBuild(learn(tree, build, node.id))}>{pick ? "Add a rank" : "Learn"}</Button>}
            {pick && <Button variant="quiet" onClick={() => onBuild(unlearn(tree, build, node.id))}>{pick.ranks > 1 ? "Remove a rank" : "Remove"}</Button>}
          </div>
        )}
        {!choice && blocked && !node.granted && !(pick && blocked === "Already at its highest rank") && <small className="talent-detail-reason">{blocked}</small>}
      </PopoverContent>
    </Popover>
  );
}
