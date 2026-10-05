# Current background-garden state

Updated: 5 October 2026, Australia/Darwin.
Authority: approved canonical App Brief v0.2.
Active stage: provenance boundary deployed; one live mutation specimen passed; hourly receipt relay resumed.
Scope: owner-private Darwin proof garden. Original 24-hour absence result remains INCONCLUSIVE.

## Runtime

Managed Site version 4 is deployed successfully from source commit `9f3a40b74d662d6578fa756c430facc62afa3cd0`. GitHub stores the corresponding generated provenance migration and metadata. GitHub commits alone do not deploy the Site.

Implemented: saved version 2 world; finite-state keepers; UTC weather accounting; pinned inputs; atomic tick/event/state commits; bounded recovery; labelled fallback; read-only snapshots and evidence; validated scheduler correlation fields; unique execution IDs; direct run ID on new consequence events. Historical scheduler identity remains unknown. SSE stays deferred.

## Executed specimen

Fresh independently recorded GitHub run 37312848020, attempt 2, emitted execution ID `github-actions:run:37312848020:attempt:2`.
Native database readback confirms exactly one matching garden run `db565618-3d75-4c3e-baab-352a6ab4b85c`, one committed tick 497557, revision 30 and Dew's roots-watered event. Weather collection returned HTTP 200 and the garden reports relayed-modelled.
This is a bootstrap workflow rerun specimen, not an observed hourly cron execution. Its PASS is limited to independent receipt correlation and one persistent consequence.

TypeScript, transactional SQLite background verification, local provenance verification and production build passed. [Full specimen and limitations](../../docs/audits/2026-10-05/SCHEDULER_PROVENANCE_SPECIMEN.md).

## Preservation and operations

Garden identity and planting time are preserved. Deployment left revision 29 unchanged; the specimen advanced revision 29 to 30. Both immutable baseline rows match the pre-deployment records. The absence-check-001 checkpoint remains started_at 1791098871364 and revision 0.

The existing hourly Advance Stillwild garden task is enabled, retaining :35 Australia/Darwin timing. It verifies fresh successful independent GitHub attempt records, rejects consumed or ineligible receipts, and fails closed when provenance is unavailable. The expired original receipt was not consumed.

The original 4–5 October absence review remains INCONCLUSIVE. Full-window view closure and historic execution receipts are still unestablished. No new absence checkpoint was started.

Next separate gate: implement view-closure control before authorising a second 24-hour test. Separate-user ownership, adaptive LLM behaviour and Android device acceptance remain outside this completed slice.
