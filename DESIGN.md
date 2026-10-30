---
name: WoW Companion
description: Adaptive desktop character and gear planning companion
colors:
  bg: "#f7f8fa"
  surface: "#fff"
  surface2: "#f0f2f5"
  surface3: "#e8ecf1"
  sidebar: "rgba(231,237,245,.82)"
  ink: "#1c2430"
  secondary: "#566374"
  muted: "#647184"
  line: "#dde3eb"
  accent: "#0065c7"
  accent-soft: "#e4f0fd"
  purple: "#8455b9"
  green: "#237548"
  amber: "#93600a"
  selected: "#e6f0ff"
  on-accent: "#fff"
  dark-bg: "#000"
  dark-surface: "#0a0a0a"
  dark-surface2: "#111"
  dark-surface3: "#1b1b1b"
  dark-sidebar: "#000"
  dark-ink: "#f5f5f5"
  dark-secondary: "#bfbfbf"
  dark-muted: "#9b9b9b"
  dark-line: "#292929"
  dark-accent: "#77b9ff"
  dark-accent-soft: "#101e2c"
  dark-purple: "#ceb0f3"
  dark-green: "#8fd4a6"
  dark-amber: "#ecc17a"
  dark-selected: "#102239"
  dark-on-accent: "#12263d"
  contrast-secondary: "#343e4c"
  contrast-muted: "#414d5c"
  contrast-line: "#8a97a8"
typography:
  headline:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "30px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-.025em"
  headline-compact:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "25px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-.025em"
  title:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "18px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-.015em"
  section-title:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.3
    letterSpacing: "-.015em"
  subheading:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
  body-compact:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
  button-label:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "12px"
    fontWeight: 550
    lineHeight: 1.45
  nav-label:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.45
  standing-measure:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "22px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "-.02em"
  level-measure:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "25px"
    fontWeight: 650
    lineHeight: 1.15
    letterSpacing: "-.025em"
  rank-measure:
    fontFamily: "-apple-system,BlinkMacSystemFont,\"Segoe UI Variable\",\"Segoe UI\",sans-serif"
    fontSize: "29px"
    fontWeight: 650
    lineHeight: 1.25
    letterSpacing: "-.025em"
rounded:
  r4: "4px"
  r5: "5px"
  r6: "6px"
  r7: "7px"
  r8: "8px"
  r9: "9px"
  r10: "10px"
  r12: "12px"
  r14: "14px"
  circle: "50%"
spacing:
  s2: "2px"
  s3: "3px"
  s4: "4px"
  s5: "5px"
  s6: "6px"
  s7: "7px"
  s8: "8px"
  s9: "9px"
  s10: "10px"
  s11: "11px"
  s12: "12px"
  s13: "13px"
  s14: "14px"
  s15: "15px"
  s16: "16px"
  s17: "17px"
  s18: "18px"
  s19: "19px"
  s20: "20px"
  s22: "22px"
  s24: "24px"
  s25: "25px"
  s26: "26px"
  s28: "28px"
  s30: "30px"
  s34: "34px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    typography: "{typography.button-label}"
    rounded: "{rounded.r7}"
    padding: "7px 12px"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.button-label}"
    rounded: "{rounded.r7}"
    padding: "7px 12px"
    height: "32px"
  button-secondary-hover:
    backgroundColor: "{colors.surface2}"
  button-quiet:
    textColor: "{colors.accent}"
    rounded: "{rounded.r7}"
    padding: "7px 0"
  search:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.muted}"
    rounded: "{rounded.r7}"
    padding: "6px 9px"
  nav-item:
    textColor: "{colors.secondary}"
    typography: "{typography.nav-label}"
    rounded: "{rounded.r7}"
    padding: "9px 10px"
    height: "36px"
  nav-item-active:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
  tag:
    backgroundColor: "{colors.surface2}"
    textColor: "{colors.secondary}"
    rounded: "{rounded.r5}"
    padding: "3px 6px"
  tag-blue:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent}"
  detail-panel:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.r12}"
    padding: "20px"
  segmented:
    backgroundColor: "{colors.surface3}"
    rounded: "{rounded.r8}"
    padding: "3px"
  appearance:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.r10}"
    padding: "10px"
  detail-item-icon:
    backgroundColor: "{colors.surface2}"
    rounded: "{rounded.r9}"
    size: "48px"
  appearance-thumbnail:
    rounded: "{rounded.r6}"
    size: "48px"
