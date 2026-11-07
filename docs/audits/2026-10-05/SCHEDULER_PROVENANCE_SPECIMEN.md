# Stillwild scheduler provenance specimen

Date: 5 October 2026, Australia/Darwin.
Result: **PASS for the deployed provenance boundary and one saved mutation.**
Original 24-hour absence review: **INCONCLUSIVE**, preserved.
Authority: Steven Lees requested deployment and resumption with a fresh receipt.

## Deployed boundary

Owner-private proof Site version 4 deployed successfully at 2026-10-05T13:19:23.016956Z.
Source commit: `9f3a40b74d662d6578fa756c430facc62afa3cd0`.
Deployment: `appgdep_6ac3a3c6bd848191b71e31aaa0be6ef2`.
Saved version: `appgprj_6ac1f8bb574c8191ad592b7d1a8587d2~appgver_f58f743e80f48191a337f140414161bc`.

The additive migration is generated with its complete Drizzle journal and snapshot. It adds scheduler correlation fields and a unique execution index to background runs, plus direct run links on new consequence events. Historical runs retain unknown scheduler provenance and historical events retain their original content. The applied migration is now immutable.

TypeScript, transactional SQLite background checks, the local provenance verifier and the production build passed before publication. Native database and service readback confirmed the new fields after deployment.

## Independent execution and live chain

The initial receipt was outside the 20-minute freshness bound. The explicitly authorised specimen used a successful rerun of the original workflow-file push. GitHub issued attempt 2 and its own job log emitted the exact execution ID. This proves receipt correlation for a bootstrap rerun; it does not establish an hourly cron invocation.

| Field | Observed value |
|---|---|
| GitHub run | [37312848020, attempt 2](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/37312848020/attempts/2) |
| GitHub job | 111782748718, completed successfully |
| Workflow | .github/workflows/stillwild-scheduler-receipt.yml |
| Origin | push, rerun of the original initial workflow-file commit on main |
| Head SHA | fb97cf6b80e2881e200b5c63a81e55d51e4220b3 |
| taskId | github-actions:stillwild-scheduler-receipt-v0.1 |
| executionId | github-actions:run:37312848020:attempt:2 |
| triggeredAt | 1791206409000, from the immutable attempt record's created_at: 2026-10-05T13:20:09Z |
| Garden run | db565618-3d75-4c3e-baab-352a6ab4b85c |
| Run start/finish | 1791206559756 / 1791206560825 UTC milliseconds |
| Tick | 497557, one committed tick |
| Revision | 29 → 30 |
| Event | darwin-proof-001:2:497557:roots-watered |
| Keeper | Dew |
| Saved consequence | roots-watered; water -3 and root moisture +0.75 in event payload |
| World totals | water 35.1 → 32.1; soil moisture 99.25 → 99.75 after the complete tick |
| Weather | Open-Meteo HTTP 200, 120 hourly rows; server reports relayed-modelled |
| Weather fetch | 2026-10-05T13:22:31.798Z |
| Weather response SHA-256 | 23779226f2a9ef70ee66305df3c9715e71e8e192b1b26df06c2f921fca07ce70 |
| Event commit | 1791206560514 UTC milliseconds |
| End-to-end result | PASS |

Native D1 readback across both background-run pages found exactly one run with this execution ID. Its task ID and trigger time equal the GitHub attempt record. The applied tick joins to that run, the consequence carries the same run ID, and both share revision 30. The updated world points to the same tick. A native Worker start log also carries the same correlation ID; an independent Worker completion log was not present in the retrieved capture, so saved completion is established here by native D1 readback.

The API persists caller-supplied correlation metadata. Independent origin was checked separately through GitHub's attempt record and emitted job log; the API itself does not validate GitHub identity. The relay consumed that independently recorded receipt and invoked the garden updater.

## Preservation and resumption

Deployment left revision 29 and the whole world state unchanged. The specimen then advanced exactly one due tick. Native readback confirms the garden ID, seed and planting time are preserved. Both baseline records match the pre-deployment records exactly. The explicit absence checkpoint remains `absence-check-001`, started_at 1791098871364, revision 0.

The existing `Advance Stillwild garden` task (`Automation_b026bc1a50588191a24a3318127624c5`) is enabled again, retaining its hourly :35 Australia/Darwin schedule and Site link. The receipt check now resolves immutable per-attempt records; reruns use that attempt's created_at rather than the top-level run's original creation time. Only schedule/workflow_dispatch origins or the original bootstrap push run are eligible. Other push receipts are rejected. No new schedule or baseline was created.

The full absence result remains INCONCLUSIVE. This specimen does not recover missing historical scheduler receipts or full-window view-closure evidence. The next separate operational gate is the view-closure control before a new 24-hour test.
