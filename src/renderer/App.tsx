import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { transparentPortrait } from "./lib/portrait";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createRootRoute,
  createHashHistory,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
  Link,
  useNavigate,
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
  ArrowDownUp,
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Crown,
  Download,
  ExternalLink,
  Info,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Shield,
  Sparkles,
  Star,
  Trash2,
  Trophy,
  Upload,
  Users,
  WandSparkles,
} from "lucide-react";
import { api, type BlizzardRegion } from "./lib/client";
import { assetUrl } from "./lib/assets";
import { errorMessage, notify, setToastDispatch } from "./lib/notify";
import { Term } from "./components/Term";
import { ItemHoverCard } from "./features/items/ItemHoverCard";
import { ItemIcon, ItemSearchDialog, SearchButton, useGameData, useItemSearchShortcut } from "./features/items/items";
import { ConnectionsSection, SetupPage, regionOptions, useConnections } from "./features/connections/connections";
import { addItemToPlan, gearMemory, subscribeGearPlan } from "./lib/plan-item";
import { clearRenamedPlanIdentity, isPlannedItemEquipped } from "./lib/gear-plan-match";
import { CharacterWeek, StatsSurface, WeekPage } from "./features/week/week";
import { TopPlayersPage } from "./features/top/top-players";
import { ProgressionPage, ProgressionSummary } from "./features/progression/progression";
import { TonightPage } from "./features/tonight/TonightPage";
import { SimulationsPage } from "./features/simulations/SimulationsPage";
import { WardrobePage } from "./features/outfits/WardrobePage";
import { UpdateSettings, UpdateIndicator } from "./features/updates/UpdateSettings";
import { useUpdateBlocker, useUpdateSafety } from "./lib/update-safety";
import { InventoryPage } from "./features/inventory/InventoryPage";
import { ComparisonPage } from "./features/comparisons/ComparisonPage";
import {ProviderSettings} from './features/comparisons/ProviderSettings';
import { comparePlanCompletion } from "../shared/plan-completion";
import { SyncButton, SyncSheet, useSyncOnFocus } from "./features/sync/sync";
import { AppSelect } from "./components/AppSelect";
import { Toggle } from "./components/ui/toggle";
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
function Metrics({ character, planned }: { character: Character; planned?: number | null }) {
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
        <small>Legal max</small>
        <strong data-unknown={character.maxItemLevel == null}>{level(character.maxItemLevel)}</strong>
      </div>
    </div>
  );
}
function nextAction(character: Character) {
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
  if (character.maxItemLevel == null)
    return {
      title: "Establish your season gear ceiling",
      description: "A validated current ruleset is needed before calculating a legal maximum",
    };
  return {
    title: "Review your lowest item-level slot",
    description: "Inspect options in the planner and check their actual source in game",
  };
}
function SelectedPane({ character, activity }: { character: Character; activity: Activity }) {
  const action = nextAction(character);
  const gap =
    character.maxItemLevel != null && character.itemLevel != null
      ? Math.max(0, character.maxItemLevel - character.itemLevel)
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
      <Metrics character={character} />
      <div className="detail-list">
        <div className="detail-row">
          <span>{metricNames[activity]}</span>
          <strong>{activityValue(character.ratings[activity], activity)}</strong>
        </div>
        <div className="detail-row">
          <span>Gap to maximum</span>
          <strong>{level(gap)}</strong>
        </div>
      </div>
      <ProgressionSummary character={character} activity={activity} />
      <div className="next-action">
        <h3>{action.title}</h3>
        <p>{action.description}</p>
      </div>
      <div className="pane-observation">Observed {age(character.observedAt).toLowerCase()}</div>
      <Link
        className="button button-primary full-width"
        to="/characters/$characterId/$section"
        params={{ characterId: character.id, section: "overview" }}
      >
        <ArrowRight size={14} />
        Open character
      </Link>
    </aside>
  );
}
function Shell() {
  useUpdateSafety();
  const roster = useRoster();
  const settings = useSettings();
  const navigate = useNavigate();
  const route = useRouterState({ select: (s) => s.location });
  const currentPath = route.pathname;
  useEffect(() => {
    document.querySelector(".workspace-scroll")?.scrollTo(0, 0);
  }, [currentPath]);
  const match = currentPath.match(/^\/characters\/([^/]+)/);
  const selectedId =
    match?.[1] ??
    new URLSearchParams(route.searchStr).get("selected") ??
    settings.data?.lastCharacterId;
  const active = roster.data?.filter((c) => !c.archived) ?? [];
  const character =
    active.find((c) => c.id === selectedId) ?? active.find((c) => c.isMain) ?? active[0];
  useEffect(()=>{if(match?.[1]&&character?.id===match[1]&&settings.data&&settings.data.lastCharacterId!==character.id){void api.saveSettings({lastCharacterId:character.id}).then(()=>client.invalidateQueries({queryKey:['settings']}));}},[currentPath,character?.id,settings.data?.lastCharacterId]);
  const [sheet, setSheet] = useState<"add" | "sync" | "manage" | null>(null);
  useSyncOnFocus();
  const [searchOpen, setSearchOpen] = useState(false);
  const openSearch = useCallback(() => setSearchOpen(true), []);
  useItemSearchShortcut(openSearch);
  const { activity } = useActivity(character?.id);
  const [switchSearch, setSwitchSearch] = useState("");
  const [toast, setToast] = useState("");
  const client = useQueryClient();
  const saveSidebar = useAction((sidebarWidth: number) => api.saveSettings({ sidebarWidth }));
  const sidebar = useSidebarLayout(settings.data?.sidebarWidth, (width) =>
    saveSidebar.mutate(width),
  );
  useEffect(() => {
    setToastDispatch(setToast);
    return () => setToastDispatch(undefined);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);
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
  const changeCharacter = (id: string) => {
    void api.saveSettings({ lastCharacterId: id }).then(saved=>client.setQueryData(['settings'],saved));
    const section = currentPath.split("/")[3];
    if (match && section)
      void navigate({
        to: "/characters/$characterId/$section",
        params: { characterId: id, section },
      });
    else void navigate({ to: "/characters", search: { selected: id } });
  };
  const sections = [
    { id: "overview", label: "Character", icon: Shield },
    { id: "progression", label: "Progression", icon: ArrowRight },
    { id: "gear", label: "Gear planner", icon: WandSparkles },
    { id: "inventory", label: "Inventory", icon: Archive },
    { id: "simulations", label: "Simulations", icon: Sparkles },
    { id: "wardrobe", label: "Wardrobe", icon: Star },
    { id: "standings", label: "Standings", icon: Trophy },
    { id: "top", label: "Top players", icon: Crown },
  ];
  const section = currentPath.split("/")[3];
  const isSettings = currentPath === "/settings";
  const isSetup = currentPath === "/setup";
  const isWeek = currentPath === "/week";
  const isTonight = currentPath === "/tonight";
  const isRoster = currentPath === "/" || currentPath === "/characters";
  const title = isTonight ? "Tonight" : isSettings
    ? "Settings"
    : isSetup
      ? "Setup"
    : isWeek
      ? "This week"
    : section
      ? (sections.find((s) => s.id === section)?.label ?? "Character")
      : "Characters";
  return (
    <div className="app-shell">
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
          <aside className="sidebar" id="workspace-sidebar">
            <div className="brand">
              <img
                className="brand-logo"
                src={`${import.meta.env.BASE_URL}assets/wow-companion-logo.png`}
                alt=""
              />
              <span className="brand-name">WOW Companion</span>
            </div>
            <CharacterPopover
              resetKey={currentPath+route.searchStr}
              trigger={
                <button className="switcher" aria-label="Switch character">
                  {character ? (
                    <>
                      <Avatar character={character} />
                      <div className="identity">
                        <strong>{character.name}</strong>
                        <small>{spec(character)}</small>
                      </div>
                    </>
                  ) : (
                    <>
                      <span className="avatar">
                        <Users size={19} />
                      </span>
                      <span className="identity">
                        <strong>Your roster</strong>
                        <small>No character selected</small>
                      </span>
                    </>
                  )}
                  <ChevronDown size={14} />
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
                    className={`switcher-choice ${c.id === character?.id ? "active" : ""}`}
                    key={c.id}
                    onClick={() => changeCharacter(c.id)}
                  >
                    <Avatar character={c} />
                    <Identity character={c} />
                    {c.id === character?.id && <Check size={15} />}
                  </button>
                ))}
              {!active.length && <p className="inline-empty">Add your first Retail character</p>}
              <Button variant="quiet" onClick={() => setSheet("add")}>
                <Plus />
                Add character
              </Button>
            </CharacterPopover>
            <div className="nav-group-label">Your workspace</div>
            <nav className="navigation" aria-label="Main navigation">
              <Link
                to="/characters"
                search={{ selected: character?.id }}
                className={`nav-link ${isRoster ? "active" : ""}`}
                aria-current={isRoster ? "page" : undefined}
              >
                <Users />
                <span>Characters</span>
              </Link>
              <Link
                to="/week"
                className={`nav-link ${isWeek ? "active" : ""}`}
                aria-current={isWeek ? "page" : undefined}
              >
                <CalendarClock />
                <span>This week</span>
              </Link>
              <Link to="/tonight" className={`nav-link ${isTonight ? "active" : ""}`} aria-current={isTonight ? "page" : undefined}>
                <Sparkles /><span>Tonight</span>
              </Link>
              {sections.map(({ id, label, icon: Icon }) =>
                character ? (
                  <Link
                    key={id}
                    to="/characters/$characterId/$section"
                    params={{ characterId: character.id, section: id }}
                    className={`nav-link ${section === id ? "active" : ""}`}
                    aria-current={section === id ? "page" : undefined}
                  >
                    <Icon />
                    <span>{label}</span>
                  </Link>
                ) : (
                  <span className="nav-link disabled" key={id}>
                    <Icon />
                    <span>{label}</span>
                  </span>
                ),
              )}
            </nav>
            <div className="sidebar-footer">
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Link
                      to="/settings"
                      className={`footer-icon ${isSettings ? "active" : ""}`}
                      aria-label="Open settings"
                      aria-current={isSettings ? "page" : undefined}
                    />
                  }
                >
                  <Settings />
                </TooltipTrigger>
                <TooltipContent side="top">Settings</TooltipContent>
              </Tooltip>
              <SyncButton onClick={() => setSheet("sync")} />
              <UpdateIndicator onOpen={() => void navigate({ to: '/settings' })} />
            </div>
          </aside>
        </ResizablePanel>
        <ResizableHandle
          className="sidebar-resize-handle"
          aria-label="Resize sidebar"
          disabled={sidebar.compact}
          disableDoubleClick
          onDoubleClick={sidebar.reset}
        />
        <ResizablePanel id="workspace" minSize={0}>
          <div className="workspace">
            <header className="toolbar" aria-label="Application title bar">
              <div className="breadcrumbs">
                <span>Workspace</span>
                <ChevronRight />
                {character && section && (
                  <>
                    <span>{character.name}</span>
                    <ChevronRight />
                  </>
                )}
                <span>{title}</span>
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
        </ResizablePanel>
      </ResizablePanelGroup>
      <AddCharacter open={sheet === "add"} onOpenChange={(o) => !o && setSheet(null)} />
      <SyncSheet open={sheet === "sync"} onOpenChange={(o) => !o && setSheet(null)} />
      <ManagePanel open={sheet === "manage"} onOpenChange={(o) => !o && setSheet(null)} />
      <ItemSearchDialog
        open={searchOpen}
        onOpenChange={setSearchOpen}
        character={character}
        onPick={(item) => {
          if (!character) {
            notify("Choose a character before adding items to a plan");
            return;
          }
          void addItemToPlan({ character, activity, item }).then((slot) => {
            if (!slot) {
              notify(`${item.name} doesn't match this character's class, specialization, or gear slot`);
              return;
            }
            notify(`Added ${item.name} to ${slotNames[slot]}`);
            if (section !== "gear") {
              void navigate({
                to: "/characters/$characterId/$section",
                params: { characterId: character.id, section: "gear" },
              });
            }
          }).catch((error) => notify(errorMessage(error)));
        }}
      />
      {toast && (
        <div className="toast" role="status">
          <Info />
          {toast}
        </div>
      )}
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
          <h1>Your characters</h1>
          <p>
            {active.length
              ? `${active.length} Retail characters · One personal workspace`
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
function CharacterRoute() {
  const params = characterRoute.useParams();
  const result = useCharacter(params.characterId);
  const section = params.section;
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
  return (
    <>
      <DemoNotice character={character} />
      {section === "gear" ? (
        <GearPage key={character.id} character={character} />
      ) : section === "progression" ? (
        <CharacterProgression key={character.id} character={character} />
      ) : section === "simulations" ? (
        <SimulationsPage key={character.id} character={character} />
      ) : section === "inventory" ? (
        <InventoryPage key={character.id} character={character} />
      ) : section === "wardrobe" ? (
        <WardrobePage key={character.id} character={character} />
      ) : section === "standings" ? (
        <StandingsPage key={character.id} character={character} />
      ) : section === "top" ? (
        <TopPlayersPage key={character.id} character={character} />
      ) : (
        <OverviewPage character={character} />
      )}
    </>
  );
}
function CharacterProgression({ character }: { character: Character }) {
  const { activity, setActivity } = useActivity(character.id);
  return <ProgressionPage character={character} activity={activity} onActivityChange={setActivity} />;
}
function OverviewPage({ character }: { character: Character }) {
  const { activity, setActivity } = useActivity(character.id);
  const refresh = useAction(
    ({ id }: { id: string }) => api.refreshCharacter({ id }),
    "Character refreshed",
  );
  const action = nextAction(character);
  const progress =
    character.itemLevel != null && character.maxItemLevel != null
      ? Math.min(100, (character.itemLevel / character.maxItemLevel) * 100)
      : null;
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{character.name}</h1>
          <p>
            {spec(character)} · {character.raceName} · {character.region.toUpperCase()} /{" "}
            {character.realm}
            {character.level != null ? ` · Level ${character.level}` : ""}
          </p>
        </div>
        <div className="actions">
          <Button disabled={refresh.isPending} onClick={() => refresh.mutate({ id: character.id })}>
            <RefreshCw />
            {refresh.isPending ? "Refreshing…" : "Refresh public profile"}
          </Button>
          <Link
            className="button button-primary"
            to="/characters/$characterId/$section"
            params={{ characterId: character.id, section: "gear" }}
          >
            <WandSparkles />
            Plan upgrades
          </Link>
        </div>
      </div>
      <div className="overview-layout">
        <section className="surface character-surface">
          <div className="surface-heading">
            <h2>Your character</h2>
            <Badge>{character.gameBuild ? `Build ${character.gameBuild}` : "Build unknown"}</Badge>
          </div>
          <Portrait character={character} />
          <div className="source-bar">
            <span>In-game observation · {age(character.observedAt)}</span>
            <span>Imported · {age(character.importedAt)}</span>
          </div>
        </section>
        <div className="progress-section">
          <section className="surface">
            <div className="surface-heading">
              <h2>Gear progression</h2>
              <Link className="button button-quiet" to="/characters/$characterId/$section" params={{characterId:character.id,section:"progression"}}>See slot details <ArrowRight size={14}/></Link>
            </div>
            <Metrics character={character} />
            {progress != null && (
              <>
                <div
                  className="progress-track"
                  role="progressbar"
                  aria-label="Equipped item level compared with legal maximum"
                  aria-valuenow={Math.round(progress)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <span style={{ width: `${progress}%` }} />
                </div>
                <div className="progress-label">
                  <span>Item-level ratio</span>
                  <span>{progress.toFixed(1)}%</span>
                </div>
              </>
            )}
            {character.maxItemLevel == null && (
              <div className="unknown-note">
                <CircleHelp />
                <p>The legal maximum is unknown until a current season ruleset is validated</p>
              </div>
            )}
            {character.targetItemLevel != null && (
              <p className="unknown-note">
                Your target is a planning goal, not a guaranteed drop or combat-performance estimate
              </p>
            )}
          </section>
          <CharacterWeek
            character={character}
            action={
              <Link className="button button-secondary week-link" to="/week">
                <CalendarClock size={15} />
                See every character's week
              </Link>
            }
          />
          <StatsSurface character={character} />
          <section className="surface">
            <div className="surface-heading">
              <h2>Before your next session</h2>
            </div>
            <div className="next-action-list">
              <div className="action-row">
                <Sparkles />
                <div>
                  <h3>{action.title}</h3>
                  <p>{action.description}</p>
                </div>
              </div>
              {character.gear.length === 0 && (
                <div className="action-row">
                  <Upload />
                  <div>
                    <h3>Capture equipped gear in game</h3>
                    <p>
                      Export with the addon, then reload the UI or log out to write SavedVariables
                    </p>
                  </div>
                </div>
              )}
              <div className="action-row">
                <Trophy />
                <div>
                  <h3>Review one activity at a time</h3>
                  <p>Mythic+, Raiding, and PvP keep their own metrics and comparison populations</p>
                </div>
              </div>
            </div>
          </section>
          <section className="surface">
            <div className="surface-heading">
              <h2>Activity</h2>
              <ActivityTabs value={activity} onChange={setActivity} />
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
        </div>
      </div>
    </>
  );
}
function GearPage({ character }: { character: Character }) {
  const { activity, setActivity } = useActivity(character.id);
  return (
    <GearEditor
      key={character.id + activity}
      character={character}
      activity={activity}
      setActivity={setActivity}
    />
  );
}
function GearEditor({
  character,
  activity,
  setActivity,
}: {
  character: Character;
  activity: Activity;
  setActivity: (activity: Activity) => void;
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
  const inspectorDirty = hydrated.current && (itemName !== (current?.name ?? '') || itemLevel !== (current?.itemLevel?.toString() ?? '') || enchant !== (current?.enchant ?? '') || gems !== (current?.gems.join(', ') ?? ''));
  useUpdateBlocker(dirty || inspectorDirty || target !== (character.targetItemLevel?.toString() ?? ''), 'Save your gear plan and slot edits before restarting');
  useEffect(() => {
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
  const equipped = character.gear.find((i) => i.slot === selected);
  const values = items.map((i) => i.itemLevel).filter((v): v is number => v != null);
  const draftLevel = values.length === 16 ? values.reduce((a, b) => a + b, 0) / 16 : null;
  const planned = current?.itemId ? itemMap.get(current.itemId) : undefined;
  function updateItem() {
    const ilvl = itemLevel.trim() ? Number(itemLevel) : null;
    if (ilvl != null && (!Number.isFinite(ilvl) || ilvl < 0)) {
      notify("Enter a valid item level");
      return;
    }
    const next = clearRenamedPlanIdentity(current, {
      slot: selected,
      name: itemName.trim() || `${slotNames[selected]} draft`,
      itemId: current?.itemId ?? null,
      itemLevel: ilvl,
      enchant: enchant.trim() || null,
      enchantCoverage: enchantEdited ? "complete" : (current?.enchantCoverage ?? "unknown"),
      gemsCoverage: gemsEdited ? "complete" : (current?.gemsCoverage ?? "unknown"),
      gems: gems
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean),
      appearanceId: current?.appearanceId ?? null,
      itemLink: current?.itemLink ?? null,
      stats: current?.itemLevel === ilvl ? current.stats : [],
      effects: current?.itemLevel === ilvl ? current.effects : [],
    });
    setItems((previous) => [...previous.filter((i) => i.slot !== selected), next]);
    setDirty(true);
    notify("Slot updated in your draft");
  }
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Gear planner</h1>
          <p>
            {character.name} · {spec(character)} · Your imported gear stays separate from this plan
          </p>
        </div>
        <div className="actions">
          {!dirty && query.data && (
            <span className="save-status">
              <Check size={14} />
              Saved locally
            </span>
          )}
          <Button
            variant="primary"
            disabled={save.isPending || query.isPending}
            onClick={() =>
              save.mutate({
                id: query.data?.id ?? crypto.randomUUID(),
                characterId: character.id,
                specId: character.specId,
                activity,
                rulesetId: query.data?.rulesetId ?? "unknown",
                name: name.trim() || "My upgrade plan",
                items,
                updatedAt: new Date().toISOString(),
              })
            }
          >
            <Download />
            {save.isPending ? "Saving…" : dirty ? "Save changes" : "Save plan"}
          </Button>
        </div>
      </div>
      <div className="gear-summary">
        <Metrics character={character} planned={draftLevel} />
        <ActivityTabs value={activity} onChange={setActivity} />
      </div>
      {query.isError ? (
        <ErrorState error={query.error} retry={() => void query.refetch()} />
      ) : (
        <div className="planner-layout">
          <section>
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
                Save target
              </Button>
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
                        onClick={() => setSelected(slot)}
                        onKeyDown={(e) => {
                          if (e.target !== e.currentTarget) return;
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setSelected(slot);
                          }
                        }}
                      >
                        <td>
                          <div className="planner-slot-name">{slotNames[slot]}</div>
                          {targetEquipped && <span className="planner-match"><Check size={12} aria-hidden="true" />Target equipped</span>}
                          {completion?.acquisition==='complete'&&!completion.complete&&<span className="item-subtitle">{completion.rank!=='complete'?'Upgrade goal outstanding':completion.enhancements!=='complete'?'Gems or enchant outstanding':'Variant details unverified'}</span>}
                        </td>
                        <td>
                          <ItemHoverCard itemId={observed?.itemId} item={observed?.itemId ? itemMap.get(observed.itemId) : undefined} gear={observed}><div className="gear-item planner-gear-item">
                            <ItemIcon icon={observed?.itemId ? itemMap.get(observed.itemId)?.icon : null} quality={observed?.itemId ? itemMap.get(observed.itemId)?.quality : undefined} />
                            <div>
                              <div className={observed ? "item-name" : "secondary"}>
                                {observed?.name ?? "Not imported"}
                              </div>
                              <div className="item-subtitle">Item level <Known>{level(observed?.itemLevel)}</Known></div>
                            </div>
                          </div></ItemHoverCard>
                        </td>
                        <td>
                          <ItemHoverCard itemId={item?.itemId} item={item?.itemId ? itemMap.get(item.itemId) : undefined} gear={item}><div className="gear-item planner-gear-item">
                            <ItemIcon icon={item?.itemId ? itemMap.get(item.itemId)?.icon : null} quality={item?.itemId ? itemMap.get(item.itemId)?.quality : undefined} />
                            <div>
                              <div className={item ? "item-name" : "secondary"}>
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
            {planned ? (
              <ItemIcon icon={planned.icon} quality={planned.quality} size="large" />
            ) : (
              <span className="item-icon">
                <Shield size={23} />
              </span>
            )}
            <h3>{slotNames[selected]}</h3>
            <p>Current gear · {equipped?.name ?? "Not imported"}</p>
            <Button onClick={() => setSlotSearch(true)} aria-label="Search items for this slot">
              <Search />
              Search items for this slot
            </Button>
            <Field label="Planned item name">
              <input
                value={itemName}
                maxLength={200}
                onChange={(e) => setItemName(e.target.value)}
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
                placeholder="Unknown"
              />
            </Field>
            <Field label="Enchant">
              <input
                value={enchant}
                maxLength={200}
                onChange={(e) => {
                  setEnchant(e.target.value);
                  setEnchantEdited(true);
                }}
                placeholder="Plan an enchant"
              />
            </Field>
            <Field label="Gems" hint="Separate gem names with commas">
              <input
                value={gems}
                onChange={(e) => {
                  setGems(e.target.value);
                  setGemsEdited(true);
                }}
                placeholder="Plan your gems"
              />
            </Field>
            <Button variant="primary" onClick={updateItem}>
              <Check />
              Update draft slot
            </Button>
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
function StandingsPage({ character }: { character: Character }) {
  const {activity,setActivity}=useActivity(character.id);
  const refresh=useAction(({id}:{id:string})=>api.refreshCharacter({id}),"Public activity data refreshed");
  return <><div className="page-heading"><div><h1>Standings</h1><p>{character.name} · Compare one activity and population at a time</p></div><Button disabled={refresh.isPending} onClick={()=>refresh.mutate({id:character.id})}><RefreshCw/>{refresh.isPending?"Refreshing…":"Refresh public profile"}</Button></div><div className="standings-tabs"><ActivityTabs value={activity} onChange={setActivity}/></div><ComparisonPage key={character.id+':'+activity} character={character} activity={activity}/></>;
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
function SettingsPage() {
  const settings = useSettings();
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
    <div className="settings-page">
      <div className="page-heading">
        <div>
          <h1>Settings</h1>
          <p>Make WOW Companion feel at home on your desktop</p>
        </div>
      </div>
      {settings.isPending ? (
        <div className="loading-surface" role="status">
          Loading preferences…
        </div>
      ) : settings.isError ? (
        <ErrorState error={settings.error} retry={() => void settings.refetch()} />
      ) : (
        <>
          <ConnectionsSection />
          <ProviderSettings />
          <UpdateSettings />
          <section className="settings-section" aria-labelledby="appearance-heading">
            <h2 id="appearance-heading">Appearance</h2>
            <p>Choose your theme and motion preferences</p>
            <div className="settings-section-body surface">
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
const characterRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/characters/$characterId/$section",
  component: CharacterRoute,
});
const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
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
  return (
    <WeekPage
      characters={roster.data ?? []}
      identity={(character) => (
        <div className="table-identity">
          <Avatar character={character} />
          <Identity character={character} />
        </div>
      )}
      onOpen={(character) =>
        void navigate({ to: "/characters/$characterId/$section", params: { characterId: character.id, section: "overview" } })
      }
    />
  );
}
const weekRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/week",
  component: WeekRoute,
});
function TonightRoute() {
  const roster=useRoster();const settings=useSettings();const navigate=useNavigate();
  return <TonightPage characters={(roster.data??[]).filter(c=>!c.archived)} selectedCharacterId={settings.data?.lastCharacterId??null} onOpen={(id,section)=>{
    if(section==='week')void navigate({to:'/week'});
    else void navigate({to:'/characters/$characterId/$section',params:{characterId:id,section}});
  }}/>;
}
const tonightRoute=createRoute({getParentRoute:()=>rootRoute,path:'/tonight',component:TonightRoute});
const router = createRouter({
  history: createHashHistory(),
  routeTree: rootRoute.addChildren([indexRoute, rosterRoute, characterRoute, settingsRoute, setupRoute, weekRoute, tonightRoute]),
});
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
export default function App() {
  return <RouterProvider router={router} />;
}