---

# Design System: WoW Companion

## Overview

**Creative North Star: "The character folio"**

A calm desktop companion gives character identity and progression room to lead, with a persistent translucent sidebar, quiet silver separators, system typography, and blue selection. Apple design principles guide hierarchy, feedback, and material depth within an Electron-shaped shell and familiar shadcn-style controls

The Electron, React, and shadcn Base UI implementation in src/renderer is the visual authority. Home opens the roster with a selected-character pane; fictional demo data is explicitly labeled

The app now runs on real data: the player's installed game files supply item names, icons, and sources; the Blizzard API (the player's own key) supplies renders, gear, stats, and raid history; Raider.IO supplies ratings, top players, and weekly keys; and the companion addon supplies the exact Great Vault. The interface assumes a player who knows little about WoW and nothing about files, so every source is named in plain words, estimates say they are estimates, and nothing asks the player to locate a file

Use PRODUCT.md for durable product constraints and .impeccable/surfaces/src-renderer-app-tsx.md for the current surface composition

**Brand mark:** a blue and white compass "W" (public/assets/wow-companion-logo.png in the sidebar, wow-companion-icon.png, .ico, and .icns for the window and app icons). The app icons are cropped so the mark fills the canvas edge to edge; the sidebar logo keeps its own padding

**Key Characteristics:**

- Adaptive light and dark semantic surfaces with a single interaction accent
- Readable compact controls and tabular progression numbers
- Character imagery framed by consistent slot alignment
- Fast state feedback with reduced-motion and reduced-transparency alternatives
- Official character renders and game icons are the only imagery; everything else is type, tone, and thin bars
- Every number carries its source and age, and an estimate wears an amber "Estimated" tag where live data wears a green "Live from the game"

## Colors

The palette combines cool paper and silver neutrals with a clear blue interaction accent, with each semantic variable replaced in the dark theme

### Primary

- **Companion blue** (`accent` / `dark-accent`): primary actions, active navigation, focus outlines, progression fills, and the player's standing
- **Blue wash** (`accent-soft` / `dark-accent-soft`): quiet selected context and blue tags
- **On accent** (`on-accent` / `dark-on-accent`): text and SVG strokes on filled blue controls, including the selected appearance check

### Secondary

- **Epic violet** (`purple` / `dark-purple`): epic item names and slot outlines
- **Ready green** (`green` / `dark-green`): success, positive deltas, and local status
- **Attention amber** (`amber` / `dark-amber`): missing improvements and the attainable-target marker

### Neutral

- **Paper and graphite** (`bg`, `surface`, `surface2`, `surface3` and dark counterparts): app background, containers, quiet controls, and recessed tracks
- **Sidebar material** (`sidebar` / `dark-sidebar`): translucent navigation ground
- **Ink, secondary, and muted**: primary content, supporting text, and metadata in both themes
- **Silver line** (`line` / `dark-line`): dividers, table rules, and field borders
- **Selected row wash** (`selected` / `dark-selected`): chosen gear or the player's row

The frontmatter stores source CSS color strings without conversion. Green and amber tag backgrounds mix their semantic color at 12% with the surface; the character stage uses a 9% blue radial wash. The theme setting is System, Light, or Dark, saved in SQLite and applied through `data-theme`

**The Pure Black Rule.** Dark mode grounds the app, sidebar, and title bar overlay on `#000`, with near-black surfaces stepping up from `#0a0a0a`. Don't reintroduce blue-gray dark neutrals

