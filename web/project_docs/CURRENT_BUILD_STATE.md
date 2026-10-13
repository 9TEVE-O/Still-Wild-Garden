STATE_SCHEMA_VERSION: 1
LAST_COMPLETED_STAGE: Original 24-hour absence review executed (INCONCLUSIVE); scheduler provenance specimen recorded (narrow PASS)
CURRENT_ACTIVE_STAGE: No absence window running; original checkpoint preserved
NEXT_PERMITTED_STAGE: View-closure control before any second 24-hour window, per background-proof/project_docs/CURRENT_BUILD_STATE.md; preserve both gardens

Updated: 13 October 2026, Australia/Darwin.

## Legacy application

web/ remains the saved Site version 2 source from `bcf2d5210282e3683502be5066d745f920ffb191`. Its immutable public origin, version 1 growth rules, renderer, gifts and Android companion are unchanged. Current local TypeScript and persistence checks pass. Source sync is not a Site deployment.

Since pull request #6 (6 October 2026), web/ also contains a separate, unconfigured Dew persistent-hour proof path: app/api/internal/evolution/tick, app/api/garden/snapshot, db/evolution.ts, lib/evolution/ and drizzle/0001_dew_persistent_hour.sql, driven by .github/workflows/stillwild-hourly-proof.yml. It is not part of Site version 2 and is not evidence for the background milestone. A 13 October repository review reproduced a defect in it: when two overlapping ticks read the same prior state, the losing run still saves an applied tick, a committed run record and a watering event. Its migration is also missing from the Drizzle journal. Retire or fix is an open owner decision.

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
