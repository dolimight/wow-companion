import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { AlertCircle, Check, ChevronRight, Gamepad2, RefreshCw, Upload } from "lucide-react";
import { api } from "../../lib/client";
import { errorMessage, notify } from "../../lib/notify";
import { Button, Field, Sheet } from "../../components/ui/primitives";
import { Tooltip, TooltipContent, TooltipTrigger } from "../../components/ui/tooltip";
import { useConnections } from "../connections/connections";
import type { ImportReport } from "../../../shared/domain";
import "./sync.css";

export function useSyncState() {
  return useQuery({ queryKey: ["sync-state"], queryFn: () => api.syncState(), refetchInterval: (query) => (query.state.data?.running ? 1200 : 30_000) });
}

/** Re-syncs when the window comes back to the front after a while, so the roster is current whenever it's looked at */
export function useSyncOnFocus() {
  const client = useQueryClient();
  const running = useRef(false);
  useEffect(() => {
    async function onFocus() {
      if (running.current) return;
      running.current = true;
      try { await api.syncNow("focus"); } catch { /* the next manual sync reports the reason */ }
      running.current = false;
      void client.invalidateQueries();
    }
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [client]);
}

export function ago(value: string | null | undefined) {
  if (!value) return "never";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}

/** Sidebar footer control: icon only, spinning while it works, with the status in its tooltip */
export function SyncButton({ onClick }: { onClick: () => void }) {
  const sync = useSyncState();
  const state = sync.data;
  const failed = state?.results.filter((result) => !result.ok).length ?? 0;
  const label = state?.running
    ? state.total ? `Syncing ${Math.min(state.done + 1, state.total)} of ${state.total}` : "Syncing"
    : state?.finishedAt ? `Synced ${ago(state.finishedAt)}${failed ? ` · ${failed} could not update` : ""}` : "Sync";
  return (
    <Tooltip>
      <TooltipTrigger render={<button type="button" className={`footer-icon sync-button ${failed && !state?.running ? "has-issue" : ""}`} onClick={onClick} aria-label={`${label}. Open sync details`} />}>
        <RefreshCw className={state?.running ? "spin" : ""} />
      </TooltipTrigger>
      <TooltipContent side="top">{label}</TooltipContent>
    </Tooltip>
  );
}

function AddonStatus() {
  const connections = useConnections();
  const client = useQueryClient();
  const install = useMutation({
    mutationFn: () => api.installAddon(),
    onSuccess: () => { void client.invalidateQueries(); notify("Addon installed"); },
    onError: (error) => notify(errorMessage(error)),
  });
  const data = connections.data;
  const sync = useSyncState();
  if (!data) return null;
  if (!data.gameData.install)
    return (
      <div className="sync-addon">
        <Gamepad2 />
        <div>
          <strong>World of Warcraft not found yet</strong>
          <p>Connect your game so your gear, vault, and talents come straight from it</p>
        </div>
        <Link className="button button-secondary" to="/setup">Set up</Link>
      </div>
    );
  if (!data.addon || data.addon.state === "not-installed")
    return (
      <div className="sync-addon">
        <Gamepad2 />
        <div>
          <strong>Add the companion addon</strong>
          <p>It lets WOW Companion read your Great Vault, lockouts, and gear exactly as the game shows them</p>
        </div>
        <Button variant="primary" disabled={install.isPending} onClick={() => install.mutate()}>{install.isPending ? "Installing…" : "Install"}</Button>
      </div>
    );
  const checked = sync.data?.addonFile.checkedAt;
  return (
    <div className="sync-addon ok">
      <Check />
      <div>
        <strong>{data.addonWatching ? "Reading your game data automatically" : "Addon installed"}</strong>
        <p>
          {data.addonWatching
            ? `The game saves it when you log out or type /reload, then it appears here${checked ? ` · checked ${ago(checked)}` : ""}`
            : "Log in to a character, then log out once. Your in-game data will appear here by itself"}
        </p>
        {sync.data?.addonFile.error && <p className="sync-error">{sync.data.addonFile.error}</p>}
      </div>
    </div>
  );
}

export function SyncSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const sync = useSyncState();
  const client = useQueryClient();
  const state = sync.data;
  const start = useMutation({
    mutationFn: () => api.syncNow("manual"),
    onSuccess: () => void client.invalidateQueries(),
    onError: (error) => notify(errorMessage(error)),
  });
  const running = !!state?.running || start.isPending;
  const failed = state?.results.filter((result) => !result.ok) ?? [];
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Sync" description="WOW Companion updates your characters every time it opens. You can also update them now">
      <div className="form-stack">
        <div className="sync-summary">
          <div>
            <strong>{running ? (state?.total ? `Updating ${state.current ?? "characters"}` : "Looking for your game") : state?.finishedAt ? "Up to date" : "Not synced yet"}</strong>
            <p>
              {running
                ? `${state?.done ?? 0} of ${state?.total ?? 0} characters`
                : state?.finishedAt
                  ? `Last synced ${ago(state.finishedAt)}${failed.length ? ` · ${failed.length} could not update` : ""}`
                  : "Press Sync now to begin"}
            </p>
          </div>
          <Button variant="primary" disabled={running} onClick={() => start.mutate()}>
            <RefreshCw className={running ? "spin" : ""} />
            {running ? "Syncing…" : "Sync now"}
          </Button>
        </div>
        {running && state && state.total > 0 && (
          <div className="progress-track" role="progressbar" aria-label="Sync progress" aria-valuenow={state.done} aria-valuemin={0} aria-valuemax={state.total}>
            <span style={{ width: `${(state.done / state.total) * 100}%` }} />
          </div>
        )}
        {state && state.results.length > 0 && (
          <ul className="sync-results">
            {state.results.map((result) => (
              <li key={result.id} className={result.ok ? "" : "failed"}>
                {result.ok ? <Check /> : <AlertCircle />}
                <span>{result.name}</span>
                <small>{result.ok ? "Updated" : result.message}</small>
              </li>
            ))}
          </ul>
        )}
        <AddonStatus />
        <ManualImport />
      </div>
    </Sheet>
  );
}