**The Selection Rule.** Use the blue accent to indicate navigation, a chosen item, or an available action; keep epic item purple, success green, and attention amber semantic

High-contrast preference adds the three `contrast-*` neutral overrides, solid sidebar and sheet surfaces, and stronger button, table-cell, and appearance borders. The existing dark-theme selector retains its own neutral values by specificity; this documents the actual support, not a complete forced-colors implementation

## Typography

**Display and Body Font:** `-apple-system,BlinkMacSystemFont,"Segoe UI Variable","Segoe UI",sans-serif`

Use the platform font without a downloaded font asset, with automatic optical sizing and antialiasing. System typography is an explicit user choice for this Apple-inspired desktop world

### Hierarchy

- **Headline:** 30px / 650 / 1.15 / -.025em, reduced to 25px at 520px and below
- **Title:** 18px / 650 / 1.3 / -.015em, with 17px progression headings
- **Subheading:** 15px / 600 / 1.35, while action headings and field labels use the denser 12px treatment
- **Body:** 14px / 400 / 1.45, 13px at 520px and below; descriptions also use 13px
- **Labels:** 12px, generally 1.5; button labels use 550 weight and navigation uses 13px / 500
- **Level measure:** 25px / 650 / 1.15 / -.025em, with responsive 23px and 24px variants
- **Standing measure:** 22px / 650 / 1.2 / -.02em, reduced to 21px on the narrowest layout
- **Rank measure:** 29px / 650 / 1.25 / -.025em, switching to 25px and 23px in the compact layouts
- **Sheet title:** 22px with title weight and tracking; sheet paragraphs use 12px / 1.7
- **Navigation group label:** 12px / 600 / .035em tracking, sentence case

The frontmatter records reusable type roles; responsive and component overrides above describe the exact implementation rather than an invented modular ratio

**The Numeric Alignment Rule.** Use tabular numerals and consistent column alignment for item levels, deltas, rating, and rank. Numeric table columns are right aligned, and an Unknown value in them uses muted ink so real figures stand out

## Layout

The spacing inventory in frontmatter is extracted from observed repeated padding, margins, and gaps, not an imposed arithmetic scale. Ordinary controls use 7px or 9px internal steps, related groups use 8–14px gaps, and sections use 20–28px spacing

- **Desktop shell:** a resizable sidebar (240px default, 220–360px, saved in settings, 64px icon rail in compact windows) runs the full window height, including under the title bar. The workspace toolbar (breadcrumbs, character count, and Import & sync) is the integrated title bar: one borderless 48px row over the workspace only, filled with `bg`, acting as the drag region while its controls stay clickable. Never add a separate title bar strip above it. Only the page below the title bar scrolls, so the scrollbar never runs under the title bar or the native window controls. Windows and Linux use Electron's native window controls overlay, tinted to match the theme; macOS uses native traffic lights inset into the sidebar, which adds 48px top padding. There is no setting to switch to a system frame
- **Toolbar and page:** in Electron the toolbar is the 48px title bar, and its right padding clears the native window controls; in a plain browser it is a 56px sticky bar. Page padding is 30px 32px 40px
- **Roster:** flexible character table and 310px selected-character pane separated by 24px; the pane combines identity, concept artwork or an initial, progression, observation age, and an Open character action
- **Character split:** minmax(0, 1.28fr) and minmax(290px, 1fr), separated by 28px; the paper doll is at least 500px tall with a 405px character stage
- **Slot alignment:** two opposing gear columns, 16px from the stage edges; weak-slot rows align at 68px / flexible / 38px, with the range and delta right aligned
- **Planner:** flexible table and 265px detail panel separated by 22px; the table scrolls horizontally and uses 55px minimum row height with 10px 12px cell padding
- **Standings:** three comparison columns with quiet dividing rules
- **Wardrobe:** model stage and outfit editor use minmax(300px, 1fr) and minmax(0, 1.05fr), separated by 24px; appearance cards form three columns with 10px gaps

