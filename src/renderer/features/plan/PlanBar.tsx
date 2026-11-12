import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import type { Activity, Character, GearDraft } from "../../../shared/domain";
import { specializationName, specializationsFor } from "../../../shared/specializations";
import { AppSelect } from "../../components/AppSelect";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "../../components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "../../components/ui/dialog";
import { Input } from "../../components/ui/input";
import { Button, Field } from "../../components/ui/primitives";
import { api } from "../../lib/client";
import { iconUrl } from "../../lib/assets";
import { errorMessage, notify } from "../../lib/notify";
import { gearMemory, planKey, setActivePlan, type PlanRef } from "../../lib/plan-item";
import "./plan-bar.css";

const refValue = (ref: PlanRef) => `${ref.specId ?? "none"}|${ref.plan}`;
const parseRef = (value: string): PlanRef => { const [spec, plan] = value.split("|"); return { specId: spec === "none" ? null : Number(spec), plan: plan! }; };

/**
 * Picks which plan is open for this activity, makes new ones for any specialization of the class, and deletes them.
 * Each plan keeps its own specialization, which drives item rules, suggestions, and stats
 */
export function PlanBar({ character, activity, current, currentName, currentItems }: {
  character: Character;
  activity: Activity;
  current: PlanRef;
  currentName: string;
  currentItems: GearDraft["items"];
}) {
  const client = useQueryClient();
  const drafts = useQuery({ queryKey: ["gear-draft", character.id, "list"], queryFn: () => api.listGearDrafts(character.id) });
  const specIcons = useSpecIcons();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const specs = specializationsFor(character.className);
  const specLabel = (specId: number | null) => specializationName(specId, character.specName);
  const saved = (drafts.data ?? []).filter((draft) => draft.activity === activity);
  // The open plan is listed even before its first save
  const plans = [...saved.map((draft) => ({ ref: { specId: draft.specId, plan: draft.plan }, name: draft.name })),
    ...(saved.some((draft) => draft.specId === current.specId && draft.plan === current.plan) ? [] : [{ ref: current, name: currentName }])]
    .sort((a, b) => specLabel(a.ref.specId).localeCompare(specLabel(b.ref.specId)) || a.name.localeCompare(b.name));
  const open = (ref: PlanRef) => void setActivePlan(character.id, activity, ref).catch((error) => notify(errorMessage(error)));

  async function remove() {
    try {
      await api.deleteGearDraft({ characterId: character.id, activity, specId: current.specId, plan: current.plan });
      gearMemory.delete(planKey(character.id, activity, current.specId, current.plan));
      const next = plans.find((plan) => refValue(plan.ref) !== refValue(current))?.ref ?? { specId: character.specId, plan: "main" };
      await setActivePlan(character.id, activity, next);
      await client.invalidateQueries({ queryKey: ["gear-draft", character.id] });
      notify(`Deleted ${currentName}`);
    } catch (error) { notify(errorMessage(error)); }
    setDeleting(false);
  }

  return (
    <div className="plan-bar">
      <Field label="Open plan">
        <AppSelect aria-label="Open plan" value={refValue(current)} onValueChange={(value) => open(parseRef(value))}
          options={plans.map((plan) => ({ value: refValue(plan.ref), label: `${specLabel(plan.ref.specId)} · ${plan.name}`, image: iconUrl(specIcons.get(plan.ref.specId ?? 0)) ?? undefined }))} />
      </Field>
      <div className="plan-bar-actions">
        <Button onClick={() => setCreating(true)}><Plus size={14} aria-hidden="true" />New plan</Button>
        <Button variant="quiet" onClick={() => setDeleting(true)} disabled={!saved.some((draft) => draft.specId === current.specId && draft.plan === current.plan)}><Trash2 size={14} aria-hidden="true" />Delete plan</Button>
      </div>
      {creating && <NewPlanDialog character={character} activity={activity} specs={specs} current={current} currentItems={currentItems} existing={saved}
        onClose={() => setCreating(false)} onCreated={(ref) => { setCreating(false); open(ref); void client.invalidateQueries({ queryKey: ["gear-draft", character.id] }); }} />}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {currentName}?</AlertDialogTitle>
            <AlertDialogDescription>The {specLabel(current.specId)} plan and its items are removed from this computer. This can't be undone</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => void remove()}>Delete plan</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function NewPlanDialog({ character, activity, specs, current, currentItems, existing, onClose, onCreated }: {
  character: Character;
  activity: Activity;
  specs: Array<{ id: number; name: string }>;
  current: PlanRef;
  currentItems: GearDraft["items"];
  existing: GearDraft[];
  onClose: () => void;
  onCreated: (ref: PlanRef) => void;
}) {
  const [specId, setSpecId] = useState<number | null>(current.specId ?? specs[0]?.id ?? null);
  const specIcons = useSpecIcons();
  const [name, setName] = useState("");
  const [start, setStart] = useState<"equipped" | "copy" | "empty">("equipped");
  const [busy, setBusy] = useState(false);
  const spec = specs.find((entry) => entry.id === specId)?.name ?? character.specName;
  async function create() {
    setBusy(true);
    try {
      // A specialization's first plan takes the main slot; later ones get their own ID
      const plan = existing.some((draft) => draft.specId === specId && draft.plan === "main") || (current.specId === specId && current.plan === "main") ? `p-${crypto.randomUUID().slice(0, 8)}` : "main";
      const items = start === "equipped" ? character.gear.map((item) => ({ ...item })) : start === "copy" ? currentItems.map((item) => ({ ...item })) : [];
      await api.saveGearDraft({ id: crypto.randomUUID(), characterId: character.id, specId, activity, plan, name: name.trim() || `${spec} plan`, items, updatedAt: new Date().toISOString() });
      onCreated({ specId, plan });
    } catch (error) { notify(errorMessage(error)); setBusy(false); }
  }
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>New plan</DialogTitle>
          <DialogDescription>Plan gear for any of {character.name}'s specializations · item rules, suggestions, and slots follow the one you pick</DialogDescription>
        </DialogHeader>
        <div className="new-plan-fields">
          <Field label="Specialization">
            <AppSelect aria-label="Specialization" value={String(specId ?? "")} onValueChange={(value) => setSpecId(Number(value))}
              options={(specs.length ? specs : [{ id: character.specId ?? 0, name: character.specName }]).map((entry) => ({ value: String(entry.id), label: entry.name, image: iconUrl(specIcons.get(entry.id)) ?? undefined }))} />
          </Field>
          <Field label="Name">
            <Input value={name} maxLength={100} placeholder={`${spec} plan`} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="Start from">
            <AppSelect aria-label="Start from" value={start} onValueChange={(value) => setStart(value as typeof start)}
              options={[{ value: "equipped", label: "Your equipped gear" }, { value: "copy", label: "A copy of the open plan" }, { value: "empty", label: "Nothing planned" }]} />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={busy} onClick={() => void create()}><Plus size={14} aria-hidden="true" />Create plan</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Specialization icons from the installed game, by specialization ID */
function useSpecIcons() {
  const specs = useQuery({ queryKey: ["specializations"], queryFn: () => api.specializations(), staleTime: Infinity, retry: false });
  return new Map((specs.data ?? []).flatMap((spec) => spec.icon ? [[spec.id, spec.icon] as const] : []));
}
