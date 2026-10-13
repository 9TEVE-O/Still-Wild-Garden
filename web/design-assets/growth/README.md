# Growth sprites

Source for the five-stage growth layer. The visual rules are in [ART_DIRECTION_AND_GROWTH_MODEL.md](../../../docs/ART_DIRECTION_AND_GROWTH_MODEL.md).

| File | Role |
|---|---|
| `plants.py` | Palette ramps and the mound, sprout, sapling and shrub/flowering sprite builders |
| `sapling_from_art.py` | Reduces `../sapling-original.png` to the island's pixel grid |
| `ground.py` | Ground mask and the 78 planting spots on `../island-original.png` |
| `build_atlas.py` | Writes the atlas and its TypeScript index |

To regenerate (needs Python 3.11+ with numpy, Pillow and scipy):

```sh
python3 web/design-assets/growth/build_atlas.py
node web/scripts/verify-growth.cjs        # run from web/
```

`build_atlas.py` writes `web/public/art/growth/stillwild-growth-atlas.png` and `web/lib/growth-atlas.ts`. The output is deterministic. The verifier fails if the atlas and its index drift apart.
