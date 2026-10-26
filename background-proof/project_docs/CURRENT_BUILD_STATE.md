# Current background-garden state

Live-state specimen: 14 October 2026. GitHub source reconciliation: 26 October 2026.
Authority: approved canonical App Brief v0.2.
Active stage: scheduler recovery throughput verified; fail-closed view-closure source merged into `main` and source CI verified, but current managed-Site deployment and native D1 gate semantics are not verified. The separate second 24-hour absence window is not started or authorised.
Scope: one owner-private Darwin test garden. The original public garden is unchanged.

## Deployed runtime

As last directly recorded on 14 October, private Site version 5 was deployed at https://stillwild-background-proof.subzteveo.chatgpt.site from Site source commit `1579149cd9b13ee5f7513ef508d39c6c361fce2a`. That recorded version was owner-only and used the existing D1 binding. The additive `0002_view_closure_gate` migration is present in D1.

The runtime now requires scheduler provenance for scheduled writes, recovers up to 24 hourly intervals per run, and exposes read-only scheduler, applied-tick and view-gate evidence. The page records open, close and snapshot-read events; heartbeats update a session's last-seen time without an event. `GET /api/evidence` stays read-only.

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

## Fail-closed view gate (GitHub source only, not deployed)

A local review of the version 5 gate reproduced two ways it can report full closure while a view stayed open: a session silent for more than 90 seconds no longer blocks the checkpoint and its later heartbeats are not counted, and a view opened between the separate closure check and the checkpoint insert is missed while the gate records zero active sessions. The 03:32 UTC unclosed session above would not block the version 5 gate.

The source after this change blocks `absence-check-002` while any view session lacks a recorded close, however old its last heartbeat, and commits the check, checkpoint and gate in one D1 batch. `GET /api/snapshot` no longer writes, and it serves garden data only to a view session that D1 shows open; a missing, unknown or closed session gets no data. The page records every open, read, heartbeat and close through `POST /api/view/session`, including heartbeats and reads from an already-closed tab. In-window heartbeats, closes and overlapping sessions count against closure. `GET /api/evidence` lists unclosed sessions and reports `absence-check-001` separately from the new checkpoint. Local deterministic checks cover each case; this source is not deployed.

## 14 October verification record

Local deterministic SQLite checks pass, including a 30-hour backlog recovered as 24 + 6, immutable original checkpoints, active-view blocking, a read-only first return and invalidation when a view opens during the window. Scheduler-provenance checks pass. `pnpm exec tsc --noEmit`, the production build and targeted lint on modified TypeScript files pass.

The GitHub repair was merged as commit `b85e3f8fab3ad6c00cb018d220eb385de916b5f3`. It moves the receipt workflow to :50 UTC and removes the unused scheduled workflow that reported success without dispatching. The first post-merge scheduled receipt still needs its live confirmation.

## 19 October 2026 engineering verification — historical review candidate, NOT DEPLOYED

Historical status below is retained as evidence of the 19 October review. PR #21 subsequently merged on 20 October; see the 26 October reconciliation before acting on its earlier draft/rollback instructions.

This section records a **review-branch candidate**, not a change to the Site version 5 runtime or the completed 14 October native-D1 specimen. The existing deployment and original checkpoints remain unchanged.

