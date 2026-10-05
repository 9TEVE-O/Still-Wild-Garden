# Stillwild background milestone

Authority: Steven Lees approved App Brief v0.2 with `/approved / action`, 4 October 2026. That brief governs this milestone; the fourteen-agent prompt set remains parked. Legacy gifts and the Android companion remain version 1. An LLM has not been selected or prohibited for later versions.

Deployment: one new owner-private test Site, independent D1 database and garden `darwin-proof-001`. The original public Site, seed, birth time and original repository remain unchanged. Platform service access is documented for owner-private Sites and is checked before scheduling. Never publish this test Site publicly; its bounded writer relies on the private hosting boundary. No cookies or browser session are required by the service job. No workspace source connectors are used.

## Background writer

Reopen this linked Site with Sites `get_site`. Verify owner-private access and active publication; obtain its current service credential from that response. Send the credential only to this exact Site in `OAI-Sites-Authorization: Bearer ...`. It is consumed by Sites dispatch. Never write credentials into a file, schedule, browser code, shell argument, log or result.

Collect the exact Open-Meteo URL in lib/weather.ts from the cloud-task runtime (Darwin, UTC Unix timestamps, stated units, three past days and two forecast days). POST `/api/background/tick`, content type `application/json`, body `{"trigger":"schedule","weather":<unmodified provider JSON>}`. The bounded inputs are a caller-declared trigger label and a validated provider response, limited to 65,536 characters and 200 hourly samples. Record the fetch status; do not fabricate a weather response. If collection fails, send only `{"trigger":"schedule"}` so the server attempts its own fetch and applies its documented fallback. It cannot choose a garden, seed, timestamp, weather or mutation. HTTP failures and uncommitted progress are not a success. Each call validates the scheduler-relayed feed (or collects from the hosted Worker), saves selected completed UTC-hour environmental samples, and processes at most six oldest due intervals. It can execute with no viewing browser.

GET `/api/evidence` with the same service access. Read back the returned run ID, committed-tick count, revision, last UTC tick and events; report errors and remaining backlog. This read does not advance or log a viewing visit. Never navigate to `/`, call `/api/snapshot`, use the old public origin garden or rebuild the Site as part of a routine run.

## Simulation and consistency

Each tick is the preceding hour ending on an aligned UTC boundary. Rain is applied once. Provider values, units, valid interval, retrieval time and fetch revision are retained; each committed tick pins one input. New model revisions do not rewrite earlier outcomes. Future inputs are excluded. Non-rain weather values are instantaneous at interval end; rainfall covers the preceding interval.

Pip cycles finding space, sowing and resting. Sowing adds one stored plant when habitat exists. Dew cycles spring collection, carrying and watering roots. Watering changes stored soil moisture. Moss cycles observation, making space and rest. Making space adds one habitat slot. Counts change through saved transitions, never through elapsed-time reconstruction in the viewing code. Local movement remains animation and does not establish intelligence or a saved task's position. There are no external keeper actions.

Model inputs influence rain accumulation, daylight-related moisture use and the shown atmosphere. Missing intervals use zero-rain, explicitly simulated creative conditions, never rain from another hour. Exact archived intervals older than six hours are labelled stale. Plants never die from absence. These rules are creative world units and are not scientifically calibrated.

D1 atomic batches guard the prior revision/last-tick position, insert a unique garden/rules/tick key, insert stable consequence IDs and update the world. A stale concurrent computation commits nothing; SQL failure rolls the batch back. The background run succeeds only after commits. A worker crash may leave a `running` attempt, so audit applied ticks for its committed progress instead of assuming it never acted. Scheduler trigger labels are caller declarations; correlate run IDs with independent scheduler/Worker logs to establish provenance.

## Read path and proof

GET `/api/snapshot` only reads state, events, runs and the immutable baseline in one database transaction. It emits a Worker view log for absence review and never advances the world or fetches weather. The browser reads on opening, reconnecting, becoming visible and every five minutes while visible. The canvas uses stored plant counts; frequent redraw is local movement. SSE is deferred.

The first authenticated writer saves an immutable creation baseline and never replays pre-birth hours. After final publication and access verification, POST `/api/proof/start` with JSON `{}` through the same private service boundary. This records a separate immutable absence-check baseline without changing world state. Retries preserve its original start time. Publish-triggered platform captures can open the view, so start this proof checkpoint after all publishing finishes. Close every test-garden view for at least 24 hours. After baseline+24 hours, inspect background data before the first viewing read; corroborate saved tick commits and meaningful keeper events with independent scheduler and Worker logs. Review `stillwild_snapshot_view` logs for visits during the window. Absence is a human/independent-log assertion and is not inferred from a database timestamp. The API conservatively reports proof pending until a separate review establishes it. Do not promote that state automatically after time elapses.

A successful initial write/read proves writer accessibility, not a scheduled run or 24-hour operation. TypeScript/build/SQLite tests have their own narrower scope. Separate-user ownership and cloud/mobile synchronisation are deferred until the isolated proof passes.

## Hosted weather transport check, 4 October 2026

The initial hosted Worker fetch received Open-Meteo HTTP 429. A cloud-task-runtime probe of the identical URL returned HTTP 200 with 120 hourly rows, UTC offset 0 and the required units. The supported job therefore collects once in that runtime and relays the unmodified provider JSON through the protected writer; source transport is recorded on every sample. This is a rate-limit handling change, not a second provider or a scientific claim. Cloud deployment and write/read for the relay still need their own evidence.

For relayed samples, `fetchedAt` is the garden server's receipt time. The scheduled job must retain the actual provider HTTP status and fetch time in its run output. UTC valid interval identity still determines rain accounting, independently of either retrieval timestamp.

## Observed execution checkpoint, 5 October 2026

Managed Site version 3 and its published source were recovered without changing the Site. Native deployment status is succeeded; owner-private metadata and the two enabled tasks were read. Native D1 storage shows revision 22, 22 unique completed ticks and 31 consequences. All tick run IDs match successful Worker logs. The full 24-hour absence proof remains pending. The GitHub copy and its audit do not deploy or mutate hosted state. See CURRENT_BUILD_STATE.md and the root repository audit for the exact window and limits.
