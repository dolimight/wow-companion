# Demo illustration

frost-mage-concept.png is the unchanged generated mock illustration, used only for the labeled fictional demo mage
The exact generation prompt is retained beside the image in frost-mage-concept.prompt.md
The character is an AI-generated concept illustration created with the built-in image generation tool, with genuine PNG alpha; it is not a captured player or a 3D model
No Blizzard character models or game archives ship with the application

# WOW Companion logo

wow-companion-logo.png is the generated transparent app symbol, used in the sidebar, title bar, window icon and favicon
Created with the built-in image generation tool on 2026-10-15, with one cleanup edit
Exact prompts are retained in wow-companion-logo.prompt.md
Native icon exports remove the transparent outer padding and fill the square bounds, as requested
wow-companion-icon.png, wow-companion.ico and wow-companion.icns are format/size exports generated with `npm run icons`
The cross-platform Electron helper crops the visible alpha bounds and exports PNG, ICO, and ICNS without a PowerShell or image-library dependency

## Nightly and Halloween icons

Created with the built-in image generation tool on 2026-11-02 as transparent edits of the Classic blue symbol

- [Nightly purple](wow-companion-nightly-logo.png) retains the compass-and-W emblem with violet and lavender facets — [exact prompt](wow-companion-nightly.prompt.md)
- [Halloween](wow-companion-halloween-logo.png) uses pumpkin orange, a green stem, and a carved jack-o'-lantern W — [exact prompt](wow-companion-halloween.prompt.md)

The matching `-icon.png`, `.ico`, and `.icns` assets are generated exports, retaining alpha and filling the native icon bounds

```sh
npm run icons -- --variant nightly
npm run icons -- --variant halloween
```

Settings → Appearance → App icon offers Build default, Classic blue, Nightly purple, and Halloween
Build default follows the installed version: purple for Nightly, blue for Stable
The saved choice updates the sidebar, favicon, and running native window or macOS Dock
The same choice sets the primary color and its selection/focus highlights to Classic blue, Nightly purple, or Halloween orange in either Light or Dark appearance
Windows pinned shortcuts retain the installer icon; nightly release packaging embeds the purple ICO

## Holiday collection

Generated on 2026-11-02 with the built-in image generation tool as transparent edits of the Classic compass-and-W emblem
These are manual choices in the icon picker; Build default continues to follow the installed release track
Each choice supplies a matching primary color in Light and Dark appearance
The dropdown shows each logo beside its name, including the currently resolved Build default

| Holiday | Logo | Exact prompt |
| --- | --- | --- |
| New Year’s | [Champagne gold and navy](wow-companion-newyear-logo.png) | [Prompt](wow-companion-newyear.prompt.md) |
| Valentine’s Day | [Rose with a faceted heart](wow-companion-valentine-logo.png) | [Prompt](wow-companion-valentine.prompt.md) |
| St Patrick’s Day | [Emerald with a shamrock](wow-companion-stpatrick-logo.png) | [Prompt](wow-companion-stpatrick.prompt.md) |
| Easter | [Mint and lilac with a decorated egg](wow-companion-easter-logo.png) | [Prompt](wow-companion-easter.prompt.md) |
| July 4 | [Red, white, and blue with a star](wow-companion-independence-logo.png) | [Prompt](wow-companion-independence.prompt.md) |
| Halloween | [Pumpkin-orange carved W](wow-companion-halloween-logo.png) | [Prompt](wow-companion-halloween.prompt.md) |
| Thanksgiving | [Copper harvest emblem](wow-companion-thanksgiving-logo.png) | [Prompt](wow-companion-thanksgiving.prompt.md) |
| Christmas | [Evergreen, red, and gold with a Santa hat](wow-companion-christmas-logo.png) | [Prompt](wow-companion-christmas.prompt.md) |

Every logo has matching `-icon.png`, `.ico`, and `.icns` exports
Regenerate a holiday’s native exports with `npm run icons -- --variant newyear`, substituting `valentine`, `stpatrick`, `easter`, `independence`, `thanksgiving`, or `christmas` as appropriate
