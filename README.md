# Still Wild Garden

A quiet pixel garden that develops at its own pace. No tasks, score, streaks or punishment for leaving.

[Open the published garden](https://stillwild-garden.subzteveo.chatgpt.site/)

The repository now holds three distinct runtimes:

| Location | Purpose | Current boundary |
|---|---|---|
| [web/](web/README.md) | Public pixel garden, gifts and Android companion candidate | Site version 2; one shared origin; version 1 age-based growth |
| [background-proof/](background-proof/README.md) | Isolated Darwin garden with saved weather inputs and keeper consequences | Private test Site version 3; hourly updater enabled; 24-hour absence proof pending |
| [src/stillwild/](docs/EXPERIMENTAL_BACKEND_README.md) | Experimental Python agent service and opt-in Wild ecosystem simulation | Separate SQLite runtime; simulated Wild weather; no connection to either pixel app |

The public app and the original seed and birth time are preserved. GitHub updates do not deploy either managed Site.

## Current background milestone

The [approved v0.2 brief](web/project_docs/Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md) governs this bounded milestone: scheduled jobs must save outcomes before a viewer returns. The first garden uses completed UTC-hour weather intervals, finite-state keeper actions and read-only snapshots with refresh. SSE remains deferred; the prompt catalog remains parked; future LLM use is undecided.

The private background-test source was recovered from Site version 3, commit `89babb648b5519f6f8545d265171b351d9c47154`, and imported under `background-proof/`. Its D1 database is separate from the public origin.

On 5 October 2026, native database reads showed **22 unique committed hourly ticks, revision 22 and 31 saved consequence events**. All 22 tick run IDs matched successful Worker log entries. Recorded planting, habitat and water changes reconcile with the saved world. This establishes background progress within the observed window.

**The full 24-hour absence proof remains pending.** The immutable checkpoint starts at 4 October 2026, 16:57:51 ACST; its earliest review is 5 October 2026, 16:57:51 ACST. The existing review task is set for 17:12:51 ACST. View-closure confirmation and the first read-only return still need review. Do not open the test garden or restart its checkpoint during that window.

Separate personal ownership is a later release gate. The Android candidate still needs physical-device acceptance.

## Run locally

For either web app, use Node.js 24 and the pinned `pnpm@11.25.0`. Each directory has its own lockfile, schema and local D1 database. Follow [web instructions](web/README.md) or [background-proof instructions](background-proof/README.md).

The separate Python service runs from the repository root:

```sh
docker compose up --build
```

Open `http://localhost:8000/docs`. The optional [Wild simulation](docs/EXPERIMENTAL_BACKEND_README.md#the-wild-a-garden-that-grows-on-its-own) uses its own Docker project and simulated inputs. Physical actions are off by default.

## Checks and next work

Current local checks: **56 Python tests and Ruff pass**, legacy-web TypeScript and persistence checks pass, and background-proof TypeScript, transactional SQLite checks and production build pass. [CI](.github/workflows/test.yml) checks Python and both web apps. The [corrected hosted CI run](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/37272473974) passes Python and both web-app jobs.

The [Project Auditor report](docs/audits/2026-10-05/REPORT.md) records the reviewed revisions, findings, remediation and remaining gates. [Native evidence](docs/audits/2026-10-05/background-native-evidence.json) and [correlation](docs/audits/2026-10-05/background-correlation.json) preserve the observed progress without claiming full absence.

The next bounded action is the existing absence review, followed by any evidence-led correction it identifies. Preserve both managed Sites and their current data while this test runs.
