import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { Check, CircleDashed, Copy, ExternalLink, FolderSearch, KeyRound, LoaderCircle, LogIn, Plug, RefreshCw, Users } from "lucide-react";
import { AppSelect } from "../../components/AppSelect";
import { Toggle } from "../../components/ui/toggle";
import { Badge, Button, Field, Sheet } from "../../components/ui/primitives";
import { api, type BlizzardRegion } from "../../lib/client";
import { errorMessage, notify } from "../../lib/notify";
import "./connections.css";

export const regionOptions = [
  { value: "us", label: "Americas and Oceania" },
  { value: "eu", label: "Europe" },
  { value: "kr", label: "Korea" },
  { value: "tw", label: "Taiwan" },
] as const;

export function useConnections() {
  return useQuery({ queryKey: ["connections"], queryFn: () => api.connectionsStatus(), refetchInterval: (query) => (query.state.data?.gameData.state === "indexing" ? 1000 : false) });
}

function useRun<I = void, T = unknown>(action: (input: I) => Promise<T>, success?: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: action, onSuccess: () => { void client.invalidateQueries(); if (success) notify(success); }, onError: (error) => notify(errorMessage(error)) });
}

function gameDataText(state: string | undefined, progress?: { step: string; done: number; total: number } | null, count?: number) {
  if (state === "ready") return `${(count ?? 0).toLocaleString()} items ready to search`;
  if (state === "indexing") return `${progress?.step ?? "Preparing"} (${(progress?.done ?? 0) + 1} of ${progress?.total ?? 7})`;
  if (state === "error") return "Item data could not be prepared";
  if (state === "not-indexed") return "Item data hasn't been prepared yet";
  return "Needs World of Warcraft on this computer";
}

