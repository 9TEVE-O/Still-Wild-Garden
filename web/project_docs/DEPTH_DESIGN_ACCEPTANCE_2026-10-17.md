# Stillwild — perceptual depth and interaction review

Date: 17 October 2026 (Australia/Darwin)
Scope: `web/` on PR #19, branch `feat/perceptual-depth-garden-20261017`.
Evidence class: repository source, GitHub review comments and revision-specific CI. **No browser screenshot, Android physical-device session or controlled render comparison was executed.**

## Preserved visual identity

- **Protected:** existing original pixel island, plant atlas, keepers, stream, terrain, muted green environment, low-key motion, fixed world landmarks, seed/birth time and offline gifts/Android compatibility.
- **Adaptable:** HTML overlay typography, foreground controls, accessible names, colour/spacing tokens, responsive layout and view-only camera.
- **Experimental pending device review:** the large ghosted `STILL / WILD` title, its radial masking, 1–2.8× camera range and the optional four-direction pan pad. These should be compared against a real baseline screenshot, not accepted solely from source.
- **Rejected:** overwriting the canvas art, fake realtime weather or universal dusk claims, decorative high-saturation accents, additional particles without performance evidence.

The existing `lib/render-world.ts` produces the island and sparse seed-stable motes; its scene and persistent growth model were **not modified** for the depth work. The primary interface remains `app/page.tsx`.

## Layer map (source-level, not screenshot-verified)

| Composited surface | Intended position | Source evidence / caveat |
|---|---|---|
| `.garden-viewport` / `.garden-view` | Canvas subject, camera transform | `garden-viewport.tsx`, `globals.css`; camera is local React state, not persisted |
| `.garden-backtype` | Ghosted lettering, optically behind the island | z-index 1, `pointer-events:none` and centre mask; technically a **masked overlay**, not a true background behind the opaque canvas. Check masking at zoom extremes and while panned |
| `.chapter` / `.weather` | Foreground editorial text | z-index 3, pointer-events none; revised weather copy is time-neutral |
| `.keepers-peek` | Foreground subject action | z-index 4; separate from camera hit surface |
| `.garden-view-controls` | Zoom/reset and optional pan pad | z-index 5; controls are semantic buttons, each 44 CSS px nominal |
| `.sky-grain` | Decorative surface grain | z-index 8, pointer-events none |
| `.bottom-area` / `.topbar` | Main actions/navigation | z-index 9 / 10 |
| `.bubble-overlay` | Independently draggable mini-garden | z-index 40, distinct from viewport; interaction still needs device review |

The radial cut-out does not automatically follow the garden subject when a user pans. This is a specific visual-review risk, **not** evidence of actual obstruction on a rendered screen.

## Colour and typography contract

- Action signal: `#f1c87c` amber. It is used for primary action surfaces, zoom/pan controls, focus and hover affordances; it is **not** part of particle/terrain artwork.
- Primary action foreground: `#17251b`. Token-only opaque contrast for `#f1c87c` / `#17251b`: approximately **10.09:1**. The non-opaque view-control background and actual canvas backdrop must be tested separately.
- Subordinate interface stays neutral green and off-white. Disabled controls can be muted, but enabled/disabled state must remain visually clear.
- One expressive main heading, ghost text as decoration (`aria-hidden`), small supporting copy. Preserve the real h1 and DOM reading order.
- Responsive font sizing uses `clamp()` and narrow-screen max width to avoid clipping. Verify at 320, 360, 390, 768, 1024 and 1440 CSS px, 200% text resize and landscape.

## Camera and interaction contract

