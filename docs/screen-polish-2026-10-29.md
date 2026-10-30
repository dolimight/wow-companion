# Screen polish · October 29, 2026

Polished the existing screens in sidebar order, preserving the pure-black theme, integrated title bar, resizable sidebar, and current data workflows

| Screen | Changes |
| --- | --- |
| Characters | Tighter selected-character portrait, aligned metrics, wrapping roster footer, visible row focus |
| This week | Clearer Vault spacing and supporting text, keyboard activation for character rows |
| Tonight | Visible goal/time labels, consistent Toggle styling, compact recommendation facts, bounded duration input |
| Character | Consistent section headings, metric alignment, readable supporting text |
| Progression | Structured coverage notice, better toolbar spacing, quieter unknown item names |
| Gear planner | Clearer inspector heading, wrapping actions, readable enhancement details, preserved current/planned comparison |
| Inventory | Compact location controls, wrapping item names, clearer unknown states, reliable keyboard item previews |
| Simulations | Side-by-side baseline and engine at wide widths, larger profile editor, aligned panels and wrapping actions |
| Wardrobe | Outfit editing first, optional 3D inspection disclosure, clearer editor toolbar |
| Standings | Consistent heading and metric sizes, readable source and evidence details |
| Top players | Wrapping item/player names, aligned actions, consistent summary spacing |
| Settings | Consistent section rhythm, bounded connection credentials, readable descriptions and wrapping actions |

Shared refinements include semantic Toggle borders and pressed states, wrapping page headings/actions, route-aware character-switcher dismissal, and continuously updated orbit damping in the 3D inspector

## Verification

- TypeScript check and all 242 tests across 40 files pass
- Production Electron build passes
- All 32 native acceptance steps pass with main-process and renderer debuggers attached
- All 12 screens checked for horizontal overflow at 1460px in dark mode and 820px in light mode
- Native acceptance uses isolated fictional data and does not modify the personal character database
- Gear previews, Inventory details, saved plans, outfits, character isolation, deletion, and embedded GLB rendering retain coverage
- Windows runtime verified; macOS runtime and in-game addon behavior were not exercised by this UI pass

The local acceptance reports and screenshots are stored under `.local/debug-acceptance-*/acceptance`

Final run: `.local/debug-acceptance-1793314875719/acceptance/report.json` with debugger evidence in the sibling `debugger.json`
