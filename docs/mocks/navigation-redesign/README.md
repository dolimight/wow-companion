# Navigation redesign mock

Interactive mock of the proposal in [the navigation and workflow redesign](../../specs/2026-10-30-navigation-redesign.md)
Open `index.html` in any browser; it is one self-contained file with no network requests and no real data
All characters, items, ratings, and numbers are fictional

## What it shows

- Seven primary destinations with explicit scope: Characters, Tonight, This week, then Overview, Gear, Performance, and Wardrobe for the selected character
- A character switcher above the four character links, with Sync, Updates, and Settings as footer icon buttons
- Application updates from the footer: one panel covers current, checking, available, downloading, ready to install, and error, and a dot on the icon marks an update that is waiting
- A matching Updates and About row in Settings that runs the same check
- Characters with the selected pane and three named exits, a first-run state, and Tonight and This week as separate roster-wide views
- Gear as Progress, Plan, Owned, and Simulations, with a single Save plan action and an owned item staged into the plan
- Performance as Your standing, Leaders, History, and Reports, with an honest player detail and aggregate gear sample
- A narrow 900px window with the labeled navigation drawer instead of an icon rail
- Dark and light themes using the app's existing tokens from DESIGN.md

Use the controls above the window to switch width, theme, and the empty first-run roster
Click the character switcher to cycle characters; the section stays where it is
Links to a deep state: `index.html#gear/plan`, `#gear/owned`, `#performance/leaders`, `#overview/narrow/drawer`, `#characters/light`, `#characters/empty`, `#characters/update/available`, `#characters/update/downloading`, `#characters/update/ready`, `#characters/update/error`
Use the Update control above the window to jump between update states, or click the download icon in the footer to run a check

## What it does not prove

This is a visual and flow review artifact, not application behavior
Whether the redesigned journeys feel understandable still needs a walkthrough with the player

`screenshots/` holds captures of each state for quick review
