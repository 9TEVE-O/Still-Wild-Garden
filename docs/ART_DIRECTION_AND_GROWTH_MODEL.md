# Art direction and growth model

Status: **CANDIDATE**, 13 October 2026. Written to implement the owner's 6 October graphics-pass decision and his 13 October request to start building growth into the live demo. Not yet approved as the visual authority, and the blind ordering test has not been run.

## Decision this implements

Keep the existing island bitmap. Add a real growth system on top of it, and prove that growth reads at phone size. Growth comes from sprites and world state; weather and time of day come later, mostly from palette and state treatment.

Out of scope for this pass: redrawing the island, a seasonal or cultural calendar, more than one species, elaborate keeper animation and a wholesale renderer rewrite.

## Pixel grid and palette

- **Grid:** the island original (`web/design-assets/island-original.png`, 1536 x 1024) has an effective pixel of about 3.2 px. Sprites use one logical pixel = 3 px of that original, and the renderer scales them with the island so they keep its density at any size.
- **Palette:** every sprite colour comes from the island's own ramps, extracted by clustering its opaque pixels (soil from the sprout mound). No external palette is used.

| Ramp | Colours, dark to light |
|---|---|
| Soil | `#20130c` `#3d2815` `#583a1a` `#764e1c` `#97651c` `#b77d18` |
| Foliage | `#072b17` `#0b3d24` `#17562a` `#2e7a42` `#4f9c60` `#8ec187` `#abedd4` |
| Fresh growth | `#1b4218` `#335b20` `#487126` `#62872a` `#8a9f34` `#b9c95a` |
| Gold | `#6c5b1b` `#9d7919` `#b77d18` `#dcb92e` `#eae189` `#f3f7d8` |
| Petal | `#c9b878` `#e6dca0` `#f3f7d8` |

Light comes from the upper left: highlights sit on upper-left edges and dark outlines on lower-right silhouettes.

## The species and its five stages

One species, derived from the existing art: the island's golden first sprout and the original sapling sprite.

| Stage | Plant age | Look |
|---|---|---|
| Mound | under 2 days | Dark soil mound with a gold seed glint |
| Sprout | 2 to 9 days | Two fresh yellow-green leaves, echoing the golden first sprout |
| Sapling | 9 to 30 days | The original sapling art reduced to the island grid, gold buds included |
| Shrub | 30 to 120 days | Rounded teal-green bush with a few gold buds; fills out for a year |
| Flowering | from 120 days | The same bush with cream-and-gold blossoms like the island's ground flowers |

Ages are creative world units, not a horticultural model.

## Growth model

- **Counts:** these are unchanged from version 1: `plants = 1 + floor(1.5 * sqrt(hours))` from the saved birth time. Additional plant k appears at hour `(k / 1.5)^2`, which gives each plant its own age.
- **First plant:** the baked golden sprout. It is never drawn over, and the garden grows outward around it.
- **Placement:** 78 fixed spots on open grass, found by a ground mask over the island (not rock, water, soil, baked flowers or the sprout's clear ring) with foreshortened Poisson-disk spacing. The planting order runs outward from the first sprout and is loosened by each garden's seed, so gardens differ.
- **Size:** plants nearer the front are slightly larger, and shrubs keep filling out for a year after reaching the shrub stage.
- **Capacity:** the island holds at most 78 additional plants. Under the version 1 count, the last spot is sown around day 113 and everything is flowering by about day 233.

## Where it applies

| Surface | Drawing |
|---|---|
| Live view and floating bubble | Five-stage growth (`web/lib/render-world.ts`) |
| PNG wallpaper and GIF export | Five-stage growth |
| Offline HTML gifts | Version 1 sapling drawing; the seed file contract is unchanged |
| Android companion | Version 1 sapling drawing; its bundled sources and hashes are unchanged |

## Validation still owed

The 6 October baseline requires an uninformed viewer to order day 7, 40 and 400 renders correctly without labels. `node web/scripts/verify-growth.cjs` renders those three ages at phone size with the live renderer; the test itself has not been run. If three sprite iterations fail it, stop polishing sprites and split the island artwork into independently controllable layers.

## Regenerating

See `web/design-assets/growth/README.md`.
