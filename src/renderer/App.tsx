import { useCallback, useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from "react";
import { transparentPortrait } from "./lib/portrait";
import { version as appVersion } from '../../package.json';
import { appIconChoices, appIconFiles, resolveAppIcon, type AppIconPreference } from '../shared/app-icons';
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRootRoute,
  createHashHistory,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  Link,
  useBlocker,
  useNavigate,
  useParams,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import {
  Archive,
  Backpack,
  ArrowDownUp,
  ArrowLeft,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronsUpDown,
  CircleHelp,
  Crown,
  Download,
  ExternalLink,
  FlaskConical,
  FileText,
  History,
  Info,
  Menu,
  NotebookPen,
  Plus,
  RefreshCw,
  Search,
  Save,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Target,
  TrendingUp,
  Upload,
  Users,
  WandSparkles,
} from "lucide-react";
import { api, type BlizzardRegion } from "./lib/client";
import { assetUrl } from "./lib/assets";
import { errorMessage, notify } from "./lib/notify";
import { Term } from "./components/Term";
import { LeaveGuard } from "./components/LeaveGuard";
import { ItemHoverCard } from "./features/items/ItemHoverCard";
import { GearSlotIcon } from "./components/GearSlotIcon";
import { EnhancementSelect } from "./features/items/EnhancementSelect";
import { ItemIcon, ItemSearchDialog, SearchButton, useGameData, useItemSearchShortcut } from "./features/items/items";
import { ConnectionsSection, SetupPage, regionOptions, useConnections } from "./features/connections/connections";
import { addItemToPlan, gearMemory, subscribeGearPlan } from "./lib/plan-item";
import { clearRenamedPlanIdentity, isPlannedItemEquipped } from "./lib/gear-plan-match";
import { CharacterWeek, StatsSurface, WeekPage } from "./features/week/week";
import { ComparisonPage, type ComparisonView } from "./features/comparisons/ComparisonPage";
import { TopPlayersPage } from "./features/top/top-players";
import { useStagePlan } from "./features/plan/StagePlan";
import { vaultTracks } from "../shared/weekly";
import { ProgressionPage, ProgressionSummary, useSeasonCeiling } from "./features/progression/progression";
import { TonightPage } from "./features/tonight/TonightPage";
import { SimulationsPage } from "./features/simulations/SimulationsPage";
import { WardrobePage } from "./features/outfits/WardrobePage";
import { UpdateSettings } from "./features/updates/UpdateSettings";
import { UpdateButton } from "./features/updates/UpdateButton";
import { useUpdateBlocker, useUpdateSafety } from "./lib/update-safety";
import {
  defaultDestination,
  destinationLabel,
  destinationPath,
  gearViewLabels,
  gearViews,
  performanceViewLabels,
  performanceViews,
  resolveCharacterPath,
  safeReturn,
  sameDestinationFor,
  sectionLabels,
  type CharacterDestination,
  type CharacterSection,
} from "./lib/destinations";
import { InventoryPage } from "./features/inventory/InventoryPage";
import {ProviderSettings} from './features/comparisons/ProviderSettings';
import { comparePlanCompletion } from "../shared/plan-completion";
import { SyncButton, SyncSheet, useSyncOnFocus } from "./features/sync/sync";
import { AppSelect } from "./components/AppSelect";
import { Toggle } from "./components/ui/toggle";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "./components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "./components/ui/tooltip";
import { DEFAULT_SIDEBAR_WIDTH, useSidebarLayout } from "./components/SidebarResize";
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from "./components/ui/resizable";
import {
  Badge,
  Button,
  CharacterPopover,
  EmptyState,
  Field,
  Sheet,
} from "./components/ui/primitives";
import type {
  Activity,
  ActivityRating,
  AddCharacterInput,
  Character,
  GearDraft,
  GearItem,
  GearSlot,
  ImportReport,
} from "../shared/domain";
import "./style.css";
import "./sidebar-settings.css";
import "./navigation.css";
import "./app-accent.css";
import "./overview.css";
import "./gear-polish.css";

const gearViewIcons: Record<string, typeof Shield> = { progress: TrendingUp, plan: NotebookPen, owned: Backpack, simulations: FlaskConical };
const performanceViewIcons: Record<string, typeof Shield> = { standing: Trophy, leaders: Crown, history: History, reports: FileText };

const activityNames: Record<Activity, string> = {
  mythicPlus: "Mythic+",
  raiding: "Raiding",
  pvp: "PvP",
};
const metricNames: Record<Activity, string> = {
  mythicPlus: "M+ rating",
  raiding: "Raid progress",
  pvp: "PvP rating",
};
const slotNames: Record<string, string> = {
  head: "Head",
  neck: "Neck",
  shoulder: "Shoulder",
  shoulderLeft: "Left shoulder",
  shoulderRight: "Right shoulder",
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
  shirt: "Shirt",
  tabard: "Tabard",
};
const characterSections: Array<{ id: CharacterSection; label: string; icon: typeof Shield }> = [
  { id: "overview", label: "Overview", icon: Shield },
  { id: "gear", label: "Gear", icon: WandSparkles },
  { id: "performance", label: "Performance", icon: Trophy },
  { id: "wardrobe", label: "Wardrobe", icon: Star },
];
const allSlots: GearSlot[] = [
  "head",
  "neck",
  "shoulder",
  "back",
  "chest",
  "wrist",
  "hands",
  "waist",
  "legs",
  "feet",
  "finger1",
  "finger2",
  "trinket1",
  "trinket2",
  "mainHand",
  "offHand",
];

function level(value: number | null | undefined) {
  return value == null ? "Unknown" : value.toFixed(1);
}
function count(value: number | null | undefined) {
  return value == null ? "Unknown" : value.toLocaleString();
}
function activityValue(rating: ActivityRating | null | undefined, activity: Activity) {
  if (!rating) return "Unknown";
  return activity === "raiding" || rating.value == null
    ? rating.label
    : rating.value.toLocaleString(undefined, { maximumFractionDigits: 1 });
}
function ExternalSource({ url, children }: { url: string | null | undefined; children: string }) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    if (
      parsed.protocol !== "https:" ||
      ![
        "raider.io",
        "www.wowhead.com",
        "worldofwarcraft.blizzard.com",
        "www.warcraftlogs.com",
      ].includes(parsed.hostname)
    )
      return null;
  } catch {
    return null;
  }
  return (
    <Button
      variant="quiet"
      onClick={() => void api.openExternal(url).catch((error) => notify(errorMessage(error)))}
    >
      <ExternalLink />
      {children}
    </Button>
  );
}
function age(value: string | null | undefined) {
  if (!value) return "Not observed";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 1440) return `${Math.floor(minutes / 60)} hr ago`;
  const days = Math.floor(minutes / 1440);
  return `${days} ${days === 1 ? "day" : "days"} ago`;
}
function Known({ children }: { children: string }) {
  return children === "Unknown" ? <span className="muted">Unknown</span> : <>{children}</>;
}
function spec(character: Character) {
  return `${character.specName === "Unknown" ? "" : character.specName + " "}${character.className}`;
}
function ActivityTabs({
  value,
  onChange,
}: {
  value: Activity;
  onChange: (value: Activity) => void;
}) {
  return (
    <div className="segments" aria-label="Activity">
      {Object.entries(activityNames).map(([key, label]) => (
        <button key={key} aria-pressed={value === key} onClick={() => onChange(key as Activity)}>
          {label}
        </button>
      ))}
    </div>
  );
}
function Avatar({ character, large = false }: { character: Character; large?: boolean }) {
  const source = assetUrl(character.renders?.main);
  const [portrait, setPortrait] = useState<{ source: string; image: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (source) void transparentPortrait(source).then((image) => { if (active) setPortrait(image ? { source, image } : null); });
    return () => { active = false; };
  }, [source]);
  const image = portrait?.source === source ? portrait.image : null;
  return (
    <span className={`avatar ${large ? "large" : ""} ${image ? "has-image" : ""}`} aria-hidden="true">
      {image ? <img src={image} alt="" /> : character.name.slice(0, 1).toUpperCase()}
    </span>
  );
}
function Identity({ character }: { character: Character }) {
  return (
    <div className="identity">
      <strong>
        {character.name}
        {character.isMain && <span className="main-label">Main</span>}
      </strong>
      <small>{spec(character)}</small>
      <small>
        {character.region.toUpperCase()} · {character.realm}
      </small>
    </div>
  );
}
function DemoNotice({ character }: { character: Character }) {
  return character.demo ? (
    <div className="demo-notice">
      <Info />
      Fictional demo character · Gear, caps, ratings, and appearances are illustrative
    </div>
  ) : null;
}
function useRoster() {
  return useQuery({
    queryKey: ["characters"],
    queryFn: () => api.listCharacters(),
  });
}
function useSettings() {
  return useQuery({ queryKey: ["settings"], queryFn: () => api.getSettings() });
}
function useCharacter(id: string | undefined) {
  const roster = useRoster();
  return {
    ...roster,
    character: roster.data?.find((c) => c.id === id && !c.archived),
  };
}
function useAction<T>(action: (input: T) => Promise<unknown>, message?: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      void client.invalidateQueries();
      if (message) notify(message);
    },
    onError: (error) => notify(errorMessage(error)),
  });
}
function useActivity(characterId?: string) {
  const settings = useSettings();
  const save = useAction((activity: Activity) =>
    api.saveSettings(
      characterId
        ? {
            characterActivities: {
              ...settings.data?.characterActivities,
              [characterId]: activity,
            },
          }
        : { activity },
    ),
  );
  return {
    activity:
      (characterId ? settings.data?.characterActivities?.[characterId] : settings.data?.activity) ??
      ("mythicPlus" as Activity),
    setActivity: (a: Activity) => save.mutate(a),
  };
}
function Portrait({ character }: { character: Character }) {
  const render = assetUrl(character.renders?.main);
  if (render)
    return (
      <figure className="portrait-preview">
        <img src={render} alt={`${character.name} as rendered by Blizzard`} className="character-render" />
        <figcaption>Blizzard character render · {age(character.renders?.observedAt).toLowerCase()}</figcaption>
      </figure>
    );
  return character.demo && character.name === "Vaelith" ? (
    <figure className="portrait-preview">
      <img
        src={`${import.meta.env.BASE_URL}assets/frost-mage-concept.png`}
        alt="Generated fantasy mage concept illustration"
      />
      <figcaption>Concept illustration · Demo only</figcaption>
    </figure>
  ) : (
    <div className="portrait-preview empty-portrait">
      <Avatar character={character} large />
      <small className="muted">
        {character.raceName === "Unknown"
          ? "Character details awaiting import"
          : character.raceName}
      </small>
    </div>
  );
}
function Metrics({ character, planned, activity }: { character: Character; planned?: number | null; activity?: Activity }) {
  const own = useActivity(character.id).activity;
  const ceiling = useSeasonCeiling(character.id, activity ?? own);
  return (
    <div className="metric-strip">
      <div>
        <small>Equipped</small>
        <strong data-unknown={character.itemLevel == null}>{level(character.itemLevel)}</strong>
      </div>
      <div>
        <small>{planned == null ? "Target" : "Draft"}</small>
        <strong data-unknown={(planned ?? character.targetItemLevel) == null}>{level(planned ?? character.targetItemLevel)}</strong>
      </div>
      <div>
        <small>{ceiling.exact || ceiling.level == null ? "Legal max" : "Best known"}</small>
        <strong data-unknown={ceiling.level == null}>{level(ceiling.level)}</strong>
      </div>
    </div>
  );
}
function nextAction(character: Character, hasCeiling: boolean) {
  if (!character.observedAt)
    return {
      title: "Import a character snapshot",
      description: "Bring in your equipped gear and specialization before choosing upgrades",
    };
  const enchant = character.gear.find(
    (i) =>
      ["mainHand", "finger1", "finger2"].includes(i.slot) &&
      i.enchantCoverage === "complete" &&
      !i.enchant,
  );
  if (enchant)
    return {
      title: `Review your ${slotNames[enchant.slot].toLowerCase()} enchant`,
      description: "The imported slot has no enchant — check its current eligibility in game",
    };
  if (
    character.gear.some(
      (item) =>
        ["mainHand", "finger1", "finger2"].includes(item.slot) &&
        item.enchantCoverage !== "complete",
    )
  )
    return {
      title: "Check your enchant coverage",
      description:
        "This source does not establish whether every eligible slot is enchanted — import an addon snapshot or check in game",
    };
  if (!hasCeiling)
    return {
      title: "Establish your season gear ceiling",
      description: "A validated current ruleset is needed before calculating a legal maximum",
    };
  return {
    title: "Review your lowest item-level slot",
    description: "Inspect options in the planner and check their actual source in game",
  };
}
/** Weekly attention comes only from supported observations; unknown coverage is never counted as a warning */
function attention(character: Character): { label: string; tone: "amber" | "neutral" } | null {
  if (!character.observedAt) return { label: "Not observed", tone: "neutral" };
  const exact = vaultTracks(character.weekly, character.region).filter((track) => track.exact && track.slots.length);
  if (exact.length) {
    const total = exact.reduce((sum, track) => sum + track.slots.length, 0);
    const open = exact.reduce((sum, track) => sum + track.slots.filter((slot) => slot.unlocked).length, 0);
    if (open < total) return { label: `Vault ${open} of ${total}`, tone: "amber" };
  }
  return null;
}
function SelectedPane({ character, activity }: { character: Character; activity: Activity }) {
  const ceiling = useSeasonCeiling(character.id, activity);
  const action = nextAction(character, ceiling.level != null);
  const gap =
    ceiling.level != null && character.itemLevel != null
      ? Math.max(0, ceiling.level - character.itemLevel)
      : null;
  return (
    <aside className="selected-pane" aria-label={`${character.name} selected character`}>
      <div className="pane-heading">
        <div>
          <h2>{character.name}</h2>
          <p>
            {spec(character)}
            <br />
            {character.region.toUpperCase()} / {character.realm}
          </p>
        </div>
        <Badge tone="blue">Selected</Badge>
      </div>
      <Portrait character={character} />
      <Metrics character={character} activity={activity} />
      <div className="detail-list">
        <div className="detail-row">
          <span>{metricNames[activity]}</span>
          <strong>{activityValue(character.ratings[activity], activity)}</strong>
        </div>
        <div className="detail-row">
          <span>{ceiling.exact || ceiling.level == null ? "Gap to maximum" : "Gap to best known"}</span>
          <strong>{level(gap)}</strong>
        </div>
      </div>
      <ProgressionSummary character={character} activity={activity} />
      <div className="next-action">
        <h3>{action.title}</h3>
        <p>{action.description}</p>
      </div>
      <div className="pane-observation">Observed {age(character.observedAt).toLowerCase()}</div>
      <div className="pane-exits">
        <CharacterLink characterId={character.id} destination={{ section: "overview" }} className="button button-primary full-width">
          <ArrowRight size={14} />
          Open overview
        </CharacterLink>
        <CharacterLink characterId={character.id} destination={{ section: "gear", view: "progress" }} className="button full-width">
          Review gear
        </CharacterLink>
        <CharacterLink characterId={character.id} destination={{ section: "performance", view: "standing" }} className="button full-width">
          Compare performance
        </CharacterLink>
      </div>
    </aside>
  );
}
function CharacterLink({
  characterId,
  destination,
  returnTo,
  children,
  ...props
}: {
  characterId: string;
  destination: CharacterDestination;
  returnTo?: string;
  children: ReactNode;
} & Omit<ComponentProps<"a">, "href" | "children">) {
  const search = returnTo ? { return: returnTo } : {};
  return "view" in destination ? (
    <Link
      to="/characters/$characterId/$section/$view"
      params={{ characterId, section: destination.section, view: destination.view }}
      search={search}
      {...props}
    >
      {children}
    </Link>
  ) : (
    <Link
      to="/characters/$characterId/$section"
      params={{ characterId, section: destination.section }}
      search={search}
      {...props}
    >
      {children}
    </Link>
  );
}
function useDrawerNavigation(path: string, drawerMode: boolean) {
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => setOpen(false), [path, drawerMode]);
  useEffect(() => {
    if (open) drawer.current?.querySelector<HTMLElement>("a, button")?.focus();
    else if (wasOpen.current) menu.current?.focus();
    wasOpen.current = open;
  }, [open]);
  return { open, setOpen, menu, drawer };
}
function Shell() {
  useUpdateSafety();
  const roster = useRoster();
  const settings = useSettings();
  const appIcon = resolveAppIcon(settings.data?.appIcon ?? 'auto', appVersion);
  useEffect(() => {
    document.documentElement.dataset.appIcon = appIcon;
    const favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (favicon) favicon.href = `${import.meta.env.BASE_URL}assets/${appIconFiles[appIcon].logo}`;
    if (settings.data) void window.companion?.applyAppIcon().catch(error => notify(errorMessage(error)));
  }, [appIcon, settings.data?.appIcon]);
  const navigate = useNavigate();
  const route = useRouterState({ select: (s) => s.location });
  const currentPath = route.pathname;
  const firstRoute = useRef(true);
  useEffect(() => {
    document.querySelector(".workspace-scroll")?.scrollTo(0, 0);
    if (firstRoute.current) {
      firstRoute.current = false;
      return;
    }
    // A deliberate destination change moves focus to the new page heading for keyboard and screen reader users
    const frame = requestAnimationFrame(() => {
      const heading = document.querySelector<HTMLElement>("main h1");
      heading?.setAttribute("tabindex", "-1");
      heading?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [currentPath]);
  const match = currentPath.match(/^\/characters\/([^/]+)/);
  const selectedId =
    match?.[1] ??
    new URLSearchParams(route.searchStr).get("selected") ??
    settings.data?.lastCharacterId;
  const active = roster.data?.filter((c) => !c.archived) ?? [];
  const character =
    active.find((c) => c.id === selectedId) ?? active.find((c) => c.isMain) ?? active[0];
  const client = useQueryClient();
  useEffect(()=>{if(match?.[1]&&character?.id===match[1]&&settings.data&&settings.data.lastCharacterId!==character.id){void api.saveSettings({lastCharacterId:character.id}).then(()=>client.invalidateQueries({queryKey:['settings']}));}},[currentPath,character?.id,settings.data?.lastCharacterId]);
  const [sheet, setSheet] = useState<"add" | "sync" | "manage" | null>(null);
  useSyncOnFocus();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useItemSearchShortcut(openSearch);
  const { activity } = useActivity(character?.id);
  const [switchSearch, setSwitchSearch] = useState("");
  const saveSidebar = useAction((sidebarWidth: number) => api.saveSettings({ sidebarWidth }));
  const sidebar = useSidebarLayout(settings.data?.sidebarWidth, (width) =>
    saveSidebar.mutate(width),
  );
  const { stage, dialog: stageDialog } = useStagePlan();
  const drawerMode = sidebar.compact;
  const drawer = useDrawerNavigation(currentPath, drawerMode);
  useEffect(
    () =>
      api.subscribe(() => {
        void client.invalidateQueries();
      }),
    [client],
  );
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    function apply() {
      document.documentElement.dataset.theme =
        settings.data?.theme === "system" || !settings.data?.theme
          ? media.matches
            ? "dark"
            : "light"
          : settings.data.theme;
      document.documentElement.dataset.reducedMotion = String(
        settings.data?.reducedMotion ?? false,
      );
    }
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [settings.data]);
  const destination = match ? sameDestinationFor(currentPath) : null;
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => {
    const open = () => setSettingsOpen(true);
    window.addEventListener(openSettingsEvent, open);
    return () => window.removeEventListener(openSettingsEvent, open);
  }, []);
  const isSetup = currentPath === "/setup";
  const isWeek = currentPath === "/week";
  const isTonight = currentPath === "/tonight";
  const isRoster = currentPath === "/" || currentPath === "/characters";
  const changeCharacter = (id: string) => {
    void api.saveSettings({ lastCharacterId: id }).then(saved=>client.setQueryData(['settings'],saved));
    // Character pages keep their section and view; global pages stay where they are
    if (match && destination) void navigate({ to: destinationPath(id, destination) as never, search: {} as never });
    else if (isRoster) void navigate({ to: "/characters", search: { selected: id } });
  };
  const title = isTonight
    ? "Tonight"
    : isSetup
        ? "Setup"
        : isWeek
          ? "This week"
          : match
            ? `${character?.name ?? "Character"} · ${destination ? destinationLabel(destination) : "Not found"}`
            : "Characters";
  const sidebarNode = (
    <aside className="sidebar" id="workspace-sidebar" aria-label="Sidebar">
      <div className="brand">
        <img
          className="brand-logo"
          src={`${import.meta.env.BASE_URL}assets/${appIconFiles[appIcon].logo}`}
          alt=""
        />
        <span className="brand-name">WOW Companion</span>
      </div>
      <div className="nav-group-label">Workspace</div>
      <nav className="navigation" aria-label="Workspace">
        <Link
          to="/characters"
          search={{ selected: character?.id }}
          className={`nav-link ${isRoster ? "active" : ""}`}
          aria-current={isRoster ? "page" : undefined}
        >
          <Users />
          <span>Characters</span>
        </Link>
        <Link to="/tonight" className={`nav-link ${isTonight ? "active" : ""}`} aria-current={isTonight ? "page" : undefined}>
          <Sparkles /><span>Tonight</span>
        </Link>
        <Link
          to="/week"
          className={`nav-link ${isWeek ? "active" : ""}`}
          aria-current={isWeek ? "page" : undefined}
        >
          <CalendarClock />
          <span>This week</span>
        </Link>
      </nav>
      <div className="nav-group-label">Selected character</div>
      {character ? (
        <>
          <CharacterPopover
            resetKey={currentPath+route.searchStr}
            trigger={
              <button className="switcher" aria-label="Switch character">
                <Avatar character={character} />
                <div className="identity">
                  <strong>{character.name}</strong>
                  <small>{spec(character)} · {character.realm} {character.region.toUpperCase()}</small>
                </div>
                <ChevronsUpDown size={14} />
              </button>
            }
          >
            <label className="search-field switcher-search">
              <Search />
              <input
                value={switchSearch}
                onChange={(e) => setSwitchSearch(e.target.value)}
                placeholder="Find a character"
                aria-label="Find a character"
              />
            </label>
            {active
              .filter((c) =>
                `${c.name} ${c.realm} ${c.className}`
                  .toLowerCase()
                  .includes(switchSearch.toLowerCase()),
              )
              .map((c) => (
                <button
                  className={`switcher-choice ${c.id === character.id ? "active" : ""}`}
                  key={c.id}
                  onClick={() => changeCharacter(c.id)}
                >
                  <Avatar character={c} />
                  <Identity character={c} />
                  {c.id === character.id && <Check size={15} />}
                </button>
              ))}
            <Button variant="quiet" onClick={() => setSheet("add")}>
              <Plus />
              Add character
            </Button>
          </CharacterPopover>
          <nav className="navigation" aria-label="Selected character">
            {characterSections.map(({ id, label, icon: Icon }) => (
              <CharacterLink
                key={id}
                characterId={character.id}
                destination={defaultDestination(id)}
                className={`nav-link ${destination?.section === id ? "active" : ""}`}
                aria-current={destination?.section === id ? "page" : undefined}
              >
                <Icon />
                <span>{label}</span>
              </CharacterLink>
            ))}
          </nav>
        </>
      ) : (
        <button className="add-cta" onClick={() => setSheet("add")}>
          <Plus size={15} />
          Add a character to unlock Overview, Gear, Performance, and Wardrobe
        </button>
      )}
      <div className="sidebar-footer" role="group" aria-label="Workspace utilities">
        <SyncButton onClick={() => setSheet("sync")} />
        <UpdateButton onOpenSettings={openSettings} />
        <Tooltip>
          <TooltipTrigger
            render={
              <button
                type="button"
                className={`footer-icon ${settingsOpen ? "active" : ""}`}
                aria-label="Open settings"
                aria-haspopup="dialog"
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen(true)}
              />
            }
          >
            <Settings />
            <span className="footer-label" aria-hidden="true">Settings</span>
          </TooltipTrigger>
          <TooltipContent side="top">Settings</TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
  const workspaceNode = (
    <div className="workspace">
      <header className="toolbar" aria-label="Application title bar">
        <div className="breadcrumbs">
          {drawerMode && (
            <Button
              variant="icon"
              ref={drawer.menu}
              aria-label="Open navigation"
              aria-expanded={drawer.open}
              aria-controls="workspace-sidebar"
              onClick={() => drawer.setOpen((open) => !open)}
            >
              <Menu />
            </Button>
          )}
          <strong>{title}</strong>
        </div>
        <div className="toolbar-meta">
          <SearchButton onClick={openSearch} />
        </div>
      </header>
      <div className="workspace-scroll">
        <main className="page">
          <Outlet />
        </main>
      </div>
    </div>
  );
  return (
    <div className="app-shell" data-navigation={drawerMode ? "drawer" : "sidebar"}>
      {drawerMode ? (
        <>
          <div className="workspace-flat">{workspaceNode}</div>
          {drawer.open && <div className="drawer-scrim" onClick={() => drawer.setOpen(false)} aria-hidden="true" />}
          <div
            className={`navigation-drawer ${drawer.open ? "open" : ""}`}
            ref={drawer.drawer}
            inert={drawer.open ? undefined : true}
            role={drawer.open ? "dialog" : undefined}
            aria-modal={drawer.open ? true : undefined}
            aria-label="Navigation"
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.stopPropagation();
                drawer.setOpen(false);
              }
            }}
          >
            {sidebarNode}
          </div>
        </>
      ) : (
        <ResizablePanelGroup
          className="workspace-panels"
          orientation="horizontal"
          onLayoutChanged={sidebar.onLayoutChanged}
          resizeTargetMinimumSize={{ coarse: 24, fine: 12 }}
        >
          <ResizablePanel
            id="sidebar"
            panelRef={sidebar.panelRef}
            elementRef={sidebar.elementRef}
            defaultSize={sidebar.defaultSize}
            minSize={sidebar.minimum}
            maxSize={sidebar.maximum}
            groupResizeBehavior="preserve-relative-size"
            onResize={(size) =>
              document.documentElement.style.setProperty("--sidebar-chrome-width", `${size.inPixels}px`)
            }
          >
            {sidebarNode}
          </ResizablePanel>
          <ResizableHandle
            className="sidebar-resize-handle"
            aria-label="Resize sidebar"
            disableDoubleClick
            onDoubleClick={sidebar.reset}
          />
          <ResizablePanel id="workspace" minSize={0}>
            {workspaceNode}
          </ResizablePanel>
        </ResizablePanelGroup>
      )}
      <div className="sr-only" role="status" aria-live="polite">{title}</div>
      <AddCharacter open={sheet === "add"} onOpenChange={(o) => !o && setSheet(null)} />
      <SyncSheet open={sheet === "sync"} onOpenChange={(o) => !o && setSheet(null)} />
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      <ManagePanel open={sheet === "manage"} onOpenChange={(o) => !o && setSheet(null)} />
      <ItemSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        character={character}
        addLabel={character ? `Add to ${character.name}’s ${activityNames[activity]} plan` : undefined}
        onPick={(item) => {
          if (!character) {
            notify("Choose a character before adding items to a plan");
            return;
          }
          void stage({ character, activity, item });
        }}
      />
      {stageDialog}
    </div>
  );
}

