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
Windows pinned shortcuts retain the installer icon; nightly release packaging embeds the purple ICO
