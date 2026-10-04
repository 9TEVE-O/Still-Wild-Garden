
# Stillwild architecture v0.1

Stillwild is designed as a persistent ecological system, not a browser session.

## Core loop

`event -> durable store -> relevant agents -> wildness review -> council -> recommendation -> outcome -> memory -> evaluation`

Reality remains authoritative. Agent output is interpretation, not observation.

## Runtime

The API and worker are separate processes.

- **API** accepts observations, exposes state, records experiments/outcomes, and streams durable events with Server-Sent Events.
- **Worker** continues periodic evaluation while no user is connected.
- **SQLite/WAL** is the first durable state store. It is intentionally replaceable with PostgreSQL later.
- **Scheduled slot transaction** prevents cron retries and multiple workers from duplicating
  a completed UTC slot. A separate lease and revision fence protect manual Wild advances.

If the hosting platform does not support a continuously running worker, schedule `POST /tasks/tick` with an external cron. Browser presence is never required.

## Persistent records

- `events`: immutable observations and system events
- `agent_runs`: what each agent concluded and why
- `recommendations`: council decisions
- `outcomes`: delayed evaluation supplied by telemetry or a human
- `memories`: evidence-linked garden memory (keeps the full evidence count but only the 50 most recent evidence ids)
- `experiments`: bounded ecological experiments
- `evolution_candidates`: proposed agent changes, never silent self-modification
- `leases`: background worker coordination
- `worlds`: persistent state of simulated gardens (the Wild)
- `background_schedules`: pinned configuration and the last committed UTC slot
- `background_ticks`: unique committed slots linked to their originating run
- `background_runs`: started, completed, duplicate and failed execution attempts

## Protected background progression

The worker and `POST /tasks/tick` share `stillwild.background.run_due`. Each bounded batch
commits evaluation, optional simulated growth, slot markers and its completed receipt in
one transaction. Retries do not create another tick. Restart recovery processes a bounded
backlog from the saved cursor. Reads do not invoke this updater.

The task endpoint requires a scheduler bearer token. Other mutation routes and run-history
reads require a separate operator token. Unconfigured API writes are disabled. This is
service authorization, not authenticated personal garden ownership. See
[the background foundation](BACKGROUND_FOUNDATION.md) for configuration and evidence limits.

## Authority boundary

`STILLWILD_AUTOMATION_AUTHORITY=false` by default.

With authority disabled, agents can recommend physical actions but cannot claim they occurred.

Even when enabled, the current code only emits an authorised proposal. A future actuator adapter must return execution telemetry before an action can be recorded as completed.

## SSE

Clients can subscribe to:

```text
GET /stream
```

Each event includes the durable SQLite sequence as the SSE `id`. Browsers can reconnect using `Last-Event-ID`, so temporary disconnection does not lose garden events.

Example:

```js
const source = new EventSource("/stream");

source.addEventListener("garden_event", (event) => {
  const gardenEvent = JSON.parse(event.data);
  console.log(gardenEvent);
});
```

## The Wild (simulated garden)

`stillwild.wild` is an opt-in (`STILLWILD_WILD_SIM=true`), seeded ecosystem that gives the
agents years of experience in minutes:

- World state lives in the `worlds` table and advances one simulated day at a time. Each day
  uses its own seeded random stream, so a world grows identically however its days are batched.
  A manual advance commits each day's events, judgements and world state in a transaction
  that also renews the `wild-sim` lease. Scheduled advances join their enclosing bounded
  batch transaction, including outcomes and evolution candidates. A crash rolls back
  the uncommitted transaction. Each save is fenced on a world
  revision, so an advance that was overtaken (even one that later re-acquired the lease)
  cannot commit stale state.
- Each simulated day emits ordinary events (`sensor.temperature`, `weather.rain`,
  `sensor.soil_moisture` with a forecast, `plant.observation`, `wildlife.observation`,
  `fungi.observation`). They all go through `GardenEngine.ingest`, with source `wild-sim` and
  `"simulated": true`.
- **Ground-truth judging.** Irrigation proposals are judged 3 simulated days later and plant
  inspections 10 days later. Each is scored on whether drought damage, rain or recovery followed,
  and the result is recorded as a normal outcome, which can raise evolution candidates. The
  outcome notes say the action was never executed.
- **Guards.** A `wild-sim` lease stops two processes advancing the same world. A new world
  claims its database in the same write transaction that confirms no real observation exists.
  After that, `GardenEngine.ingest` rejects real observations inside its own transaction, so
  real and simulated evidence can never mix, whichever side writes first. Simulation status is
  trusted only from the in-process Wild: `POST /events` rejects the `simulated` payload flag and
  the `wild-sim` source, so clients cannot disguise real observations as simulated.

`GET /garden` renders the world live from `GET /wild` and `/stream`.

## Agent evolution

Agents do not rewrite themselves.

Resolved recommendations receive an outcome and utility score. Once an agent has enough resolved evidence and is performing poorly, Stillwild creates an `evolution_candidate`.

Candidate changes should later pass:

1. historical replay
2. comparison with the current rule
3. bounded live trial
4. human promotion or rejection

This preserves lineage and prevents uncontrolled prompt/rule drift.

## Next architectural layers

The current build deliberately establishes the spine before adding complexity:

1. PostgreSQL + time-series sensor ingestion
2. zone/plant/organism entities and relationships
3. real weather provider adapter
4. image observations and plant-vision pipeline
5. solar-path and shadow model
6. experiment scheduler
7. actuator adapters with execution receipts
8. model-backed agents behind the same evidence/authority contract
9. historical replay and candidate promotion workflow
10. long-term ecological graph and causal hypotheses
