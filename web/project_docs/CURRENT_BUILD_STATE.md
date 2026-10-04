STATE_SCHEMA_VERSION: 1
LAST_COMPLETED_STAGE: Existing Site version 2 source imported; local type, build and persistence/renderer/companion checks passed
CURRENT_ACTIVE_STAGE: Approved background milestone awaiting isolated scheduled-garden implementation
NEXT_PERMITTED_STAGE: Implement and validate the isolated scheduled-garden proof; preserve the original garden

Updated: 4 October 2026, Australia/Darwin.

## Current result

The web app and Android development candidate are stored under web/ and imported from saved Site version 2, source commit `bcf2d5210282e3683502be5066d745f920ffb191`. The existing API, immutable `origin` record, v1 growth formulas, renderer, seed format, gifts and companion behaviour are preserved. Source synchronisation is not a new Site deployment. Exact import and verification evidence is in GITHUB_SYNC.md and source-import-manifest.json.

The Site metadata currently reports a public, active Site at https://stillwild-garden.subzteveo.chatgpt.site/ with no linked schedules (`automations: []`). The imported checkpoint and contracts referred to an earlier private deployment. Neither private access nor individual ownership may be inferred from those historical descriptions. No audience change or production garden mutation is part of this GitHub update.

## Recorded decisions and scope

- D-01 is confirmed: scheduled jobs must commit outcomes before a viewer returns. Return-time replay can support bounded recovery but is not the selected normal runtime.
- D-02 is recorded as approved in the latest v0.2 source brief through the owner's `/approved / action` on 4 October 2026. That record was updated during this sync. The brief governs the bounded background milestone; existing contracts continue to govern legacy gifts, the original garden and the Android companion.
- The fourteen-agent prompt set is parked and was not retrieved for this update. Its text is not adopted as a runtime contract.
- The first proposed proof uses one isolated Darwin test garden, hourly UTC environment intervals, saved keeper consequences and a read-only snapshot with refresh.
- SSE, WebSockets, streaming cursors and stream retention are deferred. The user's EventSource/PHP examples are reference material.
- Separate personal gardens require authenticated ownership isolation before a multi-user release. Future LLM use is undecided.

## Evidence limits

The imported web application reconstructs growth from a seed and birth time. A separately added Python/FastAPI backend at the repository root is preserved; it contains durable events, recommendations, a worker and SSE, but it is not connected to this pixel garden or a recurring weather adapter. Its keepers are animated simulations; no scheduled pixel-keeper consequences, recurring weather ingestion or 24-hour absence proof are established for the published garden. Snapshot reads do not currently advance a server simulation.

The original Android development APK and build evidence are retained. Node renderer parity and native compilation do not prove actual overlay operation, permission flows or phone lifecycle. Physical-device checks in ../android/README.md remain unexecuted. Version 1 portable garden files retain their original local age-based behaviour.

## Next bounded work

Implement the isolated scheduled test garden under the approved v0.2 brief and run its acceptance table in Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md. Keep the existing origin untouched and use local or separate test storage. Do not claim unattended operation before independently corroborated runs commit outcomes during at least 24 hours with all garden views closed.
