# Marketing assets

Original promotional artwork and real app captures for the project README and sharing

| File | Use | Source |
| --- | --- | --- |
| [wow-companion-banner.png](wow-companion-banner.png) | Wide README header | Generated promotional artwork |
| [wow-companion-social.png](wow-companion-social.png) | Standalone social card | Generated promotional artwork |
| [character-overview-dark.png](character-overview-dark.png) | Character overview | Unaltered dev-app capture |
| [gear-plan-dark.png](gear-plan-dark.png) | Gear plan paper doll | Unaltered dev-app capture |
| [talents.png](talents.png) | Talent editor | Unaltered dev-app capture |
| [item-search-dark.png](item-search-dark.png) | Item search dialog | Unaltered dev-app capture |
| [simulation-roster.png](simulation-roster.png) | Plan ranked among top players | Unaltered dev-app capture |
| [simulation-compare.png](simulation-compare.png) | Slot-by-slot simulation comparison | Unaltered dev-app capture |
| [top-players.png](top-players.png) | Top players and talent builds | Unaltered dev-app capture |
| [buymeacoffee-button.png](buymeacoffee-button.png) | README support link | Official Buy Me a Coffee button |

The banner and social card were created on 2026-11-03 with the built-in image-generation tool, using the existing [compass logo](../../public/assets/wow-companion-logo.png) as a supporting brand reference. Their atlas scenes are original promotional illustrations, not game maps or app screenshots

The [exact prompts](prompts.md) retain the requested copy, visual direction, and restrictions. The existing logo's provenance remains in [app assets](../../public/assets/README.md)

The app captures were taken on 2026-11-12 from the development build in dark mode at 1460 pixels wide (the gear plan at 1460 by 1120), using the maintainer's own character with the owner's consent. Item icons, talent art, and the character model come from the locally installed game; top-player names, scores, and builds come from public Raider.IO rankings; damage values come from a local SimulationCraft run

Keep these documentation assets outside the app's shipping `public/assets` directory so release packages don't include marketing-only imagery

The support button is an unaltered copy of the [official blue PNG](https://cdn.buymeacoffee.com/buttons/v2/default-blue.png), downloaded on 2026-11-04. The README uses the local image so rendering doesn't depend on the dynamic button API or an external image proxy