At 1350px and above, body minimum height becomes 850px, page padding becomes 30px 34px, the character gap is 34px, and the stage is 450px tall. At 1100px and below, navigation becomes a 62px icon rail, page padding is 24px, the planner panel narrows to 235px, and slot labels hide

At 1250px and below, the roster pane narrows to 285px with an 18px gap and the observation column hides. At 900px and below, roster content stacks, the selected-character pane uses two columns, and the observation column returns. The wardrobe stage and editor stack, and the planner detail panel remains visible below the table in a two-column layout

At 800px and below, character content stacks and the progress panel uses two columns. At 520px and below, the icon rail narrows to 48px, page padding becomes 20px 13px, progress and standings stack, and the selected-character pane and planner detail panel become single-column. The roster hides target-gap and observation columns while retaining those details in the selected pane; wardrobe appearance choices use two columns

These are responsive review layouts for the mock, not a promise of complete mobile workflows. Gear editing remains available below the table in the narrow layout

## Elevation & Depth

Tonal surfaces and silver separators provide the everyday hierarchy. Blur belongs to the sidebar and the sheet, while the broad app shadow gives the local mock a desktop-window frame

### Shadow Vocabulary

- **Window and toast:** light `0 16px 48px rgba(27,44,68,.1)`, dark `0 16px 48px rgba(0,0,0,.2)`
- **Selected segment:** `0 1px 4px rgba(20,38,60,.12)`
- **Sheet:** `-10px 0 36px rgba(20,35,55,.12)`
- **Character cutout:** `drop-shadow(0 8px 12px rgba(25,43,60,.12))`
- **Wardrobe cutout:** `drop-shadow(0 10px 16px rgba(30,50,70,.1))`
- **Slot edge:** inset `0 0 0 1px rgba(255,255,255,.12)`, plus a 45% violet outer outline

Sidebar blur is 28px with 130% saturation; the sheet uses 24px blur and a 96% surface mix. Reduced-transparency preference replaces both with opaque surfaces and removes backdrop filters

**The Material Rule.** Reserve broad shadows for the app window, overlay sheet, and toast; use surface tone and separators inside the workspace

## Shapes

The radius inventory is exact and purpose-led: 4px tracks and badges, 5px tags and table icons, 6px smaller controls and thumbnail corners, 7px ordinary controls and navigation, 8px segmented groups and action icons, 9px character switch and detail icon, 10px appearance cards and summary surfaces, 12px major content panels, and 14px desktop window corners. Status dots and check badges use circles

The narrowest window radius is 10px. Ordinary fields have 1px neutral borders, chosen appearances have a 2px blue border, and dividers remain 1px. Raster item art stays clipped to its icon frame

## Components

### Buttons

Compact, clear controls use a 7px radius, 7px 12px padding, 12px / 550 labels, 7px icon gap, and a 32px minimum height. Compact variants use 5px 9px padding and a 28px minimum height

- **Primary:** accent fill, on-accent text, transparent border, and brightness(.96) on hover
- **Secondary:** surface fill and line border, changing to surface2 on hover
- **Quiet:** transparent fill, no border, accent text, no horizontal padding, and underline on hover
- **Icon-only:** transparent, 6px radius and padding, minimum 30px square, and surface3 hover fill
- **Focus:** 3px accent outline with 3px offset on buttons, links, inputs, and selects
- **Press:** scale(.98), with 100ms background and color transitions; disabled buttons use .45 opacity and a disallowed cursor

View entry fades from .7 opacity to 1 over 180ms ease-out. Reduced-motion preference removes animation, transition, and active scaling and returns scroll behavior to auto

### Chips and Segmented Controls

Tags use 5px corners, 3px 6px padding, 12px / 550 labels, and neutral or semantic color washes. Activity segments use an 8px surface3 group with 3px padding and 2px gaps; each segment has 6px corners, 5px 13px padding, and a 27px minimum height. Selection uses the surface fill, small shadow, 600 weight, and `aria-pressed`

