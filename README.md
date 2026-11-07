# Still Wild Garden

A quiet pixel garden that develops at its own pace. No tasks, score, streaks or punishment for leaving.

[Open the published garden](https://stillwild-garden.subzteveo.chatgpt.site/)

The repository now holds three distinct runtimes:

| Location | Purpose | Current boundary |
|---|---|---|
| [web/](web/README.md) | Public pixel garden, gifts and Android companion candidate | Site version 2; one shared origin; version 1 age-based growth. Source adds an unpublished five-stage growth layer |
| [background-proof/](background-proof/README.md) | Isolated Darwin garden with saved weather inputs and keeper consequences | Private test Site version 4 per its current-state record; original 24-hour absence review INCONCLUSIVE; no new window started |
| [src/stillwild/](docs/EXPERIMENTAL_BACKEND_README.md) | Experimental Python agent service, isolated real-garden registry/weather ingestion, and opt-in Wild simulation | Separate SQLite runtime; model-derived Open-Meteo values; no connection to either pixel app |

The public app and the original seed and birth time are preserved. GitHub updates do not deploy either managed Site.

## Current background milestone

The [approved v0.2 brief](web/project_docs/Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md) governs this bounded milestone: scheduled jobs must save outcomes before a viewer returns. The first garden uses completed UTC-hour weather intervals, finite-state keeper actions and read-only snapshots with refresh. SSE remains deferred; the prompt catalog remains parked; future LLM use is undecided.

The private background-test source was recovered from Site version 3, commit `89babb648b5519f6f8545d265171b351d9c47154`, and imported under `background-proof/`. Its D1 database is separate from the public origin. [Its current-state record](background-proof/project_docs/CURRENT_BUILD_STATE.md) owns the proof's status, including the later version 4 scheduler-provenance deployment.

On 5 October 2026, native database reads showed **22 unique committed hourly ticks, revision 22 and 31 saved consequence events** at that cutoff. All 22 tick run IDs matched successful Worker log entries. Recorded planting, habitat and water changes reconcile with the saved world. This establishes background progress within the observed window.

**The original 4–5 October 2026 absence review was executed and remains INCONCLUSIVE.** Saved progress is evidenced within that window; complete view closure and historical scheduler identity were not established. A later bootstrap-rerun specimen linked one independently recorded execution to one saved keeper consequence. It does not establish hourly scheduling or a full absence PASS. Records through 5 October show the original garden and its checkpoint (`absence-check-001`, started 4 October 2026, 16:57:51 ACST) preserved. Never restart or overwrite that checkpoint; a new 24-hour window needs a distinct immutable checkpoint and the owner's authorisation.

Separate personal ownership is a later release gate. The Android candidate still needs physical-device acceptance.

## Run locally

For either web app, use Node.js 24 and the pinned `pnpm@11.25.0`. Each directory has its own lockfile, schema and local D1 database. Follow [web instructions](web/README.md) or [background-proof instructions](background-proof/README.md).

The separate Python service runs from the repository root:

```sh
docker compose up --build
```

Open `http://localhost:8000/docs`. The optional [Wild simulation](docs/EXPERIMENTAL_BACKEND_README.md#the-wild-a-garden-that-grows-on-its-own) uses its own Docker project and simulated inputs. Physical actions are off by default.

## Checks and next work

Current local checks: **124 Python tests and Ruff pass** (re-run 13 October 2026), legacy-web TypeScript and persistence checks pass, and background-proof TypeScript, transactional SQLite checks and production build pass. [CI](.github/workflows/test.yml) checks Python and both web apps. The [corrected hosted CI run](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/37272473974) passes Python and both web-app jobs.

The [Project Auditor report](docs/audits/2026-10-05/REPORT.md) records the reviewed revisions, findings, remediation and remaining gates. [Native evidence](docs/audits/2026-10-05/background-native-evidence.json) and [correlation](docs/audits/2026-10-05/background-correlation.json) preserve the observed progress without claiming full absence.

The opt-in Python Wild also has a protected background foundation. Cron and worker use the
same UTC slot transaction, catch up in bounded batches and save run receipts with outcomes.
Scheduler and operator keys have separate scopes; unconfigured HTTP writes are disabled.
The Docker API binds to localhost. [Background foundation instructions](docs/BACKGROUND_FOUNDATION.md)
cover credentials, manual simulation controls, agent duties and a short isolated process check.
The Wild uses simulated conditions and remains separate from both pixel gardens. Its audit and
local evidence are retained at [the 4 October audit](docs/audits/2026-10-04/AUDIT.md).

The imported web app's historical checks cover TypeScript, production build, persistence,
GIF/renderer, Android-scene and local Worker/D1 behavior. [The sync record](web/project_docs/GITHUB_SYNC.md)
and [import evidence](web/project_docs/repository-verification.json) bind those checks to the import.
None of these local checks establishes the required hosted 24-hour absence proof.

The next recorded gate is view-closure control, implemented and verified before any second 24-hour window is authorised (see the proof's current-state record). Preserve both managed Sites and their current data; GitHub changes do not deploy either Site.
