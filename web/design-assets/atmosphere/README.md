# Five atmospheric studies — non-canonical

**Status:** Development branch only. Does not establish real weather, server-side evolution, or accepted five-stage growth readability.

- Open `studio.html` from a local static server serving the repository `web/` directory, for example `cd web && python3 -m http.server 8000`, then visit `/design-assets/atmosphere/studio.html`.
- Forest, Amber, Rose, Moon and Rain are **user-reference-inspired, procedural sky studies**, not environment inputs or age states.
- The page tries to overlay the **original unmodified** `web/public/art/island.png`; a missing source displays a clearly labelled sky-only fallback, not recreated terrain.
- No original reference composites, user-uploaded image files, plant replacement sprites, other island illustration or weather API calls are bundled in the studio.
- The tiny motes and rainfall are only decorative. They never evidence recorded keeper consequences or actual precipitation. Moon is stylised and not astronomical.
- `window.stillwildStudy.select('forest')` and `window.stillwildStudy.renderFixed(0)` permit reproducible screenshots in an isolated browser. Reduced-motion is honoured.
- Neither `drawWorld` nor gift, wallpaper, GIF, Android, garden database, experimental evolution, scheduler or live site paths are modified here.

**P0 human-review gate remains open.** First run `cd web && node scripts/verify-growth.cjs --require-canvas` against the checked-out source and installed dependencies. Only if actual day-7, day-40 and day-400 renderer images are present should you run `node scripts/prepare-blind-growth.cjs`. That script creates `reviewer/` images A/B/C plus a separate `sealed-operator-only/answer-key.json` under the ignored `.sites-runtime/` tree. The human reviewer sees only the reviewer folder and independently orders the images. Record their real response with fixture hashes and source commit before scoring. Synthetic PNGs can test packaging but **never** satisfy garden rendering or blind human acceptance.

Protected authorities: canonical background brief v0.2, frozen Observation Invariant, original seed/birth time, v1 portable exports, and separate 24-hour proof gates. The camera changes merged in PR #19 also retain their browser/Android acceptance obligations. A later production compositor needs new exact baseline pixel-parity evidence and the user-review gate: do not infer a pass from this gallery.