- **Source baseline:** `main` at `849f5477135e19955ccc22fd6d93cefeeee9064d`.
- **Review:** [draft PR #21](https://github.com/9TEVE-O/Still-Wild-Garden/pull/21), branch `fix/view-closure-event-order-20261019`. Its current head and CI should be checked again before merging or using it as a managed Site deployment source.
- **New boundary:** Source protocol `stillwild-view-v2` uses an immutable `view_events` checkpoint marker, committed in the same D1 batch as the checkpoint and its owner attestation. The 24-hour event query includes only events inserted after that marker and before the deadline, even if the request timestamp is tied to or predates the checkpoint. A missing marker prevents source-level confirmation. The `0002_view_closure_gate` schema remains unchanged.
- **Failure reproduced:** Tests that had previously incremented the deterministic clock by 1 ms before starting the checkpoint now hold the clock constant. The older timestamp-only query could misclassify a pre-checkpoint close; a delayed event committed after the checkpoint could carry a pre-checkpoint request timestamp. The updated SQLite test exercises both boundaries. This corrects a source-level proof-classification risk, not an observed hosted absence outcome.
- **Hosted CI:** [push run 39199836204](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/39199836204) passed all three jobs against candidate source `bc02086e313b7c2774cc85e067cb549df3d5de4a`: Python, `web/` and `background-proof/`. This includes the background-proof TypeScript check, deterministic SQLite regression runner, provenance runner and production build. Earlier candidate CI failures were diagnosed and corrected before the passing run. Any later documentation-only commit requires a fresh CI readback.
- **Independent GitHub evidence:** The six historical scheduled run IDs listed above were reread through GitHub and each returned `event=schedule`, `head_branch=main`, `run_attempt=1` and `conclusion=success`. Their D1 run/tick/event matches are supported by the 14 October canonical record; D1 was **not** independently reread in this execution. GitHub's more recent scheduled receipt [39186792262](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/39186792262) also succeeded on 19 October. Its workflow only emits a receipt: that success does not prove a Site writer dispatch, timely hourly execution, or new D1 progress.
- **Unproven:** Managed Site deployment compatibility, native D1 behaviour of the marker/row-order query, owner-private access controls, absence attestation, uninterrupted closure, and independent 24-hour execution corroboration. Physical Android and separate-user gates remain deferred.

**Rollback and authority:** Reject or revert PR #21 to discard this review candidate. If a managed Site deployment is later approved, preserve its exact version/source and confirm rollback behaviour and database compatibility before publishing; do not erase the original checkpoint, seed, events or migrations. Do **not** deploy, start `absence-check-002`, change scheduling, close hosted sessions or claim full 24-hour acceptance on this evidence alone.

## 26 October 2026 repository reconciliation — SOURCE VERIFIED, HOSTED GATE UNVERIFIED

This section supersedes the **current PR status** stated in the historical 19 October candidate review, without changing the 14 October live D1 specimen or asserting a later hosted deployment.

- **Merged source:** [PR #21](https://github.com/9TEVE-O/Still-Wild-Garden/pull/21) merged on 20 October 2026 as `c4c5541950caef85e37c37f8e59a90edde81f671`. It includes the marker/row-order query and the repeated-close regression at head `87c2e6263ff014c86fabf8d6877afece96df7a62`. [PR #23](https://github.com/9TEVE-O/Still-Wild-Garden/pull/23) merged the separate scheduler duplicate-delivery correction on 22 October. The inspected `main` head is `5b97a020df430b3186622c98edb35c22d59f7d9d`.
- **Source-level verification:** [GitHub Actions push run 39873072714](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/39873072714) passed at that exact `main` SHA. All three jobs succeeded. The `background-proof/` job ran `pnpm exec tsc --noEmit`, `node scripts/verify-background.cjs`, `node scripts/verify-provenance.cjs`, and `pnpm build`. The SQLite fixture tests cover stale unclosed sessions, checkpoint insertion races, marker order with tied milliseconds and delayed events, repeated close after checkpoint, rejected closed-session reads, and unchanged original proof baselines. These are isolated-adapter results, **not** native D1 acceptance.
- **Current receipt scope:** [GitHub Actions receipt run 40255781156](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/40255781156) completed successfully on 26 October with event `schedule` at the inspected `main` SHA. That receipt alone does not prove an authenticated Site dispatch, saved D1 ticks, or a 24-hour absence result.
- **Hosted verification missing:** This review did **not** use managed Sites tools, make an authenticated Site read, run a native Cloudflare D1 view-marker transaction test, or verify the current published Site version/source and privacy boundary. The latest directly supported deployment identity remains the 14 October Site version 5 record; it must be freshly read before any publish decision.
- **Preserved:** No managed Site, live D1 data, garden seed/birth time, checkpoint, view session, service credential, scheduler setting, or review automation was changed by this GitHub-only review. `absence-check-001` remains INCONCLUSIVE; `absence-check-002` has neither been started nor authorised.

**Gate verdict:** Source implementation and repository CI: **PASS** at the SHA above. Native provider semantics, exact deployed source, owner-private access and controlled deployment: **NOT ESTABLISHED**. Authority to start another 24-hour window: **NOT GRANTED**.

## Next gate

1. Read the exact current private managed Site version/source and owner-private access through the authorised Sites workflow. Read current `GET /api/evidence` using that Site's private service credential without navigating to the garden view or writing data. Preserve the returned proof/baseline/session facts as a new dated native record; do not assume the 14 October snapshot is still current.
2. Verify `stillwild-view-v2` checkpoint-marker and row-order behaviour against native Cloudflare D1 **in an isolated fixture**. Check atomicity, same-millisecond events, delayed request timestamps and repeated closes. Do not run destructive tests or create a checkpoint in either existing Site database.
3. Only after provider compatibility and rollback are evidenced, seek a separate owner decision on publishing the exact reviewed source to the existing private Site. A GitHub merge or green CI run cannot deploy it. Verify Site version/source, privacy and preserved D1 records after any separately authorised publication.
4. **Do not authorise or start `absence-check-002` here.** Once deployment is independently verified, confirm all garden tabs are closed, review `proof.unclosedViewSessions`, and close stale session records only after independently confirming their tabs are gone and receiving the appropriate owner authority. A future owner-authorised checkpoint must use the fail-closed attestation gate exactly once. The later 24-hour assessment still requires zero in-window view activity and independent scheduler, Worker, run, tick and event corroboration.

<!-- 14 October operational runbook retained below for traceability; follow the latest gate above instead. -->

## Historical 14 October next-gate runbook (superseded)

Create `absence-check-002` only through the fail-closed gate: deploy that source as a new owner-authorised Site version before attesting. Then close every Stillwild garden tab; in `GET /api/evidence`, close each session still listed under `proof.unclosedViewSessions` through `POST /api/view/session` only after confirming its tab is gone, until the count is 0. The owner then attests closure and starts `absence-check-002` once; do not restart it. Leave the garden page closed and make the first due return through `GET /api/evidence`. A 24-hour PASS still requires zero in-window view events plus independent hourly receipt, run, tick and event corroboration.