### Cards and Containers

Major paper doll, wardrobe, rank overview, and detail surfaces use 12px corners and the surface color. The planner detail panel uses 20px padding; the rank overview uses 20px 22px. Avoid turning every measurement into an independently elevated card

### Inputs and Fields

Search uses a 7px bordered surface with 6px 9px padding and an authored 14px search icon. Selects use the same radius with 7px 9px padding and a 32px minimum height. The paste-an-export textarea inside Sync uses 8px corners, 12px padding, 120px height, vertical resize, and 12px / 1.6 system type

Dropdowns use the shadcn Base UI Select through the shared `AppSelect` wrapper, and on/off options use shadcn Toggle buttons that show their state. Never use native select elements or checkbox inputs

Labels are supplied through native text or aria-label attributes

### Navigation

The persistent destinations are Characters, This week, then the selected character's Character, Gear planner, Standings, Top players, and Wardrobe, with Characters as the default. Rows have 7px corners, 9px 10px padding, 36px minimum height, and a 10px icon gap. Neutral rows use secondary ink with surface3 hover; the current destination uses accent fill, on-accent ink, and `aria-current="page"`. Character-scoped rows are disabled until a character exists

The character switch opens a searchable popover and retains the current section when choosing a character. Search matches name, realm, or class; arrow keys move through choices and Escape dismisses the popover. Item search lives in the title bar beside Sync and opens with Ctrl+K. Settings sits at the foot of the sidebar and opens a full settings page for appearance, sidebar width, motion, connections, and data. The sidebar carries no status text, and neither does the title bar: counts of stored characters were removed because they told the player nothing to act on

### Character Roster

Searchable, sortable rows align an official Blizzard avatar (the initial when none is cached), identity, equipped item level, target gap, activity metric, and observation age beside a 310px selected-character pane. Row selection updates the pane; Open character enters the full sheet. The pane shows Blizzard's character render, cropped to the figure on a transparent stage, with a caption naming its source and age. Favorites, a main character, and reversible archive and restore remain available

Gear drafts, outfits, and activity filters stay scoped to the character ID. An empty roster offers Set up WOW Companion as the primary action and Add character beside it; there is no file import or demo data on this screen

### Character and Gear

The Character page pairs a render surface (the Blizzard render, or a large initial when none exists) with a column of surfaces: Gear progression, Great Vault this week, Stats, Before your next session, and Activity. Gear rows show the game's own item icon in a quality-edged frame and open an item card on hover or keyboard focus, so inspecting never consumes the row's click action

The Gear planner keeps equipped and drafted gear side by side. Choosing a slot offers a live item search by name rather than an item ID. Drafts are saved locally and never imply an equipped change

### Standings

Metric headers identify activity and comparison population. Search filters player name or realm and the population selector changes the cohort. Mythic+, Raiding, and PvP show distinct metric context and never share a universal score. The local roster table is labelled as the player's own tracked characters, never as a world rank; real ladders live on Top players

### Wardrobe

Appearance buttons use 10px corners and a 2px selection border with a check badge and `aria-pressed`. Thumbnails are fixed at 48px × 48px, aspect ratio 1, object-fit contain. Appearance slots include separate left and right shoulders; each slot remembers its appearance and variant when changing slots or characters. Unknown collection ownership stays unknown

The stage inspects a model the player attaches and keeps the outfit editor usable without one. Wardrobe changes never alter an imported model

### Sheets and Feedback

Sheets sit in a fixed layer on the right below the 40px title bar, at min(390px, 95%) width, with 26px padding, translucent surface, blur, and a leftward shadow. Close and Escape dismiss them. Toasts centre over the workspace (offset by the live sidebar width), use ink background and surface text, 10px corners, 12px 18px padding, and status semantics

Progress is shown in place: a 5–7px track under the heading it belongs to, and a spinning refresh icon on the control that started it

### Sync

