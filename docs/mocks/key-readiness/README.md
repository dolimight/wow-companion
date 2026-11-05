# Key readiness mock

Interactive mock of a Performance tab that answers "Is this character ready for Mythic +X?"
Open `index.html` in any browser; it is one self-contained file with no network requests
The character, dungeons, runs, and comparison numbers are fictional

## What it shows

- **The question first:** a key-level stepper with one verdict (You've timed it, Within reach, Stretch, Not yet, or Not enough data), labelled as an estimate, with a one-sentence reason
- **Scope controls:** dungeon, role, and the comparison group, which is always named (spec, region, season)
- **Your key range:** every level from +2 to +20 colored by its verdict; select one to check it
- **Checks for the selected level:** your own runs, item level, Mythic+ score, and empty enchants and gems. Each check names its measure and its group of players, and the item level and score checks show where you sit against the middle half of players who timed that level
- **By dungeon:** your best timed key and time to spare per dungeon; selecting one focuses every check on that dungeon
- **What would move you up:** concrete next steps that link into the gear plan and Tonight
- **Sources:** when each value was observed, including the in-game score saved by the addon

## Rules the verdict follows

- Nothing is combined into a single readiness score; each check compares one measure with one group
- "You've timed it": this level or higher in the selected dungeon, or in at least half of the season's dungeons
- More than one level past your best timed key is "Not yet", whatever the gear comparison says
- "Within reach": item level and score both at or above the median of players who timed the level
- "Stretch": one or both under the median but within the lower quarter; "Not yet": at least one below the lower quarter
- Fewer than 30 timed runs in the comparison group gives "Not enough data", and the comparisons show Unknown rather than an estimate

Use the controls above the window to switch width, theme, and the missing-sample state
Deep links: `index.html#14`, `#light`, `#narrow`, `#sparse`, `#dungeon-5/11` (combine with `/`)

## Open questions

- The comparison group needs per-level item level and score at the time of each timed run. Raider.IO's run data is the likely source; whether it gives enough runs per spec and level without heavy crawling still has to be checked
- Whether the 30-run minimum and the lower-quarter cutoffs feel right needs a walkthrough with the player