function RosterPage() {
  const roster = useRoster();
  const settings = useSettings();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const selectedId =
    new URLSearchParams(location.searchStr).get("selected") ?? settings.data?.lastCharacterId;
  const [search, setSearch] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "favorite", desc: true }]);
  const { activity, setActivity } = useActivity();
  const [panel, setPanel] = useState<"add" | "manage" | null>(null);
  const update = useAction(api.updateCharacter);
  const characters = useMemo(
    () =>
      roster.data?.filter(
        (c) =>
          !c.archived &&
          `${c.name} ${c.realm} ${c.className} ${c.specName}`
            .toLowerCase()
            .includes(search.toLowerCase()),
      ) ?? [],
    [roster.data, search],
  );
  const active = roster.data?.filter((c) => !c.archived) ?? [];
  const character =
    active.find((c) => c.id === selectedId) ?? active.find((c) => c.isMain) ?? active[0];
  const columns = useMemo<ColumnDef<Character>[]>(
    () => [
      {
        accessorKey: "name",
        header: "Character",
        cell: ({ row }) => (
          <div className="table-identity">
            <Avatar character={row.original} />
            <Identity character={row.original} />
          </div>
        ),
      },
      {
        accessorKey: "itemLevel",
        header: "Item level",
        cell: ({ getValue }) => <Known>{level(getValue<number | null>())}</Known>,
        meta: { numeric: true },
      },
      {
        id: "targetGap",
        accessorFn: (c) =>
          c.itemLevel != null && c.targetItemLevel != null
            ? Math.max(0, c.targetItemLevel - c.itemLevel)
            : undefined,
        header: "To target",
        cell: ({ getValue }) => <Known>{level(getValue<number | undefined>())}</Known>,
        meta: { numeric: true, className: "roster-target" },
      },
      {
        id: "rating",
        accessorFn: (c) => c.ratings[activity]?.value ?? undefined,
        header: metricNames[activity],
        cell: ({ row }) => <Known>{activityValue(row.original.ratings[activity], activity)}</Known>,
        meta: { numeric: true },
      },
      {
        id: "attention",
        accessorFn: (c) => attention(c)?.label ?? "",
        header: "Attention",
        cell: ({ row }) => {
          const flag = attention(row.original);
          return flag ? <Badge tone={flag.tone}>{flag.label}</Badge> : <span className="muted">—</span>;
        },
      },
      {
        accessorKey: "observedAt",
        header: "Observed",
        cell: ({ getValue }) => age(getValue<string | null>()),
        meta: { className: "roster-observed" },
      },
      {
        id: "favorite",
        accessorFn: (c) => (c.isMain ? 2 : 0) + (c.favorite ? 1 : 0),
        header: "",
        cell: ({ row }) => (
          <Button
            variant="icon"
            className={`favorite ${row.original.favorite ? "active" : ""}`}
            aria-label={`${row.original.favorite ? "Unfavorite" : "Favorite"} ${row.original.name}`}
            onClick={(e) => {
              e.stopPropagation();
              update.mutate({
                id: row.original.id,
                patch: { favorite: !row.original.favorite },
              });
            }}
          >
            <Star size={16} />
          </Button>
        ),
      },
    ],
    [activity],
  );
  const table = useReactTable({
    data: characters,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });
  function select(c: Character) {
    void api.saveSettings({ lastCharacterId: c.id });
    void navigate({ to: "/characters", search: { selected: c.id } });
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Characters</h1>
          <p>
            {active.length
              ? `${active.length} Retail ${active.length === 1 ? "character" : "characters"} · Who needs attention, and how far each is from a maximum`
              : "Your Retail roster, gear goals, and next steps in one place"}
          </p>
        </div>
        <div className="actions">
          <Button onClick={() => setPanel("manage")}>
            <Settings />
            Manage roster
          </Button>
          <Button variant="primary" onClick={() => setPanel("add")}>
            <Plus />
            Add character
          </Button>
        </div>
      </div>
      {roster.isPending ? (
        <div className="loading-surface" role="status">
          Loading your local roster…
        </div>
      ) : roster.isError ? (
        <ErrorState error={roster.error} retry={() => void roster.refetch()} />
      ) : !active.length ? (
        <div className="surface">
          <EmptyState
            icon={Users}
            title="Bring your characters together"
            description="Connect your game once and WOW Companion finds your characters, gear, and items for you"
          >
            <Link className="button button-primary" to="/setup">
              <Sparkles />
              Set up WOW Companion
            </Link>
            <Button onClick={() => setPanel("add")}>
              <Plus />
              Add character
            </Button>
          </EmptyState>
        </div>
      ) : (
        <div className="roster-layout">
          <section>
            <div className="section-controls">
              <ActivityTabs value={activity} onChange={setActivity} />
              <label className="search-field">
                <Search />
                <input
                  placeholder="Find a character"
                  aria-label="Search roster"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  {table.getHeaderGroups().map((group) => (
                    <tr key={group.id}>
                      {group.headers.map((header) => {
                        const meta = header.column.columnDef.meta as
                          | { numeric?: boolean; className?: string }
                          | undefined;
                        return (
                          <th
                            key={header.id}
                            className={`${meta?.numeric ? "number" : ""} ${meta?.className ?? ""}`}
                          >
                            <button
                              onClick={header.column.getToggleSortingHandler()}
                              aria-label={
                                header.column.getCanSort()
                                  ? `Sort by ${typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : header.id}`
                                  : undefined
                              }
                            >
                              {flexRender(header.column.columnDef.header, header.getContext())}
                              {header.column.getIsSorted() && <ArrowDownUp size={12} />}
                            </button>
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody>
                  {table.getRowModel().rows.map((row) => (
                    <tr
                      key={row.id}
                      className={`selectable ${row.original.id === character?.id ? "selected" : ""}`}
                      onClick={() => select(row.original)}
                      onKeyDown={(e) => {
                        if (e.target !== e.currentTarget) return;
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          select(row.original);
                        }
                      }}
                      tabIndex={0}
                      aria-label={`Select ${row.original.name}`}
                    >
                      {row.getVisibleCells().map((cell) => {
                        const meta = cell.column.columnDef.meta as
                          | { numeric?: boolean; className?: string }
                          | undefined;
                        return (
                          <td
                            key={cell.id}
                            className={`${meta?.numeric ? "number" : ""} ${meta?.className ?? ""}`}
                          >
                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!characters.length && (
                <div className="inline-empty">No characters match “{search}”</div>
              )}
            </div>
            <div className="roster-footnote">
              <Info />
              <p>
                Every character keeps its own gear drafts, outfits, and activity comparisons
                {active.some((c) => c.demo) && (
                  <>
                    <br />
                    Demo characters and their progression values are fictional
                  </>
                )}
              </p>
            </div>
            <div className="roster-footer">
              <label className="select-inline">
                Sort by
                <AppSelect
                  aria-label="Sort roster"
                  value={sorting[0]?.id ?? "favorite"}
                  onValueChange={(value) => setSorting([{ id: value, desc: value !== "name" }])}
                  options={[
                    { value: "favorite", label: "Favorites first" },
                    { value: "name", label: "Name" },
                    { value: "itemLevel", label: "Item level" },
                    { value: "rating", label: "Activity metric" },
                  ]}
                />
              </label>
              <span>Observation times stay attached to each character</span>
            </div>
          </section>
          {character && <SelectedPane character={character} activity={activity} />}
        </div>
      )}
      <AddCharacter open={panel === "add"} onOpenChange={(o) => !o && setPanel(null)} />
      <ManagePanel open={panel === "manage"} onOpenChange={(o) => !o && setPanel(null)} />
    </>
  );
}
function ErrorState({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="error-surface" role="alert">
      <h2>This view could not load</h2>
      <p>{errorMessage(error)}</p>
      <Button onClick={retry}>
        <RefreshCw />
        Try again
      </Button>
    </div>
  );
}
function backLabel(path: string) {
  if (path === "/tonight") return "Back to Tonight";
  if (path === "/week") return "Back to This week";
  if (path.startsWith("/characters/")) return "Back to the previous screen";
  return "Back to Characters";
}
/** One consistent header for every character screen: identity, the single activity control, and real-link views */
function CharacterFrame({
  character,
  destination,
  children,
}: {
  character: Character;
  destination: CharacterDestination;
  children: ReactNode;
}) {
  const { activity, setActivity } = useActivity(character.id);
  const router = useRouter();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const back = safeReturn(new URLSearchParams(searchStr).get("return"));
  const section = destination.section;
  const views =
    section === "gear"
      ? gearViews.map((id) => ({ id, label: gearViewLabels[id] }))
      : section === "performance"
        ? performanceViews.map((id) => ({ id, label: performanceViewLabels[id] }))
        : null;
  const heading = section === "overview" ? character.name : `${sectionLabels[section]} for ${character.name}`;
  return (
    <>
      <DemoNotice character={character} />
      {back && (
        <Button variant="quiet" className="back-link" onClick={() => router.history.push(back)}>
          <ArrowLeft size={14} />
          {backLabel(back)}
        </Button>
      )}
      <div className="page-heading character-heading" data-section={section}>
        {section === "overview" && <Avatar character={character} large />}
        <div className="character-heading-text">
          <div className="crumb">{destinationLabel(destination)}</div>
          <h1>{heading}</h1>
          <p>
            {spec(character)} · {character.region.toUpperCase()} / {character.realm}
            {character.level != null ? ` · Level ${character.level}` : ""} · Observed {age(character.observedAt).toLowerCase()}
          </p>
        </div>
        {section !== "wardrobe" && <ActivityTabs value={activity} onChange={setActivity} />}
      </div>
      {views && "view" in destination && (
        <nav className="subnav" aria-label={`${sectionLabels[section]} views`}>
          {views.map(({ id, label }) => {
            const Icon = section === "gear" ? gearViewIcons[id] : section === "performance" ? performanceViewIcons[id] : null;
            return (
              <CharacterLink
                key={id}
                characterId={character.id}
                destination={{ section, view: id } as CharacterDestination}
                returnTo={back ?? undefined}
                className="subnav-link"
                aria-current={destination.view === id ? "page" : undefined}
              >
                {Icon && <Icon size={16} aria-hidden="true" />}
                <span>{label}</span>
              </CharacterLink>
            );
          })}
        </nav>
      )}
      {children}
    </>
  );
}
function CharacterRoute() {
  const params = useParams({ strict: false }) as { characterId: string; section: string; view?: string };
  const result = useCharacter(params.characterId);
  const navigate = useNavigate();
  const searchStr = useRouterState({ select: (s) => s.location.searchStr });
  const resolved = resolveCharacterPath(params.section, params.view);
  const redirect = resolved.kind === "redirect" ? destinationPath(params.characterId, resolved.destination) : null;
  useEffect(() => {
    if (!redirect) return;
    // Old links land on their new home with their return context intact, and never loop
    const back = safeReturn(new URLSearchParams(searchStr).get("return"));
    void navigate({ to: redirect as never, search: (back ? { return: back } : {}) as never, replace: true });
  }, [redirect, searchStr, navigate]);
  if (resolved.kind === "unknown")
    return (
      <EmptyState icon={CircleHelp} title="That page doesn't exist" description="Open this character's overview to continue">
        <Link
          className="button button-primary"
          to="/characters/$characterId/$section"
          params={{ characterId: params.characterId, section: "overview" }}
        >
          Open overview
        </Link>
      </EmptyState>
    );
  if (resolved.kind === "redirect") return null;
  if (result.isPending)
    return (
      <div className="loading-surface" role="status">
        Loading character…
      </div>
    );
  if (result.isError)
    return <ErrorState error={result.error} retry={() => void result.refetch()} />;
  if (!result.character)
    return (
      <EmptyState
        icon={Archive}
        title="Character unavailable"
        description="This character may have been archived or removed from this workspace"
      >
        <Link className="button button-primary" to="/characters">
          Return to roster
        </Link>
      </EmptyState>
    );
  const character = result.character;
  const destination = resolved.destination;
  const view = "view" in destination ? destination.view : null;
  return (
    <CharacterFrame key={character.id} character={character} destination={destination}>
      {destination.section === "overview" ? (
        <OverviewPage character={character} />
      ) : destination.section === "wardrobe" ? (
        <WardrobePage character={character} />
      ) : view === "progress" ? (
        <CharacterProgression character={character} />
      ) : view === "plan" ? (
        <GearPage character={character} />
      ) : view === "owned" ? (
        <InventoryPage character={character} />
      ) : view === "simulations" ? (
        <SimulationsRoute character={character} />
      ) : view === "leaders" ? (
        <LeadersView character={character} />
      ) : (
        <PerformanceView character={character} view={view as ComparisonView} />
      )}
    </CharacterFrame>
  );
}
function SimulationsRoute({ character }: { character: Character }) {
  const { activity } = useActivity(character.id);
  return <SimulationsPage character={character} activity={activity} />;
}
function CharacterProgression({ character }: { character: Character }) {
  const { activity } = useActivity(character.id);
  return <ProgressionPage character={character} activity={activity} />;
}
function PerformanceView({ character, view }: { character: Character; view: ComparisonView }) {
  const { activity } = useActivity(character.id);
  const refresh = useAction(({ id }: { id: string }) => api.refreshCharacter({ id }), "Public activity data refreshed");
  return (
    <ComparisonPage
      key={character.id + ":" + activity + ":" + view}
      character={character}
      activity={activity}
      view={view}
      actions={view === "standing" && (
        <Button disabled={refresh.isPending} onClick={() => refresh.mutate({ id: character.id })}>
          <RefreshCw />
          {refresh.isPending ? "Refreshing…" : "Refresh public profile"}
        </Button>
      )}
    />
  );
}
function LeadersView({ character }: { character: Character }) {
  const { activity } = useActivity(character.id);
  return (
    <>
      <TopPlayersPage key={character.id} character={character} />
      <ComparisonPage key={character.id + ":" + activity + ":leaders"} character={character} activity={activity} view="leaders" />
    </>
  );
}
function OverviewPage({ character }: { character: Character }) {
  const { activity } = useActivity(character.id);
  const refresh = useAction(
    ({ id }: { id: string }) => api.refreshCharacter({ id }),
    "Character refreshed",
  );
  const ceiling = useSeasonCeiling(character.id, activity);
  const action = nextAction(character, ceiling.level != null);
  const progress =
    character.itemLevel != null && ceiling.level != null
      ? Math.min(100, (character.itemLevel / ceiling.level) * 100)
      : null;
  const needsGear = character.gear.length === 0;
  return (
    <>
      <div className="overview-layout">
        <section className="surface character-surface">
          <div className="surface-heading">
            <h2>Your character</h2>
            <span className="character-build" title={character.gameBuild ? `Build ${character.gameBuild}` : 'Build unknown'}><Badge>{character.gameBuild ? `Build ${character.gameBuild}` : "Build unknown"}</Badge></span>
          </div>
          <Portrait character={character} />
          <dl className="source-bar">
            <div><dt>In-game observation</dt><dd>{age(character.observedAt)}</dd></div>
            <div><dt>Imported</dt><dd>{age(character.importedAt)}</dd></div>
          </dl>
          <Button disabled={refresh.isPending} onClick={() => refresh.mutate({ id: character.id })}>
            <RefreshCw />
            {refresh.isPending ? "Refreshing…" : "Refresh public profile"}
          </Button>
        </section>
        <div className="progress-section">
          <section className="surface overview-next-steps">
            <div className="surface-heading">
              <h2>Next steps</h2>
            </div>
            <div className="next-action-list">
              <div className="action-row">
                <Sparkles />
                <div>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                </div>
                <CharacterLink
                  characterId={character.id}
                  destination={{ section: "gear", view: "progress" }}
                  className="button button-primary"
                >
                  Review gear
                </CharacterLink>
              </div>
              {needsGear && (
                <div className="action-row">
                  <Upload />
                  <div>
                    <h3>Capture equipped gear in game</h3>
                    <p>Export with the addon, then reload the UI or log out to write SavedVariables</p>
                  </div>
                  <Link className="button" to="/setup">
                    Open setup
                  </Link>
                </div>
              )}
              <div className="action-row">
                <Crown />
                <div>
                  <h3>Compare with other {character.specName !== "Unknown" ? character.specName : ""} {character.className} players</h3>
                  <p>See the gear and builds the highest-rated players in your sample use</p>
                </div>
                <CharacterLink
                  characterId={character.id}
                  destination={{ section: "performance", view: "leaders" }}
                  className="button"
                >
                  Open leaders
                </CharacterLink>
              </div>
            </div>
          </section>
          <section className="surface overview-gear-gap">
            <div className="surface-heading">
              <h2>Gear gap</h2>
              <CharacterLink characterId={character.id} destination={{ section: "gear", view: "progress" }} className="button button-quiet">
                Review gear <ArrowRight size={14} />
              </CharacterLink>
            </div>
            <Metrics character={character} activity={activity} />
            {progress != null && (
              <>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label={ceiling.exact ? "Equipped item level compared with legal maximum" : "Equipped item level compared with the best known ceiling"}
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-label">
                  <span>{ceiling.exact ? "Item-level ratio" : "Ratio to best known ceiling"}</span>
                  <span>{progress.toFixed(1)}%</span>
                </div>
              </>
            )}
            {!ceiling.exact && (
              <div className="unknown-note">
                <CircleHelp />
                <p>
                  {ceiling.level == null
                    ? `The legal maximum is unknown: ${(ceiling.reason ?? "seasonal rules are still being checked").replace(/^./, (c) => c.toLowerCase())}`
                    : "This is the best known ceiling from the installed game files · Server-side conditions and crafted limits are not checked, so the true maximum may differ"}
                </p>
              </div>
            )}
            {character.targetItemLevel != null && (
              <p className="unknown-note">
                Your target is a planning goal, not a guaranteed drop or combat-performance estimate
              </p>
            )}
          </section>
          <section className="surface overview-standing">
            <div className="surface-heading">
              <h2>{activityNames[activity]} standing</h2>
              <CharacterLink characterId={character.id} destination={{ section: "performance", view: "standing" }} className="button button-secondary">
                Compare performance <ArrowRight size={14} />
              </CharacterLink>
            </div>
            <div className="detail-list">
              <div className="detail-row">
                <span>{metricNames[activity]}</span>
                <strong>{activityValue(character.ratings[activity], activity)}</strong>
              </div>
              <div className="detail-row">
                <span>{character.ratings[activity]?.rankScope ?? "Rank in source population"}</span>
                <strong>
                  {character.ratings[activity]?.rank
                    ? `#${count(character.ratings[activity]?.rank)}`
                    : "Unknown"}
                </strong>
              </div>
              <div className="detail-row">
                <span>Last activity observation</span>
                <strong>{age(character.ratings[activity]?.observedAt)}</strong>
              </div>
              <div className="detail-row">
                <span>Source</span>
                <strong>
                  {character.ratings[activity]?.source ??
                    (character.demo ? "Fictional demo" : "Not available")}
                </strong>
              </div>
            </div>
            <ExternalSource url={character.ratings[activity]?.sourceUrl}>
              Open source profile externally
            </ExternalSource>
          </section>
          <CharacterWeek
            character={character}
            action={
              <Link className="button button-secondary week-link" to="/week">
                <CalendarClock size={15} />
                Open this week
              </Link>
            }
          />
          <StatsSurface character={character} />
        </div>
      </div>
    </>
  );
}
function GearPage({ character }: { character: Character }) {
  const { activity } = useActivity(character.id);
  return (
    <GearEditor
      key={character.id + activity}
      character={character}
      activity={activity}
    />
  );
}
function GearEditor({
  character,
  activity,
}: {
  character: Character;
  activity: Activity;
}) {
  const memoryKey = character.id + ":" + activity + ":" + character.specId;
  const memory = gearMemory.get(memoryKey);
  const hydrated = useRef(false);
  const query = useQuery({
    queryKey: ["gear-draft", character.id, activity, character.specId],
    queryFn: () =>
      api.getGearDraft({
        characterId: character.id,
        activity,
        specId: character.specId,
      }),
  });
  const [items, setItems] = useState<GearItem[]>(memory?.items ?? []);
  const gameData = useGameData();
  const itemIds = useMemo(() => [...new Set([...character.gear, ...items].flatMap((item) => item.itemId ? [item.itemId] : []))], [character.gear, items]);
  const itemDetails = useQuery({ queryKey: ["items", itemIds], queryFn: () => api.getItems(itemIds), enabled: gameData.data?.state === "ready" && itemIds.length > 0 });
  const itemMap = useMemo(() => new Map((itemDetails.data ?? []).map((item) => [item.id, item])), [itemDetails.data]);
  const [selected, setSelected] = useState<GearSlot>("head");
  const [slotSearch, setSlotSearch] = useState(false);
  const [name, setName] = useState(memory?.name ?? "My upgrade plan");
  const [dirty, setDirty] = useState(memory?.dirty ?? false);
  const [itemName, setItemName] = useState("");
  const [itemLevel, setItemLevel] = useState("");
  const [enchant, setEnchant] = useState("");
  const [gems, setGems] = useState("");
  const [enchantEdited, setEnchantEdited] = useState(false);
  const [gemsEdited, setGemsEdited] = useState(false);
  const [target, setTarget] = useState(character.targetItemLevel?.toString() ?? "");
  const updateGoal = useAction(api.updateCharacter, "Character goal saved");
  const client = useQueryClient();
  useEffect(() => {
    if (query.isSuccess && !hydrated.current) {
      hydrated.current = true;
      if (!gearMemory.get(memoryKey)) {
        setItems(query.data?.items ?? character.gear.map((i) => ({ ...i })));
        setName(query.data?.name ?? "My upgrade plan");
        setDirty(false);
      }
    }
  }, [query.data, query.isSuccess, activity, character.id, memoryKey]);
  useEffect(() => {
    if (hydrated.current) gearMemory.set(memoryKey, { items, name, dirty });
  }, [items, name, dirty, memoryKey]);
  useEffect(() => subscribeGearPlan(() => {
    const stored = gearMemory.get(memoryKey);
    if (!stored) return;
    setItems(stored.items);
    setName(stored.name);
    setDirty(stored.dirty);
  }), [memoryKey]);
  const current = items.find((i) => i.slot === selected);
  const displayedItem = useRef<{ slot: GearSlot; item: GearItem | undefined } | null>(null);
  const inspectorDirty = hydrated.current && (itemName !== (current?.name ?? '') || itemLevel !== (current?.itemLevel?.toString() ?? '') || enchant !== (current?.enchant ?? '') || gems !== (current?.gems.join(', ') ?? ''));
  useUpdateBlocker(dirty || inspectorDirty || target !== (character.targetItemLevel?.toString() ?? ''), 'Save your gear plan and slot edits before restarting');
  useEffect(() => {
    if (displayedItem.current?.slot === selected && displayedItem.current.item === current) return;
    displayedItem.current = { slot: selected, item: current };
    setItemName(current?.name ?? "");
    setItemLevel(current?.itemLevel?.toString() ?? "");
    setEnchant(current?.enchant ?? "");
    setGems(current?.gems.join(", ") ?? "");
    setEnchantEdited(false);
    setGemsEdited(false);
  }, [selected, current]);
  const save = useMutation({
    mutationFn: (draft: GearDraft) => api.saveGearDraft(draft),
    onSuccess: () => {
      setDirty(false);
      notify("Gear plan saved locally");
      void client.invalidateQueries({ queryKey: ["gear-draft", character.id] });
    },
    onError: (e) => notify(errorMessage(e)),
  });
  // Leaving the plan by route, character, subsection, or window close asks first while changes are unsaved
  const unsaved = dirty || inspectorDirty;
  const blocker = useBlocker({ shouldBlockFn: () => unsaved, enableBeforeUnload: unsaved, withResolver: true });
  const equipped = character.gear.find((i) => i.slot === selected);
  const values = items.map((i) => i.itemLevel).filter((v): v is number => v != null);
  const draftLevel = values.length === 16 ? values.reduce((a, b) => a + b, 0) / 16 : null;
  const planned = current?.itemId ? itemMap.get(current.itemId) : undefined;
  /** Slot edits go straight into the local draft; the list it returns is what Save plan persists */
  function updateItem(quiet = false, enhancement?: { enchant?: string; gems?: string }): GearItem[] | null {
    const ilvl = itemLevel.trim() ? Number(itemLevel) : null;
    if (ilvl != null && (!Number.isFinite(ilvl) || ilvl < 0)) {
      notify("Enter a valid item level");
      return null;
    }
    const next = clearRenamedPlanIdentity(current, {
      slot: selected,
      name: itemName.trim() || `${slotNames[selected]} draft`,
      itemId: current?.itemId ?? null,
      itemLevel: ilvl,
      enchant: (enhancement?.enchant ?? enchant).trim() || null,
      enchantCoverage: enchantEdited || enhancement?.enchant !== undefined ? "complete" : (current?.enchantCoverage ?? "unknown"),
      gemsCoverage: gemsEdited || enhancement?.gems !== undefined ? "complete" : (current?.gemsCoverage ?? "unknown"),
      gems: (enhancement?.gems ?? gems)
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      appearanceId: current?.appearanceId ?? null,
      itemLink: current?.itemLink ?? null,
      stats: current?.itemLevel === ilvl ? current.stats : [],
      effects: current?.itemLevel === ilvl ? current.effects : [],
    });
    const nextItems = [...items.filter((i) => i.slot !== selected), next];
    // Local commits must not rehydrate over a newer edit in another inspector field
    displayedItem.current = { slot: selected, item: next };
    setItemName(next.name);
    setItemLevel(next.itemLevel?.toString() ?? "");
    setEnchant(next.enchant ?? "");
    setGems(next.gems.join(", "));
    setEnchantEdited(false);
    setGemsEdited(false);
    setItems(nextItems);
    setDirty(true);
    if (!quiet) notify("Slot updated in your draft");
    return nextItems;
  }
  function savePlan(onSaved?: () => void) {
    const planned = inspectorDirty ? updateItem(true) : items;
    if (!planned) return;
    save.mutate({
      id: query.data?.id ?? crypto.randomUUID(),
      characterId: character.id,
      specId: character.specId,
      activity,
      rulesetId: query.data?.rulesetId ?? "unknown",
      name: name.trim() || "My upgrade plan",
      items: planned,
      updatedAt: new Date().toISOString(),
    }, { onSuccess: onSaved });
  }
  function selectSlot(slot: GearSlot) {
    if (inspectorDirty && !updateItem(true)) return;
    setSelected(slot);
  }
  return (
    <>
      <div className="page-heading gear-plan-heading">
        <div>
          <h2 className="gear-section-title"><NotebookPen size={18} aria-hidden="true" />Plan</h2>
          <p>Your imported gear stays separate from this plan · Edits update the draft, and Save plan keeps them</p>
        </div>
        <div className="actions">
          <span className="save-status" role="status" data-state={save.isError ? "error" : save.isPending ? "saving" : dirty || inspectorDirty ? "unsaved" : "saved"}>
            {save.isError ? <><CircleHelp size={14} />Could not save</> : save.isPending ? "Saving…" : dirty || inspectorDirty ? <Badge tone="amber">Unsaved changes</Badge> : query.data ? <><Check size={14} />Saved locally</> : null}
          </span>
          <Button
            variant="primary"
            disabled={save.isPending || query.isPending}
            onClick={() => savePlan()}
          >
            <Save />
            {save.isPending ? "Saving…" : "Save plan"}
          </Button>
        </div>
      </div>
      <div className="gear-summary">
        <Metrics character={character} planned={draftLevel} activity={activity} />
      </div>
      <LeaveGuard
        open={blocker.status === "blocked"}
        title="Leave this plan without saving?"
        description="This plan has changes that are not saved"
        saving={save.isPending}
        onKeep={() => blocker.status === "blocked" && blocker.reset()}
        onSave={() => savePlan(() => blocker.proceed?.())}
        onDiscard={() => { gearMemory.delete(memoryKey); blocker.proceed?.(); }}
      />
      {query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <div className="planner-layout">
          <section className="planner-workspace">
            <div className="plan-controls">
              <Field label="Plan name">
                <input
                  value={name}
                  maxLength={100}
                  onChange={(e) => {
                    setName(e.target.value);
                    setDirty(true);
                  }}
                />
              </Field>
              <div className="goal-editor">
                <Field
                  label="Your item-level target"
                  hint="A personal goal, separate from a verified legal maximum"
                >
                  <input
                    type="number"
                    min="0"
                    step="0.1"
                    value={target}
                    placeholder="No target set"
                    onChange={(e) => setTarget(e.target.value)}
                  />
                </Field>
                <Button
                  onClick={() => {
                    const value = target.trim() ? Number(target) : null;
                    if (value != null && (!Number.isFinite(value) || value < 0)) {
                      notify("Enter a valid target item level");
                      return;
                    }
                    updateGoal.mutate({
                      id: character.id,
                      patch: { targetItemLevel: value },
                    });
                  }}
                >
                  <Target size={14} aria-hidden="true" />Save target
                </Button>
              </div>
            </div>
            <div className="table-wrap planner-table-wrap">
              <table className="data-table planner-table">
                <caption>
                  Matching items are dimmed when your planned target is equipped — item levels,
                  enchants, and gems can still differ
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Slot</th>
                    <th scope="col">Current gear</th>
                    <th scope="col">Planned gear</th>
                  </tr>
                </thead>
                <tbody>
                  {allSlots.map((slot) => {
                    const item = items.find((i) => i.slot === slot);
                    const observed = character.gear.find((i) => i.slot === slot);
                    const targetEquipped = isPlannedItemEquipped(observed, item);
                    const completion=item?comparePlanCompletion(character.gear,[item])[0]:null;
                    return (
                      <tr
                        key={slot}
                        className={`selectable ${slot === selected ? "selected" : ""}`}
                        data-target-equipped={targetEquipped || undefined}
                        tabIndex={0}
                        aria-label={`Edit ${slotNames[slot]}`}
                        aria-description={targetEquipped ? "Target equipped" : undefined}
                        onClick={() => selectSlot(slot)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            selectSlot(slot);
                          }
                        }}
                      >
                        <td>
                          <div className="planner-slot-name"><GearSlotIcon slot={slot} size={16} /><span>{slotNames[slot]}</span></div>
                          {targetEquipped && <span className="planner-match"><Check size={12} aria-hidden="true" />Target equipped</span>}
                          {completion?.acquisition==='complete'&&!completion.complete&&<span className="item-subtitle">{completion.rank!=='complete'?'Upgrade goal outstanding':completion.enhancements!=='complete'?'Gems or enchant outstanding':'Variant details unverified'}</span>}
                        </td>
                        <td>
                          <ItemHoverCard itemId={observed?.itemId} item={observed?.itemId ? itemMap.get(observed.itemId) : undefined} gear={observed}><div className="gear-item planner-gear-item">
                            <ItemIcon icon={observed?.itemId ? itemMap.get(observed.itemId)?.icon : null} quality={observed?.itemId ? itemMap.get(observed.itemId)?.quality : undefined} fallback={<GearSlotIcon slot={slot} />} />
                            <div>
                              <div className={observed ? `item-name quality-text-${observed.itemId ? itemMap.get(observed.itemId)?.quality ?? 1 : 1}` : "secondary"}>
                                {observed?.name ?? "Not imported"}
                              </div>
                              <div className="item-subtitle">Item level <Known>{level(observed?.itemLevel)}</Known></div>
                            </div>
                          </div></ItemHoverCard>
                        </td>
                        <td>
                          <ItemHoverCard itemId={item?.itemId} item={item?.itemId ? itemMap.get(item.itemId) : undefined} gear={item}><div className="gear-item planner-gear-item">
                            <ItemIcon icon={item?.itemId ? itemMap.get(item.itemId)?.icon : null} quality={item?.itemId ? itemMap.get(item.itemId)?.quality : undefined} fallback={<GearSlotIcon slot={slot} />} />
                            <div>
                              <div className={item ? `item-name quality-text-${item.itemId ? itemMap.get(item.itemId)?.quality ?? 1 : 1}` : "secondary"}>
                                {item?.name ?? "No planned item"}
                              </div>
                              <div className="item-subtitle">Item level <Known>{level(item?.itemLevel)}</Known></div>
                              <div className="item-subtitle planner-improvements">
                                <span>{item?.enchant ??
                                  (item?.enchantCoverage === "complete"
                                    ? "No enchant in draft"
                                    : "Enchant unknown")}</span>
                                <span>{item?.gems.length
                                  ? `${item.gems.length} gem${item.gems.length === 1 ? "" : "s"}`
                                  : item?.gemsCoverage === "complete"
                                    ? "No gems in draft"
                                    : "Gems unknown"}</span>
                              </div>
                            </div>
                          </div></ItemHoverCard>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="roster-footnote">
              <Info />
              <p>
                Search by item name or copy a popular choice from Top players. Drafts do not
                validate upgrade rules or simulated damage
              </p>
            </div>
          </section>
          <aside className="surface gear-inspector">
            <div className="gear-inspector-heading">
              <ItemIcon icon={planned?.icon} quality={planned?.quality} size="large" fallback={<GearSlotIcon slot={selected} />} />
              <div>
                <h3>{slotNames[selected]}</h3>
                <p>Current gear · {equipped?.name ?? "Not imported"}</p>
              </div>
            </div>
            <Button onClick={() => setSlotSearch(true)} aria-label="Search items for this slot">
              <Search />
              Search items for this slot
            </Button>
            <Field label="Planned item name">
              <input
                value={itemName}
                maxLength={200}
                onChange={(e) => setItemName(e.target.value)}
                onBlur={() => { if (inspectorDirty) updateItem(true); }}
                placeholder="Search or name your planned item"
              />
            </Field>
            <Field label="Planned item level">
              <input
                type="number"
                min="0"
                step="0.1"
                value={itemLevel}
                onChange={(e) => setItemLevel(e.target.value)}
                onBlur={() => { if (inspectorDirty) updateItem(true); }}
                placeholder="Unknown"
              />
            </Field>
            <EnhancementSelect key={`enchant:${selected}`} kind="enchant" slot={selected} value={enchant} onChange={(value, selected) => { if (selected) updateItem(true, { enchant: value }); else { setEnchant(value); setEnchantEdited(true); } }} onCommit={() => { if (inspectorDirty) updateItem(true); }} />
            <EnhancementSelect key={`gems:${selected}`} kind="gem" slot={selected} value={gems} onChange={(value, selected) => { if (selected) updateItem(true, { gems: value }); else { setGems(value); setGemsEdited(true); } }} onCommit={() => { if (inspectorDirty) updateItem(true); }} />
            <p className="inspector-note">
              This plan is scoped to {character.name}, {spec(character)}, and{" "}
              {activityNames[activity]}
              <br />
              It does not equip items in WoW
            </p>
          </aside>
        </div>
      )}
      <ItemSearchDialog
        open={slotSearch}
        onOpenChange={setSlotSearch}
        character={character}
        slot={selected}
        title={`Search ${slotNames[selected].toLowerCase()} items`}
        onPick={(item) => {
          void addItemToPlan({ character, activity, item, preferredSlot: selected }).then((slot) => {
            if (!slot) {
              notify(`${item.name} doesn't match this character's class, specialization, or gear slot`);
              return;
            }
            notify(`Added ${item.name} to ${slotNames[slot]}`);
          }).catch((error) => notify(errorMessage(error)));
        }}
      />
    </>
  );
}
function AddCharacter({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [realm, setRealm] = useState("");
  const [region, setRegion] = useState("us");
  const [className, setClassName] = useState("Unknown");
  const [error, setError] = useState("");
  const client = useQueryClient();
  const navigate = useNavigate();
  const add = useMutation({
    mutationFn: (input: AddCharacterInput) => api.addCharacter(input),
    onSuccess: (c) => {
      void client.invalidateQueries();
      onOpenChange(false);
      setName("");
      setRealm("");
      setError("");
      notify(`${c.name} added locally`);
      void api.saveSettings({ lastCharacterId: c.id });
      void navigate({ to: "/characters", search: { selected: c.id } });
    },
    onError: (e) => setError(errorMessage(e)),
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Add a character"
      description="Track a Retail character without replacing your existing roster"
    >
      <form
        className="form-stack"
        onSubmit={(e) => {
          e.preventDefault();
          setError("");
          add.mutate({
            name: name.trim(),
            realm: realm.trim(),
            region,
            className,
            edition: "retail",
          });
        }}
      >
        <Field label="Character name">
          <input
            autoFocus
            value={name}
            required
            maxLength={100}
            onChange={(e) => setName(e.target.value)}
            placeholder="Character name"
          />
        </Field>
        <div className="field-row">
          <Field label="Region">
            <AppSelect
              label="Region"
              value={region}
              onValueChange={setRegion}
              options={[
                { value: "us", label: "Americas / Oceania" },
                { value: "eu", label: "Europe" },
                { value: "kr", label: "Korea" },
                { value: "tw", label: "Taiwan" },
              ]}
            />
          </Field>
          <Field label="Realm">
            <input
              value={realm}
              required
              maxLength={100}
              onChange={(e) => setRealm(e.target.value)}
              placeholder="Realm name or slug"
            />
          </Field>
        </div>
        <Field label="Class (optional)">
          <AppSelect
            label="Class (optional)"
            value={className}
            onValueChange={setClassName}
            options={[
              "Unknown",
              "Death Knight",
              "Demon Hunter",
              "Druid",
              "Evoker",
              "Hunter",
              "Mage",
              "Monk",
              "Paladin",
              "Priest",
              "Rogue",
              "Shaman",
              "Warlock",
              "Warrior",
            ].map((c) => ({ value: c, label: c }))}
          />
        </Field>
        <div className="help-box">
          Gear, ratings, collection ownership, and the legal maximum remain unknown until a
          supported source provides them
          <br />
          You can refresh a public profile after adding the character
        </div>
        {error && (
          <p className="error small" role="alert">
            {error}
          </p>
        )}
        <Button
          variant="primary"
          type="submit"
          disabled={add.isPending || !name.trim() || !realm.trim()}
        >
          <Plus />
          {add.isPending ? "Adding…" : "Add character"}
        </Button>
      </form>
    </Sheet>
  );
}
const openSettingsEvent = "wow-companion:open-settings";
function openSettings() {
  window.dispatchEvent(new Event(openSettingsEvent));
}
/** Settings opens over whatever the player is doing, so closing it never loses their place */
function SettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog sm:max-w-[920px]" aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>Make WOW Companion feel at home on your desktop</DialogDescription>
        </DialogHeader>
        <div className="settings-dialog-body">
          <SettingsPage />
        </div>
      </DialogContent>
    </Dialog>
  );
}
function SettingsRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/characters", replace: true });
    openSettings();
  }, [navigate]);
  return null;
}
const settingsSections = [
  ['connections-heading', 'Connections'],
  ['integrations-heading', 'Integrations'],
  ['updates-heading', 'Updates'],
  ['appearance-heading', 'Appearance'],
  ['workspace-heading', 'Workspace'],
  ['data-heading', 'Local data'],
] as const;
function SettingsPage() {
  const settings = useSettings();
  const page = useRef<HTMLDivElement>(null);
  const [activeSection, setActiveSection] = useState<string>('connections-heading');
  useEffect(() => {
    const scroller = page.current?.closest<HTMLElement>('.settings-dialog-body');
    if (!scroller || settings.isPending) return;
    const updateSection = () => {
      const boundary = scroller.getBoundingClientRect().top + (page.current?.querySelector('nav')?.offsetHeight ?? 0) + 32;
      let current: string = settingsSections[0][0];
      for (const [id] of settingsSections) {
        const heading = document.getElementById(id);
        if (heading && heading.getBoundingClientRect().top <= boundary) current = id;
      }
      if (scroller.scrollTop > 0 && scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 2) current = 'data-heading';
      setActiveSection(current);
    };
    updateSection();
    scroller.addEventListener('scroll', updateSection, { passive: true });
    return () => scroller.removeEventListener('scroll', updateSection);
  }, [settings.isPending]);
  const save = useAction(api.saveSettings, "Preferences saved");
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  useUpdateBlocker(busy, 'Wait for the backup or import to finish');
  async function backup(kind: "export" | "import") {
    setBusy(true);
    try {
      if (kind === "export") {
        if (await api.exportBackup()) notify("Local backup exported");
      } else {
        const report = await api.importBackup();
        if (report) {
          notify(`Backup restored · ${report.imported.length} records`);
          void client.invalidateQueries();
        }
      }
    } catch (e) {
      notify(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="settings-page" ref={page}>
      {settings.isPending ? (
        <div className="loading-surface" role="status">
          Loading preferences…
        </div>
      ) : settings.isError ? (
        <ErrorState error={settings.error} retry={() => void settings.refetch()} />
      ) : (
        <>
          <nav className="settings-anchors" aria-label="Settings sections">
            {settingsSections.map(([id, label]) => (
              <button
                key={id}
                type="button"
                className="subnav-link"
                aria-current={activeSection === id ? 'location' : undefined}
                onClick={() => {
                  const heading = document.getElementById(id);
                  const reduced = settings.data?.reducedMotion || matchMedia('(prefers-reduced-motion: reduce)').matches;
                  heading?.scrollIntoView({ behavior: reduced ? 'instant' : 'smooth', block: "start" });
                  heading?.setAttribute("tabindex", "-1");
                  heading?.focus({ preventScroll: true });
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <ConnectionsSection />
          <ProviderSettings />
          <UpdateSettings />
          <section className="settings-section" aria-labelledby="appearance-heading">
            <h2 id="appearance-heading">Appearance</h2>
            <p>Choose your icon, theme, and motion preferences</p>
            <div className="settings-section-body surface">
              <div className="setting-row">
                <div>
                  <h3>App icon</h3>
                  <p>Build default uses purple for Nightly and blue for Stable</p>
                  <p>The primary color follows your icon</p>
                  <p>Pinned shortcuts keep the icon from installation</p>
                </div>
                <div className="app-icon-control">
                  <img className="app-icon-preview" src={`${import.meta.env.BASE_URL}assets/${appIconFiles[resolveAppIcon(settings.data?.appIcon ?? 'auto', appVersion)].logo}`} alt="" />
                  <AppSelect aria-label="App icon" value={settings.data?.appIcon ?? 'auto'} options={appIconChoices.map(choice => ({ ...choice, image: `${import.meta.env.BASE_URL}assets/${appIconFiles[resolveAppIcon(choice.value, appVersion)].logo}` }))} disabled={save.isPending} onValueChange={value => save.mutate({ appIcon: value as AppIconPreference })} />
                </div>
              </div>
              <div className="setting-row">
                <div>
                  <h3>Color theme</h3>
                  <p>Dark uses a pure black canvas</p>
                </div>
                <AppSelect
                  aria-label="Appearance"
                  value={settings.data?.theme ?? "system"}
                  onValueChange={(value) =>
                    save.mutate({
                      theme: value as "system" | "light" | "dark",
                    })
                  }
                  options={[
                    { value: "system", label: "System" },
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </div>
              <div className="setting-row">
                <div>
                  <h3>Reduce motion</h3>
                  <p>Keep transitions quiet and predictable</p>
                </div>
                <Toggle
                  type="button"
                  variant="outline"
                  className="workspace-toggle"
                  aria-label="Reduce motion"
                  pressed={settings.data?.reducedMotion ?? false}
                  onPressedChange={(pressed) => save.mutate({ reducedMotion: pressed })}
                >
                  {settings.data?.reducedMotion ? "On" : "Off"}
                </Toggle>
              </div>
            </div>
          </section>
          <section className="settings-section" aria-labelledby="workspace-heading">
            <h2 id="workspace-heading">Workspace</h2>
            <p>Arrange the space around your characters</p>
            <div className="settings-section-body surface">
              <div className="setting-row">
                <div>
                  <h3>Sidebar width</h3>
                  <p>Drag the sidebar edge or use its arrow keys to resize</p>
                </div>
                <div className="sidebar-width-control">
                  <span className="muted small sidebar-width-value">
                    {settings.data?.sidebarWidth ?? DEFAULT_SIDEBAR_WIDTH} px
                  </span>
                  <Button
                    disabled={
                      save.isPending || settings.data?.sidebarWidth === DEFAULT_SIDEBAR_WIDTH
                    }
                    onClick={() => save.mutate({ sidebarWidth: DEFAULT_SIDEBAR_WIDTH })}
                  >
                    Reset width
                  </Button>
                </div>
              </div>
            </div>
          </section>
          <section className="settings-section" aria-labelledby="data-heading">
            <h2 id="data-heading">Local data</h2>
            <p>Your roster, plans, and imported assets stay in this workspace</p>
            <div className="settings-section-body surface">
              <div className="setting-row">
                <div>
                  <h3>Local backup</h3>
                  <p>Export character data and saved plans before moving to another computer</p>
                </div>
                <div className="actions">
                  <Button disabled={busy} onClick={() => void backup("export")}>
                    <Download />
                    Export backup
                  </Button>
                  <Button disabled={busy} onClick={() => void backup("import")}>
                    <Upload />
                    Import backup
                  </Button>
                </div>
              </div>
              <div className="help-box">
                Public-profile refresh uses an online provider
                <br />
                Global ranking coverage, validated current item-level caps, and dynamic WoW
                appearance assembly remain separate integrations
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
function ManagePanel({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const roster = useRoster();
  const update = useAction(api.updateCharacter, "Roster updated");
  const client = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCharacter({ id }),
    onSuccess: (_, id) => {
      for (const key of gearMemory.keys()) if (key.startsWith(id + ':')) gearMemory.delete(key);
      void client.invalidateQueries();
      setConfirmDelete(null);
      notify("Character deleted");
      if (pathname.startsWith(`/characters/${id}/`)) {
        void navigate({ to: "/characters" });
        onOpenChange(false);
      }
    },
    onError: (error) => notify(errorMessage(error)),
  });
  const archive = useMutation({
    mutationFn: api.archiveCharacter,
    onSuccess: (_, input) => {
      void client.invalidateQueries();
      notify(input.archived ? "Character archived — restore it anytime" : "Character restored");
      if (input.archived && pathname.startsWith(`/characters/${input.id}/`)) {
        void navigate({ to: "/characters" });
        onOpenChange(false);
      }
    },
    onError: (error) => notify(errorMessage(error)),
  });
  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title="Manage roster"
      description="Pin your main, favorite useful alts, or archive a character while preserving its history"
    >
      <div>
        {roster.data?.map((c) => (
          <div className="archive-row" key={c.id}>
            <Avatar character={c} />
            <Identity character={c} />
            <div className="manage-actions">
              {!c.archived && (
                <>
                  <Button
                    variant="icon"
                    aria-label={`Set ${c.name} as main`}
                    className={c.isMain ? "positive" : ""}
                    onClick={() => update.mutate({ id: c.id, patch: { isMain: !c.isMain } })}
                  >
                    <Crown />
                  </Button>
                  <Button
                    variant="icon"
                    aria-label={`${c.favorite ? "Unfavorite" : "Favorite"} ${c.name}`}
                    className={`favorite ${c.favorite ? "active" : ""}`}
                    onClick={() =>
                      update.mutate({
                        id: c.id,
                        patch: { favorite: !c.favorite },
                      })
                    }
                  >
                    <Star />
                  </Button>
                </>
              )}
              {confirmDelete === c.id ? (
                <>
                  <Button variant="primary" disabled={remove.isPending} onClick={() => remove.mutate(c.id)}>
                    {remove.isPending ? "Deleting…" : "Delete"}
                  </Button>
                  <Button variant="quiet" onClick={() => setConfirmDelete(null)}>Keep</Button>
                </>
              ) : (
                <>
                  <Button
                    variant={c.archived ? "secondary" : "icon"}
                    aria-label={`${c.archived ? "Restore" : "Archive"} ${c.name}`}
                    onClick={() => archive.mutate({ id: c.id, archived: !c.archived })}
                  >
                    {c.archived ? "Restore" : <Archive />}
                  </Button>
                  <Button variant="icon" aria-label={`Delete ${c.name}`} onClick={() => setConfirmDelete(c.id)}>
                    <Trash2 />
                  </Button>
                </>
              )}
            </div>
            {confirmDelete === c.id && (
              <p className="archive-confirm" role="alert">
                Delete {c.name}? Its gear plans and outfits are removed from this computer. You can add the character again later
              </p>
            )}
          </div>
        ))}
        {!roster.data?.length && <p className="muted small">No characters to manage yet</p>}
      </div>
      <div className="help-box" style={{ marginTop: 24 }}>
        Archiving hides a character from active views and keeps its plans for when you restore it
        <br />
        Deleting removes the character and its plans for good
      </div>
    </Sheet>
  );
}
const rootRoute = createRootRoute({
  component: Shell,
  notFoundComponent: () => (
    <EmptyState
      icon={Search}
      title="Page not found"
      description="Return to your character roster to continue"
    >
      <Link to="/characters" className="button button-primary">
        Open roster
      </Link>
    </EmptyState>
  ),
});
const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: RosterPage,
});
const rosterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters",
  validateSearch: (search: Record<string, unknown>): { selected?: string } => ({
    selected: typeof search.selected === "string" ? search.selected : undefined,
  }),
  component: RosterPage,
});
const returnSearch = (search: Record<string, unknown>): { return?: string } => ({
  return: safeReturn(search.return) ?? undefined,
});
const characterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$characterId/$section",
  validateSearch: returnSearch,
  component: CharacterRoute,
});
const characterViewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$characterId/$section/$view",
  validateSearch: returnSearch,
  component: CharacterRoute,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsRedirect,
});
function SetupRoute() {
  const [adding, setAdding] = useState(false);
  return (
    <>
      <SetupPage onAddByName={() => setAdding(true)} />
      <AddCharacter open={adding} onOpenChange={setAdding} />
    </>
  );
}
const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/setup",
  component: SetupRoute,
});
function WeekRoute() {
  const roster = useRoster();
  const navigate = useNavigate();
  const { expanded } = weekRoute.useSearch();
  const back = expanded ? `/week?expanded=${expanded}` : "/week";
  return (
    <WeekPage
      characters={roster.data ?? []}
      expandedId={expanded ?? null}
      onExpand={(id) => void navigate({ to: "/week", search: id ? { expanded: id } : {}, replace: true })}
      identity={(character) => (
        <div className="table-identity">
          <Avatar character={character} />
          <Identity character={character} />
        </div>
      )}
      onOpen={(character) =>
        void navigate({ to: "/characters/$characterId/$section", params: { characterId: character.id, section: "overview" }, search: { return: back } })
      }
      onReview={(character) =>
        void navigate({ to: "/characters/$characterId/$section/$view", params: { characterId: character.id, section: "gear", view: "progress" }, search: { return: back } })
      }
    />
  );
}
const weekRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/week",
  validateSearch: (search: Record<string, unknown>): { expanded?: string } => ({
    expanded: typeof search.expanded === "string" && /^[w-]{1,100}$/.test(search.expanded) ? search.expanded : undefined,
  }),
  component: WeekRoute,
});
function TonightRoute() {
  const roster=useRoster();const settings=useSettings();const navigate=useNavigate();
  const active=(roster.data??[]).filter(c=>!c.archived);
  const client=useQueryClient();
  // The session plan stays pinned to its own character, so changing the selected character never switches it
  const pinned=active.find(c=>c.id===settings.data?.tonightAnchorCharacterId)?.id??null;
  const anchor=pinned??active.find(c=>c.id===settings.data?.lastCharacterId)?.id??active.find(c=>c.isMain)?.id??active[0]?.id??null;
  useEffect(()=>{if(settings.data&&anchor&&!pinned)void api.saveSettings({tonightAnchorCharacterId:anchor}).then(saved=>client.setQueryData(['settings'],saved))},[anchor,pinned,settings.data]);
  return <TonightPage characters={active} selectedCharacterId={anchor} onChangeAnchor={id=>void api.saveSettings({tonightAnchorCharacterId:id}).then(saved=>client.setQueryData(['settings'],saved))} onOpen={(id,section)=>{
    // Every Tonight action names its destination and carries Back to Tonight
    if(section==='week')void navigate({to:'/week'});
    else{
      const destination:CharacterDestination=section==='gear'?{section:'gear',view:'plan'}:section==='progression'?{section:'gear',view:'progress'}:section==='standings'?{section:'performance',view:'standing'}:{section:'wardrobe'};
      void navigate({to:destinationPath(id,destination) as never,search:{return:'/tonight'} as never});
    }
  }}/>;
}
const tonightRoute=createRoute({getParentRoute:()=>rootRoute,path:'/tonight',component:TonightRoute});
const router = createRouter({
  history: createHashHistory(),
  routeTree: rootRoute.addChildren([indexRoute, rosterRoute, characterRoute, characterViewRoute, settingsRoute, setupRoute, weekRoute, tonightRoute]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
export default function App() {
  return <RouterProvider router={router} />;
}