The title bar's Sync button is the single place data freshness lives. It reads "Synced 4 min ago" at rest, "Syncing 2 of 3" while running (the refresh icon spins), and gains an amber alert icon when a character could not update. The app syncs on every launch and when the window returns to the front after ten minutes, so the button is mostly a status line. Its sheet leads with one primary action, Sync now, a result row per character (check or amber alert, plus a plain reason such as "No internet connection"), and one addon status block that offers the single next step (Set up, Install, or nothing). File choosing and pasting are hidden behind a quiet "Import from a file instead" disclosure that most players never open. The player is never asked where a file is

### This Week

A reset surface and a WoW Token surface sit side by side above a table of every character's Great Vault. Reset countdowns use 19px tabular numerals with the local clock time beneath. Each vault track is three 6px bars that fill with accent blue as rewards unlock, with the threshold, or the reward name once unlocked, beneath each bar and a plain sentence ("1 more raid boss unlocks your 2nd choice") under it on the character page. A green "Live from the game" tag marks addon data and an amber "Estimated" tag marks provider estimates. Unknown tracks keep empty bars and the word Unknown

### Top Players

A three-measure summary, a talent-build list with copy buttons, and one table of what the best players of the player's specialization wear. Every count is shown as n/N beside the item, enchant, or gem, and the heading names the population ("Top 20 Blood Death Knight players by Mythic+ score in MN Season 2, North America"). Rows pair the popular item with the player's own, marking matches with a green Popular tag and gaps in amber. Region defaults to North America and is changeable from the heading

### Item Inspection

Any item name or icon opens a hover card on the right: a large quality-edged icon, quality-coloured name, item level (labelled Base when it is the unupgraded value), slot and armor type, binding, stat lines, effects, and where it drops. Equipped gear shows its exact recorded stats and says so; other items show base stats from Blizzard with the item level they apply to. Item quality colours are tuned per theme to hold 4.5:1 text contrast, and epic reuses the system violet

### Icons

The original mock contained 29 authored inline SVG symbols: snow, user, gear, trophy, shirt, chevron, down, refresh, search, plus, check, close, moon, sun, info, disk, arrow, bookmark, settings, wand, ring, clock, sort, eye, copy, people, star, pause, and minus, plus decorative window-control geometry. Each uses a 24 × 24 viewBox, currentColor, no fill by default, 1.6px stroke, rounded caps and joins, and aria-hidden when adjacent to text. Selected favorite stars add a quiet amber fill

Default icon size is 18px; ordinary button icons are 14px, navigation 17px or 20px in the compact rail, action icons 15px, and the appearance check is 11px with 2px stroke. Named icon-only controls carry an accessible label. The shipped app draws its interface icons from Lucide at the same 1.6px stroke weight, so these sizes and caps still apply. Game item icons are the only raster art and are decoded from the player's own install, never redistributed

## Do's and Don'ts

### Do:

- Do preserve the semantic light/dark token pairing and use on-accent for filled blue controls
- Do keep labels readable at the observed 12px minimum and align numeric comparisons
- Do label sample populations, snapshot age, and static concept artwork honestly
- Do keep design sources and assets local and use T3 Code's native planner
- Do omit trailing periods from user-facing UI copy and assistant replies
- Do name the source and age of every real number, and mark estimates as estimates
- Do answer a non-technical player's question in plain words: say "Sync", not "SavedVariables", and never ask for a file path
- Do show progress where the work was requested, with the control or heading that started it

### Don't:

- Don't present fictional item levels, rankings, or season limits as current game facts
- Don't turn item-level changes into an invented combat-performance estimate
- Don't describe model inspection as a character builder; attached models never change with outfit choices
- Don't replace the chosen Apple-inspired world with an unrelated visual identity
- Don't draw custom window buttons, add a title bar border, or offer a native-frame option
- Don't use native select elements or checkbox inputs
- Don't show status that asks for no action, such as a count of stored characters
- Don't present an estimated Great Vault or a popularity count without its population and source
- Don't offer a manual file import as a first-line action