/** Only for people who already have an export file; everyone else never needs this */
function ManualImport() {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState("");
  const client = useQueryClient();
  const paste = useMutation({
    mutationFn: () => api.importText({ text }),
    onSuccess: (result) => { setReport(result); setError(""); void client.invalidateQueries(); notify(`${result.imported.length} characters imported`); },
    onError: (e) => setError(errorMessage(e)),
  });
  async function chooseFile() {
    try {
      const result = await api.chooseImportFile();
      if (result) { setReport(result); setError(""); void client.invalidateQueries(); notify("File imported"); }
    } catch (e) { setError(errorMessage(e)); }
  }
  async function chooseWatch() {
    try {
      if (await api.chooseWatchFile()) { void client.invalidateQueries(); notify("Saved game data connected"); }
    } catch (e) { setError(errorMessage(e)); }
  }
  return (
    <div className="sync-manual">
      <button type="button" className="sync-manual-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ChevronRight className={open ? "open" : ""} />
        Import from a file instead
      </button>
      {open && (
        <div className="form-stack">
          <p className="muted small">Most people never need this. Use it only if you were given an export file or the automatic connection can't find your game</p>
          <div className="actions">
            <Button onClick={() => void chooseFile()}><Upload />Choose a file</Button>
            <Button onClick={() => void chooseWatch()}><RefreshCw />Pick the saved data file</Button>
          </div>
          <Field label="Or paste an export" hint="Paste what the addon's /wowcompanion window shows">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Paste exported character data" spellCheck={false} />
          </Field>
          <Button disabled={!text.trim() || paste.isPending} onClick={() => paste.mutate()}>
            <Upload />
            {paste.isPending ? "Importing…" : "Import pasted export"}
          </Button>
          {error && <p className="error small" role="alert">{error}</p>}
          {report && (
            <div className="import-report" role="status">
              <strong>Import complete</strong>
              <span>{report.imported.length} imported · {report.unchanged.length} unchanged · {report.errors.length} problems</span>
              {report.errors.length > 0 && <ul>{report.errors.map((e, i) => <li key={i}>{e.recordKey}: {e.reason}</li>)}</ul>}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