- Geometry lives in `lib/garden-camera.ts`; both camera position and scale are view-only React state.
- Zoom clamps to 1–2.8×. At exactly 1×, x/y return to the **exact origin**.
- Translation is bounded by the current *untransformed* viewport size; a ResizeObserver re-clamps after rotation/split-screen resize.
- Pointer capture is tracked per pointer ID. Blur and document-hidden events clear stale gestures. Third fingers are ignored until an active pair ends; losing one finger resets the pinch anchor but retains the remaining pointer for drag.
- Dedicated view region has `touch-action:none`; navigation outside that region retains ordinary browser behaviour. Native browser magnification over the garden region itself is affected and needs an accessibility review.
- Named zoom controls and arrow keys provide alternatives to pinch. At greater than 1×, an optional directional control pad enables one-pointer, non-dragging navigation.
- Bubble mode remains a separate overlay; no changes were made to its saved position or pointer handlers.

## Source-backed defects and remediation

| Priority | Finding | Evidence | Intervention |
|---|---|---|---|
| P2 | Camera offsets stale after viewport resize | Original `commit` clamped only on interaction; PR review independently flags this | ResizeObserver applies `clampCamera(current)` on size change |
| P2 | Pointer map stale after window loses focus | Original handler handled per-pointer ending but not focus loss; PR feedback | Blur/hidden cleanup for active pointer map and pinch |
| P2 | Directional panning required drag or keyboard | Original had arrow keys only; no single-pointer stationary control | Optional pan pad shown when zoomed, with labelled buttons |
| P3 | Additional fingers could leave pinch state inconsistent | Original tracked arbitrary count but implemented exactly two | Cap tracked active pointers at two; manual touch testing remains |
| P3 | Hardcoded night-time copy when day/weather is unknown | `page.tsx` always stated “A little after dusk” | Replaced with time-neutral ambient text |
| P3 | Compact-screen toolbar and close controls had small targets | CSS classes `.icon-button` and `.bubble-dismiss` previously 36/22 px | Increase affected targets to 44 px and condense bubble toggle label on narrow viewports with accessible name |

## Verification boundary

The new `scripts/verify-camera.cjs` executes the actual TypeScript camera geometry through a VM-transpiled CommonJS wrapper. Cases cover fixed origin, bounds, finite input, resize clamping, panning and stationary zoom anchor. The `web` GitHub Actions job runs this checker alongside TypeScript, persistence, growth and build checks.

**This is not a pointer-device simulator.** Geometry tests alone do not prove physical Android pinch/drag recovery, exact coordinate behavior under dynamic browser viewport changes, TalkBack functionality, visual balance, screenshot equivalence or target contrast on a moving background.

Guidance targets (not certified results): WCAG 2.2 AA 1.4.3, 1.4.10, 1.4.11, 2.1.1, 2.4.7, 2.5.1, 2.5.7 and 2.5.8, where applicable. The AA target minimum is 24 CSS px with documented exceptions; this design aims for approximately 44 CSS px on its major controls.

### Remaining visual/device evidence (NOT RUN)

| Test | Observable acceptance |
|---|---|
| Before/after 320/360/390px portrait | No clipped controls/heading, garden remains central and recognisable |
| 768/1024/1440px, portrait/landscape | No overlap in controls/ghost type and the island stays visually dominant |
| Android Chrome two-finger pinch and pan | No jumping, missing pointer or accidental garden mutation |
| Rotate while zoomed, multi-window resize | Camera remains within bounds and can reset |
| Add/remove third finger, window blur and return | No stale pointer state, one-finger continuation is stable |
| Bubble dragging and expanded modules | Camera and bubble interactions do not steal each other's gestures |
| TalkBack, keyboard tab/focus, screen enlargement | Controls discoverable, meaningful announcements and recovery |
| Reduced motion / slow device | Stable island and controllable rendering cost |
| Screenshot comparison with baseline | Depth enhancement without clutter or masked-text obstruction |

## Current recommendation

**REQUIRES REVISION / DEVICE EVIDENCE before owner publication review.** Source-level remediation is in place on PR #19; no Site publication, branch merge, environment change, garden data mutation or authoritative-world change was performed. Record the latest GitHub CI head/result in `VALIDATION.md` after execution. No performance or browser screenshots may be asserted from repository source alone.
