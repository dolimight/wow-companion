# Marketing assets

Original promotional artwork and real app captures for the project README and sharing

| File | Use | Source |
| --- | --- | --- |
| [wow-companion-banner.png](wow-companion-banner.png) | Wide README header | Generated promotional artwork |
| [wow-companion-social.png](wow-companion-social.png) | Standalone social card | Generated promotional artwork |
| [roster.png](roster.png) | Dark roster table | Unaltered Electron acceptance capture |
| [character-overview.png](character-overview.png) | Dark character overview | Unaltered Electron acceptance capture |
| [gear-plan.png](gear-plan.png) | Dark gear plan | Unaltered Electron acceptance capture |
| [item-search.png](item-search.png) | Dark item-search dialog | Unaltered Electron acceptance capture |
| [buymeacoffee-button.png](buymeacoffee-button.png) | README support link | Official Buy Me a Coffee button |

The banner and social card were created on 2026-11-03 with the built-in image-generation tool, using the existing [compass logo](../../public/assets/wow-companion-logo.png) as a supporting brand reference. Their atlas scenes are original promotional illustrations, not game maps or app screenshots

The [exact prompts](prompts.md) retain the requested copy, visual direction, and restrictions. The existing logo's provenance remains in [app assets](../../public/assets/README.md)

The app captures come from the isolated desktop acceptance run `desktop-acceptance-1794529946390` on 2026-11-12, using the source of the Death Knight runeforge change (#70). All are dark mode at 1460 pixels wide

- `roster.png` copies `acceptance/polish-characters-dark-1460.png`
- `character-overview.png` copies `acceptance/polish-character-demo-dark-1460.png`
- `gear-plan.png` copies `acceptance/polish-gear-dark-1460.png`
- `item-search.png` copies `acceptance/item-search-populated-dark-1460.png`

Characters, item names, ratings, and other values in these captures are fictional test data. The mage is the app's labeled generated concept illustration, not a captured player model. These images don't establish live-provider behavior, a current season ceiling, or a dynamic 3D character builder

Keep these documentation assets outside the app's shipping `public/assets` directory so release packages don't include marketing-only imagery

The support button is an unaltered copy of the [official blue PNG](https://cdn.buymeacoffee.com/buttons/v2/default-blue.png), downloaded on 2026-11-04. The README uses the local image so rendering doesn't depend on the dynamic button API or an external image proxy
