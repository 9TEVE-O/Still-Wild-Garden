STATE_SCHEMA_VERSION: 1
LAST_COMPLETED_STAGE: Original 24-hour absence review executed (INCONCLUSIVE); scheduler provenance specimen recorded (narrow PASS)
CURRENT_ACTIVE_STAGE: Five-stage growth layer built in web/ source (candidate, unpublished); no absence window running; original checkpoint preserved
NEXT_PERMITTED_STAGE: Growth layer: blind ordering test, then owner decision to publish through Sites. Background proof: view-closure control before any second 24-hour window, per background-proof/project_docs/CURRENT_BUILD_STATE.md. Preserve both gardens

Updated: 13 October 2026, Australia/Darwin.

## Legacy application

web/ began as the saved Site version 2 source from `bcf2d5210282e3683502be5066d745f920ffb191`. Its immutable public origin, version 1 growth rules, gifts and Android companion are unchanged. Current local TypeScript and persistence checks pass. Source sync is not a Site deployment.

Five-stage growth layer, 13 October 2026 (candidate, not published). The owner asked to start building growth into the live demo. The live view, floating bubble, wallpaper and GIF export now draw the unchanged version 1 plant counts as one species in five stages (mound, sprout, sapling, shrub, flowering) at 78 fixed ground spots, through lib/render-world.ts, lib/growth.ts and the generated atlas. lib/render-garden.ts, lib/garden.ts, the seed runtime and both art files are untouched, so offline gifts and the Android companion keep the version 1 drawing and its recorded hashes. Applied to the original garden (planted 26 September 2026), the view would show about 20 saplings and 10 sprouts or mounds on 13 October, first shrubs from 26 October and first flowers from 24 January 2027. Checks are in VALIDATION.md and growth-evidence.json. The blind ordering test of day 7, 40 and 400 renders has not been run, and the change is not on the public Site until it is published through Sites. Re-validated 3 November 2026: scripts/verify-growth.cjs --require-canvas passes and the day 7, 40 and 400 phone renders were regenerated for the owner's blind ordering review (see VALIDATION.md); version 1 renderer, art and Android provenance are unchanged. The layer is prepared and ready for review, but remains unpublished — the human blind ordering test and any Sites publish decision stay with the owner.

Since pull request #6 (6 October 2026), web/ also contains a separate, unconfigured Dew persistent-hour proof path: app/api/internal/evolution/tick, app/api/garden/snapshot, db/evolution.ts, lib/evolution/ and drizzle/0001_dew_persistent_hour.sql. It is not wired to any dispatching workflow — no scheduled job posts to the tick endpoint; the path is exercised only by scripts/verify-evolution.cjs in .github/workflows/web-evolution-proof.yml. It is not part of Site version 2 and is not evidence for the background milestone. A 13 October repository review reproduced a defect in it: when two overlapping ticks read the same prior state, the losing run still saved an applied tick, a committed run record and a watering event, and the 0001 migration was missing from the Drizzle journal. Both are now fixed (3 November 2026): runEvolutionTick applies the guarded state transition first and gates every consequence write on that transition, so a losing overlapping run persists nothing; scripts/verify-evolution.cjs now covers the overlapping-tick race, and db/schema.ts together with the Drizzle journal and snapshot now model the 0001 tables. This is a GitHub source change only; it is not a Site deployment and not evidence for the background milestone.

The public Site still has one shared garden. Earlier private-hosting descriptions are historical. Separate personal ownership is not established.

## Approved direction and separate implementation

D-01 requires saved scheduled outcomes before a return. D-02 records approval of the v0.2 brief through the owner's /approved / action on 4 October 2026. The brief governs the bounded background milestone; existing contracts govern the legacy garden and portable modes. SSE is deferred, the prompt catalog is parked and future LLM use is undecided.

