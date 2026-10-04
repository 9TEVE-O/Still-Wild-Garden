
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
- **Lease** prevents multiple workers from performing the same periodic tick concurrently.

If the hosting platform does not support a continuously running worker, schedule `POST /tasks/tick` with an external cron. Browser presence is never required.

## Persistent records

- `events`: immutable observations and system events
- `agent_runs`: what each agent concluded and why
- `recommendations`: council decisions
- `outcomes`: delayed evaluation supplied by telemetry or a human
- `memories`: evidence-linked garden memory
- `experiments`: bounded ecological experiments
- `evolution_candidates`: proposed agent changes, never silent self-modification
- `leases`: background worker coordination

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