/** Find WoW, prepare items, install the addon, connect Blizzard, sign in */
export function ConnectionsSection() {
  const status = useConnections();
  const detect = useRun(() => api.detectInstall());
  const rebuild = useRun(() => api.rebuildItemData(), "Item data prepared");
  const install = useRun(() => api.installAddon(), "Companion addon installed");
  const remove = useRun(() => api.removeAddon(), "Companion addon removed");
  const [confirmRemove, setConfirmRemove] = useState(false);
  const useAccount = useRun((account: string) => api.useSavedVariables(account), "Addon data connected");
  const clearKey = useRun(() => api.clearBlizzardKey(), "Blizzard key removed");
  const signOut = useRun(() => api.signOutBattlenet(), "Signed out of Battle.net");
  const [keyOpen, setKeyOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const data = status.data;
  const game = data?.gameData;
  async function chooseFolder() {
    try { const result = await api.chooseWowFolder(); if (result) notify(result.install ? `Found World of Warcraft ${result.install.version}` : "That folder does not contain World of Warcraft"); } catch (error) { notify(errorMessage(error)); }
  }
  return (
    <section className="settings-section" aria-labelledby="connections-heading">
      <h2 id="connections-heading">Connections</h2>
      <p>Where WOW Companion gets your characters, gear, and item details</p>
      <div className="settings-section-body surface">
        <div className="setting-row">
          <div>
            <h3>World of Warcraft</h3>
            <p>{game?.install ? `Version ${game.install.version} · ${game.install.root}` : "Item search, icons, and 3D previews read the game installed on this computer"}</p>
          </div>
          <div className="actions">
            {game?.install ? <Badge tone="green">Found</Badge> : null}
            <Button disabled={detect.isPending} onClick={() => detect.mutate()}><FolderSearch />{game?.install ? "Find again" : detect.isPending ? "Looking…" : "Find automatically"}</Button>
            {window.companion && <Button onClick={() => void chooseFolder()}>Choose folder</Button>}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Item data</h3>
            <p aria-live="polite">{gameDataText(game?.state, game?.progress, game?.itemCount)}</p>
            {game?.state === "indexing" && game.progress && <div className="connection-progress" role="progressbar" aria-label="Preparing item data" aria-valuemin={0} aria-valuemax={game.progress.total} aria-valuenow={game.progress.done}><span style={{ width: `${((game.progress.done + 1) / game.progress.total) * 100}%` }} /></div>}
            {game?.error && <p className="error small" role="alert">{game.error}</p>}
          </div>
          <Button disabled={!game?.install || game.state === "indexing" || rebuild.isPending} onClick={() => rebuild.mutate()}><RefreshCw />{game?.state === "ready" ? "Prepare again" : "Prepare item data"}</Button>
        </div>
        <div className="setting-row">
          <div>
            <h3>Companion addon</h3>
            <p>{!data?.addon ? "Find World of Warcraft first" : data.addon.state === "not-installed" ? "Reads your exact Great Vault, lockouts, and gear every time you log out or type /reload" : data.addon.state === "update-available" ? `Version ${data.addon.bundledVersion} is ready to install` : `Version ${data.addon.installedVersion} installed${data.addonWatching ? ` · reading account ${data.addonWatching}` : ""}`}</p>
          </div>
          <div className="actions">
            {data?.addon && data.addon.savedVariables.length > 1 && (
              <AppSelect aria-label="WoW account" value={data.addonWatching ?? ""} onValueChange={(account) => useAccount.mutate(account)} options={data.addon.savedVariables.map((entry) => ({ value: entry.account, label: entry.account }))} />
            )}
            {data?.addon && data.addon.state !== "installed" && <Button variant="primary" disabled={install.isPending} onClick={() => install.mutate()}><Plug />{data.addon.state === "update-available" ? "Update addon" : "Install addon"}</Button>}
            {data?.addon?.state === "installed" && data.addon.savedVariables.length === 1 && !data.addonWatching && <Button onClick={() => useAccount.mutate(data.addon!.savedVariables[0]!.account)}>Read addon data</Button>}
            {data?.addon?.state === "installed" && <Badge tone="green">Installed</Badge>}
            {data?.addon && data.addon.state !== "not-installed" && (confirmRemove
              ? (<><Button variant="primary" disabled={remove.isPending} onClick={() => remove.mutate(undefined, { onSettled: () => setConfirmRemove(false) })}>{remove.isPending ? "Removing…" : "Remove addon"}</Button><Button variant="quiet" onClick={() => setConfirmRemove(false)}>Keep</Button></>)
              : <Button variant="quiet" onClick={() => setConfirmRemove(true)}>Remove</Button>)}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Blizzard data</h3>
            <p>{data?.blizzard.configured ? `Connected with your key ${data.blizzard.clientIdHint} · ${regionOptions.find((option) => option.value === data.blizzard.region)?.label}` : "Official character pictures, gear, appearance, and ratings, using a free key from Blizzard"}</p>
          </div>
          <div className="actions">
            {data?.blizzard.configured ? (<><Button onClick={() => setKeyOpen(true)}>Replace key</Button><Button variant="quiet" disabled={clearKey.isPending} onClick={() => clearKey.mutate()}>Remove</Button></>) : <Button variant="primary" onClick={() => setKeyOpen(true)}><KeyRound />Connect</Button>}
          </div>
        </div>
        <div className="setting-row">
          <div>
            <h3>Battle.net account</h3>
            <p>{data?.battlenet.signedIn ? `Signed in as ${data.battlenet.battletag ?? "your account"}` : data?.blizzard.configured ? "Sign in to list every character on your account" : "Connect Blizzard data first"}</p>
          </div>
          <div className="actions">
            {data?.battlenet.signedIn ? (<><Button onClick={() => setImportOpen(true)}><Users />Import characters</Button><Button variant="quiet" onClick={() => signOut.mutate()}>Sign out</Button></>) : <Button disabled={!data?.blizzard.configured} onClick={() => setImportOpen(true)}><LogIn />Sign in</Button>}
          </div>
        </div>
        {data && !data.blizzard.persistent && <div className="help-box">This development session keeps keys in memory only. The desktop app protects saved keys with your operating system</div>}
      </div>
      <BlizzardKeySheet open={keyOpen} onOpenChange={setKeyOpen} redirectUri={data?.redirectUri ?? ""} />
      <BattlenetImportSheet open={importOpen} onOpenChange={setImportOpen} />
    </section>
  );
}

function CopyField({ label, value }: { label: string; value: string }) {
  return (
    <div className="copy-field">
      <span>{label}</span>
      <code>{value}</code>
      <Button variant="icon" aria-label={`Copy ${label.toLowerCase()}`} onClick={() => void navigator.clipboard.writeText(value).then(() => notify(`${label} copied`), () => notify("Copy failed, select the text instead"))}><Copy /></Button>
    </div>
  );
}

/** Walks a non-technical player through creating a free Blizzard API client */
export function BlizzardKeySheet({ open, onOpenChange, redirectUri, onConnected }: { open: boolean; onOpenChange: (open: boolean) => void; redirectUri: string; onConnected?: () => void }) {
  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [region, setRegion] = useState<BlizzardRegion>("us");
  const [error, setError] = useState("");
  const client = useQueryClient();
  const save = useMutation({
    mutationFn: () => api.setBlizzardKey({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), region }),
    onSuccess: () => { void client.invalidateQueries(); setClientSecret(""); setError(""); notify("Blizzard data connected"); onOpenChange(false); onConnected?.(); },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet open={open} onOpenChange={onOpenChange} title="Connect Blizzard data" description="Blizzard gives every player a free key for reading game data. It takes about two minutes">
      <form className="form-stack" onSubmit={(event) => { event.preventDefault(); setError(""); save.mutate(); }}>
        <ol className="guide-steps">
          <li>
            <strong>Open the Blizzard developer site and sign in</strong>
            <span>Use the same Battle.net account you play with</span>
            <Button type="button" onClick={() => void api.openExternal("https://develop.battle.net/access/clients").catch((e) => notify(errorMessage(e)))}><ExternalLink />Open Blizzard developer site</Button>
          </li>
          <li>
            <strong>Choose Create client and fill in these details</strong>
            <CopyField label="Client name" value="WOW Companion" />
            <CopyField label="Redirect URL" value={redirectUri} />
            <span>Tick "I do not have a service URL for this client", describe it as a personal character planner, then save</span>
          </li>
          <li>
            <strong>Copy the Client ID and Client Secret here</strong>
            <span>Your key stays on this computer and is protected by Windows</span>
          </li>
        </ol>
        <Field label="Client ID"><input value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" spellCheck={false} required placeholder="Paste your Client ID" /></Field>
        <Field label="Client Secret"><input type="password" value={clientSecret} onChange={(e) => setClientSecret(e.target.value)} autoComplete="off" spellCheck={false} required placeholder="Paste your Client Secret" /></Field>
        <Field label="Region you play in"><AppSelect label="Region you play in" value={region} onValueChange={(value) => setRegion(value as BlizzardRegion)} options={regionOptions} /></Field>
        {error && <p className="error small" role="alert">{error}</p>}
        <Button variant="primary" type="submit" disabled={save.isPending || !clientId.trim() || !clientSecret.trim()}>{save.isPending ? <><LoaderCircle className="spin" />Checking key…</> : <><Check />Connect</>}</Button>
      </form>
    </Sheet>
  );
}

/** Battle.net sign-in through the system browser, then a pick list of the account's characters */
export function BattlenetImportSheet({ open, onOpenChange, onImported }: { open: boolean; onOpenChange: (open: boolean) => void; onImported?: () => void }) {
  const status = useConnections();
  const client = useQueryClient();
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"idle" | "waiting" | "choose">("idle");
  const [error, setError] = useState("");
  const [chosen, setChosen] = useState<Set<string>>(new Set());
  const cancelled = useRef(false);
  const signedIn = status.data?.battlenet.signedIn ?? false;
  const characters = useQuery({ queryKey: ["account-characters"], queryFn: () => api.accountCharacters(), enabled: open && signedIn && phase !== "waiting" });
  useEffect(() => { if (open) { setError(""); setPhase(signedIn ? "choose" : "idle"); cancelled.current = false; } }, [open, signedIn]);
  useEffect(() => { if (characters.data && chosen.size === 0) setChosen(new Set(characters.data.filter((c) => (c.level ?? 0) >= 70).map((c) => `${c.name}|${c.realm}`))); }, [characters.data, chosen.size]);
  async function signIn() {
    setError(""); cancelled.current = false;
    try {
      const { url } = await api.beginBattlenetSignIn();
      setPhase("waiting");
      await api.openExternal(url);
      await api.completeBattlenetSignIn();
      if (cancelled.current) return;
      void client.invalidateQueries();
      setPhase("choose");
    } catch (e) { if (!cancelled.current) { setError(errorMessage(e)); setPhase("idle"); } }
  }
  const importMutation = useMutation({
    mutationFn: () => api.importAccountCharacters([...chosen].map((key) => { const [name, realm] = key.split("|"); return { name: name!, realm: realm! }; })),
    onSuccess: (result) => {
      void client.invalidateQueries();
      notify(result.failed.length ? `${result.imported.length} imported · ${result.failed.length} could not be read` : `${result.imported.length} characters imported`);
      if (result.failed.length) setError(result.failed.map((f) => `${f.name}: ${f.reason}`).join(" · "));
      else { onOpenChange(false); onImported?.(); void navigate({ to: "/characters" }); }
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next && phase === "waiting") { cancelled.current = true; void api.cancelBattlenetSignIn(); } onOpenChange(next); }} title="Your Battle.net characters" description="Sign in once to choose which characters to track">
      <div className="form-stack">
        {phase !== "choose" && (
          <>
            <p className="secondary small">Your browser opens Blizzard's sign-in page. After you approve, come back here. WOW Companion only asks to read your character list</p>
            <Button variant="primary" disabled={phase === "waiting" || !status.data?.blizzard.configured} onClick={() => void signIn()}>{phase === "waiting" ? <><LoaderCircle className="spin" />Waiting for Battle.net…</> : <><LogIn />Sign in with Battle.net</>}</Button>
            {phase === "waiting" && <Button variant="quiet" onClick={() => { cancelled.current = true; void api.cancelBattlenetSignIn(); setPhase("idle"); }}>Cancel</Button>}
          </>
        )}
        {phase === "choose" && (
          characters.isPending ? <p className="muted">Loading your characters…</p> : characters.isError ? <p className="error small" role="alert">{errorMessage(characters.error)}</p> : (
            <>
              <div className="account-list" role="group" aria-label="Characters to import">
                {characters.data?.map((c) => {
                  const key = `${c.name}|${c.realm}`;
                  const on = chosen.has(key);
                  return (
                    <Toggle key={key} type="button" variant="outline" className="account-choice" pressed={on} onPressedChange={(pressed) => setChosen((previous) => { const next = new Set(previous); if (pressed) next.add(key); else next.delete(key); return next; })} aria-label={`${on ? "Remove" : "Import"} ${c.name}`}>
                      <span className="account-check">{on ? <Check size={13} /> : null}</span>
                      <span className="account-text"><strong>{c.name}</strong><small>{[c.level ? `Level ${c.level}` : null, c.raceName, c.className, c.realm].filter(Boolean).join(" · ")}</small></span>
                    </Toggle>
                  );
                })}
              </div>
              <Button variant="primary" disabled={!chosen.size || importMutation.isPending} onClick={() => importMutation.mutate()}>{importMutation.isPending ? <><LoaderCircle className="spin" />Importing…</> : `Import ${chosen.size} ${chosen.size === 1 ? "character" : "characters"}`}</Button>
            </>
          )
        )}
        {error && <p className="error small" role="alert">{error}</p>}
      </div>
    </Sheet>
  );
}

