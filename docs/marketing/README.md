# Marketing assets

Original promotional artwork and real app captures for the project README and sharing

| File | Use | Source |
| --- | --- | --- |
| [wow-companion-banner.png](wow-companion-banner.png) | Wide README header | Generated promotional artwork |
| [wow-companion-social.png](wow-companion-social.png) | Standalone social card | Generated promotional artwork |
| [character-overview.png](character-overview.png) | Dark character overview | Unaltered Electron acceptance capture |
| [item-search.png](item-search.png) | Light item-search dialog | Unaltered Electron acceptance capture |

The banner and social card were created on 2026-11-03 with the built-in image-generation tool, using the existing [compass logo](../../public/assets/wow-companion-logo.png) as a supporting brand reference. Their atlas scenes are original promotional illustrations, not game maps or app screenshots

The [exact prompts](prompts.md) retain the requested copy, visual direction, and restrictions. The existing logo's provenance remains in [app assets](../../public/assets/README.md)

The app captures come from the isolated desktop acceptance run `debug-acceptance-1793739273403`, at source commit `d0395db4880e2fd45fdd64b294e8c84a7911b1ca`

- `character-overview.png` copies `acceptance/polish-character-demo-dark-1460.png`
- `item-search.png` copies `acceptance/item-search-populated-light-820.png`

Characters, item names, ratings, and other values in these captures are fictional test data. The mage is the app's labeled generated concept illustration, not a captured player model. These images don't establish live-provider behavior, a current season ceiling, or a dynamic 3D character builder

Keep these documentation assets outside the app's shipping `public/assets` directory so release packages don't include marketing-only imagery