background-proof/ now contains the recovered private Darwin test-app source from Site version 3, commit `89babb648b5519f6f8545d265171b351d9c47154`. Its separate D1 database, completed UTC inputs, finite-state keeper consequences, read-only snapshots and hourly job implement the bounded test design.

Native observations on 5 October show revision 22, 22 unique committed ticks and 31 saved events. Each tick's run ID matches successful Worker logs; recorded plant, habitat and water changes reconcile. This establishes observed background progress in that separate test app. It does not change the behaviour of this public legacy app.

The Python service, including the opt-in Wild simulation, is a third separate runtime. The Wild uses simulated weather and is not evidence for the real-weather pixel proof. Current local backend checks pass: 124 tests and Ruff (re-run 13 October 2026).

## Remaining gates

The experimental Python Wild remains separate from both pixel apps. Its protected
scheduler/worker foundation saves UTC slot markers and outcomes atomically, bounds restart
catch-up, and distinguishes successful runs from duplicates and failed attempts. Local tests
and a short process smoke are recorded in ../../docs/audits/2026-10-04/AUDIT.md. This does
not alter the web implementation, connect its pixel keepers, collect Darwin weather or
establish hosted 24-hour operation.

The original 4–5 October 2026 absence review was executed and remains INCONCLUSIVE. Saved progress is evidenced within that window; complete view closure and historical scheduler identity were not established. A later bootstrap-rerun specimen linked one independently recorded execution to one saved keeper consequence. It does not establish hourly scheduling or a full absence PASS. Records through 5 October show the original garden and its checkpoint (2026-10-04T07:27:51.364Z) preserved; never restart or overwrite it.

Separate-user ownership is a later release gate. The Android candidate retains its earlier build evidence; phone acceptance remains open. Version 1 gifts retain local age-based behaviour.

Read the root docs/audits/2026-10-05/ report and background-proof/project_docs/CURRENT_BUILD_STATE.md for current evidence. The next recorded gate is view-closure control before any second 24-hour window; a new window needs a distinct immutable checkpoint and the owner's authorisation.


## Presentation-only depth candidate — 17 October 2026 (branch, not published)

A separate GitHub branch `feat/perceptual-depth-garden-20261017` adds ghosted editorial background type, a larger foreground heading, one amber interactive signal, and a view-only camera with bounded touch pinch/pan, keyboard arrows and labelled zoom controls. Camera coordinates are component-local and are not saved to the garden. The canvas samples its untransformed layout size to avoid double-scaling its backing bitmap.

The persistent garden, renderer rules, source art, time computation, network requests, gift exports, Android companion and database are unchanged. This is a candidate for review and Android device acceptance, not a deployed Site revision or a change to the approved observation invariant. Verify pinch between two fingers, single-finger pan only when zoomed, zoom bounds, button hit targets, bubble drag, immersive controls, keyboard access, legibility and reduced motion before publication. GitHub CI validates source/build separately from physical-device behaviour.

## Perceptual-depth remediation checkpoint — 17 October 2026

The PR #19 existing feature branch now includes fixes to viewport-size camera clamping, focus-loss pointer cleanup, exact 1x camera origin, third-finger handling, gesture-free directional navigation, touch-target dimensions and hardcoded dusk wording. A targeted geometry verifier is included in GitHub Actions without introducing a new runtime dependency. Source remains unpublished.

GitHub Actions `test` run 38935569447 at implementation SHA `27631d69c93722a432b55d77caf17369b4f8ed40` passed TypeScript, camera, persistence, growth and web build checks. Subsequent documentation commits require their own revision-specific CI observation. Details and open evidence gates are in `VALIDATION.md` and `DEPTH_DESIGN_ACCEPTANCE_2026-10-17.md`.

Next permitted UI stage: reproduce phone pinch/pan, Bubble mode, accessibility and visual screenshots against the baseline; remediate observed defects within the feature branch. **Do not merge or publish without owner approval.** The canonical growth layer, original seed and separate background proof remain untouched.