type StepState = "done" | "current" | "todo";
function Step({ state, title, description, children }: { state: StepState; title: string; description: string; children?: React.ReactNode }) {
  return (
    <li className={`setup-step setup-step-${state}`}>
      <span className="setup-mark" aria-hidden="true">{state === "done" ? <Check size={14} /> : <CircleDashed size={14} />}</span>
      <div className="setup-step-body">
        <h2>{title}<span className="sr-only">{state === "done" ? " (done)" : ""}</span></h2>
        <p>{description}</p>
        {children && <div className="actions">{children}</div>}
      </div>
    </li>
  );
}

/** First-run setup: each step can be skipped, and everything stays reachable from Settings */
export function SetupPage({ onAddByName }: { onAddByName: () => void }) {
  const status = useConnections();
  const navigate = useNavigate();
  const client = useQueryClient();
  const detect = useRun(() => api.detectInstall());
  const install = useRun(() => api.installAddon(), "Companion addon installed");
  const [keyOpen, setKeyOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const detectedOnce = useRef(false);
  const data = status.data;
  useEffect(() => { if (data && !data.gameData.install && !detectedOnce.current) { detectedOnce.current = true; detect.mutate(); } }, [data, detect]);
  const finish = async () => { await api.saveSettings({ setupDismissed: true }); void client.invalidateQueries(); void navigate({ to: "/characters" }); };
  const game = data?.gameData;
  const wowState: StepState = game?.install ? "done" : "current";
  const addonState: StepState = data?.addon?.state === "installed" ? "done" : game?.install ? "current" : "todo";
  const keyState: StepState = data?.blizzard.configured ? "done" : game?.install ? "current" : "todo";
  return (
    <div className="setup-page">
      <div className="page-heading">
        <div>
          <h1>Set up WOW Companion</h1>
          <p>Connect your game once and your characters, gear, and items stay up to date</p>
        </div>
        <Button variant="quiet" onClick={() => void finish()}>Skip for now</Button>
      </div>
      <ol className="setup-steps">
        <Step state={wowState} title={game?.install ? `World of Warcraft ${game.install.version} found` : "Find World of Warcraft"} description={game?.install ? gameDataText(game.state, game.progress, game.itemCount) : detect.isPending ? "Looking in the usual places…" : "We couldn't find it automatically. Choose the folder that contains _retail_"}>
          {!game?.install && <Button onClick={() => detect.mutate()} disabled={detect.isPending}><FolderSearch />Look again</Button>}
          {!game?.install && window.companion && <Button onClick={() => void api.chooseWowFolder().then(() => client.invalidateQueries()).catch((e) => notify(errorMessage(e)))}>Choose folder</Button>}
        </Step>
        <Step state={addonState} title="Install the companion addon" description={data?.addon?.state === "installed" ? "Installed. Log in to each character once, then type /reload or log out to record their gear" : "The addon records your exact equipped gear whenever you log out or type /reload"}>
          {data?.addon && data.addon.state !== "installed" && <Button variant="primary" disabled={install.isPending} onClick={() => install.mutate()}><Plug />{data.addon.state === "update-available" ? "Update addon" : "Install addon"}</Button>}
        </Step>
        <Step state={keyState} title="Connect Blizzard data (optional)" description={data?.blizzard.configured ? "Connected. Official character pictures, gear, and ratings will load automatically" : "Adds official character pictures, appearance, and ratings, and lets you sign in to import every character"}>
          {!data?.blizzard.configured && <Button onClick={() => setKeyOpen(true)}><KeyRound />Connect Blizzard data</Button>}
        </Step>
        <Step state="current" title="Add your characters" description="Import them from Battle.net, add one by name, or explore with fictional demo characters">
          <Button variant="primary" disabled={!data?.blizzard.configured} onClick={() => setImportOpen(true)}><Users />Import from Battle.net</Button>
          <Button onClick={onAddByName}>Add by name</Button>
          <Link to="/characters" className="button button-quiet" onClick={() => void api.saveSettings({ setupDismissed: true })}>Go to your roster</Link>
        </Step>
      </ol>
      <BlizzardKeySheet open={keyOpen} onOpenChange={setKeyOpen} redirectUri={data?.redirectUri ?? ""} />
      <BattlenetImportSheet open={importOpen} onOpenChange={setImportOpen} onImported={() => void api.saveSettings({ setupDismissed: true })} />
    </div>
  );
}
