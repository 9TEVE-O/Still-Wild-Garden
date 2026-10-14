# Current background-garden state

Updated: 14 October 2026, Australia/Darwin.
Authority: approved canonical App Brief v0.2.
Active stage: scheduler recovery throughput verified; the separate 24-hour view-closure test is prepared but not started.
Scope: one owner-private Darwin test garden. The original public garden is unchanged.

## Deployed runtime

Private Site version 5 is deployed at https://stillwild-background-proof.subzteveo.chatgpt.site from Site source commit `1579149cd9b13ee5f7513ef508d39c6c361fce2a`. It remains owner-only and uses the existing D1 binding. The additive `0002_view_closure_gate` migration is present in D1.

The runtime now requires scheduler provenance for scheduled writes, recovers up to 24 hourly intervals per run, and exposes read-only scheduler, applied-tick and view-gate evidence. The page records open, heartbeat, close and snapshot-read events. `GET /api/evidence` stays read-only.

## Live recovery specimen, 14 October 2026

The garden moved from revision 96 / tick 497623 to revision 236 / tick 497763, clearing the 140-interval backlog at the 03:42 UTC readback. Six independently verified successful scheduled GitHub attempts dispatched bounded recovery runs. The matching run, tick and event records are:

| GitHub attempt | Garden run | Ticks | Revisions | Events |
| --- | --- | ---: | --- | ---: |
| 37436243437, attempt 1 | ab9de251-9de4-48c3-838d-08d28b93b451 | 497624–497647 | 97–120 | 32 |
| 37489238969, attempt 1 | 782df738-79a8-448f-b4ed-3fd287379ead | 497648–497671 | 121–144 | 32 |
| 37528740768, attempt 1 | 3ad4cdb4-e692-48a6-9f22-7f0a4d5b6d3c | 497672–497695 | 145–168 | 32 |
| 37551328850, attempt 1 | a42701ce-885f-4d79-8f50-2a9c03cce87d | 497696–497719 | 169–192 | 33 |
| 37583478592, attempt 1 | ade4d074-f906-46f7-af8d-71c614df07dc | 497720–497743 | 193–216 | 36 |
| 37634314552, attempt 1 | 1317caae-1cc6-440c-810b-f5dfd3d8b151 | 497744–497763 | 217–236 | 28 |

All six attempt records were successful, on `main`, from `.github/workflows/stillwild-scheduler-receipt.yml`, with event `schedule`. Each execution ID matches one saved run; all 140 tick IDs and revisions are consecutive with no gaps; event run IDs and revisions match those ticks. Weather status was `relayed-modelled`. The final run applied the remaining 20 intervals, and `world.last_tick` matched the current hourly slot at readback.

The recovery automation processes up to four receipts per execution. Two executions completed the six-receipt recovery, with no backlog at the final readback.

## Baseline and view preservation

The original `absence-001` and `absence-check-001` rows remain unchanged. `absence-check-001` retains `started_at=1791098871364`, revision 0. The new `absence-check-002` row and its view gate have not been created.

The deployed gate requires an explicit owner attestation and zero active sessions when the new immutable checkpoint is written. D1 still has one unclosed view-session record last seen at 03:32 UTC; one other session is closed. Close every Stillwild garden tab before attesting. No `absence-check-002` row or 24-hour window has been created.

The review automation is configured to use only `GET /api/evidence` after the checkpoint is due. It remains disabled until the owner attests closure and the new checkpoint is started. The first post-deadline return must be read-only; do not open the garden view during the window.

## Verification

Local deterministic SQLite checks pass, including a 30-hour backlog recovered as 24 + 6, immutable original checkpoints, active-view blocking, a read-only first return and invalidation when a view opens during the window. Scheduler-provenance checks pass. `pnpm exec tsc --noEmit`, the production build and targeted lint on modified TypeScript files pass.

The GitHub repair was merged as commit `b85e3f8fab3ad6c00cb018d220eb385de916b5f3`. It moves the receipt workflow to :50 UTC and removes the unused scheduled workflow that reported success without dispatching. The first post-merge scheduled receipt still needs its live confirmation.

## Next gate

After every Stillwild view is closed, the owner must attest closure. Then start `absence-check-002` once; do not restart it. Leave the garden page closed and make the first due return through `GET /api/evidence`. A 24-hour PASS still requires zero in-window view events plus independent hourly receipt, run, tick and event corroboration.
