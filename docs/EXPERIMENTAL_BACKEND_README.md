
# Still Wild Garden

**A forever-growing garden that evolves over time with the help of agents.**

Stillwild is a persistent agentic ecological system. It is designed to keep observing, reasoning and accumulating evidence even when nobody has the app open.

The first working spine implements:

- durable garden events
- persistent garden memory
- specialised garden agents
- a wildness/intervention gate
- a council that resolves recommendations
- bounded experiments
- delayed outcome recording
- evidence-based agent evolution candidates
- a long-running background worker
- reconnectable Server-Sent Events (SSE)
- explicit action authority boundaries

## Run

```bash
docker compose up --build
```

Then open:

```text
http://localhost:8000/docs
```

Health:

```bash
curl http://localhost:8000/health
```

## Send a real garden observation

```bash
curl -X POST http://localhost:8000/events \
  -H "content-type: application/json" \
  -d '{
    "type": "sensor.soil_moisture",
    "zone_id": "north-bed",
    "source": "soil-sensor-01",
    "payload": {
      "percent": 17.2,
      "forecast_rain_mm_24h": 0
    }
  }'
```

Stillwild stores the observation, routes it to relevant agents, applies the wildness gate, records a council recommendation and updates evidence-linked memory.

## Stream garden events

```js
const source = new EventSource("http://localhost:8000/stream");

source.addEventListener("garden_event", (event) => {
  const gardenEvent = JSON.parse(event.data);
  console.log("garden changed", gardenEvent);
});
```

The stream uses durable event sequence IDs. Reconnection can resume from `Last-Event-ID` without treating the browser as the source of truth.

## Background life

The `worker` container wakes on a configurable interval and emits a `system.tick`. It runs independently of any connected user.

```text
STILLWILD_TICK_SECONDS=300
```

If your host cannot run a permanent worker, schedule:

```text
POST /tasks/tick
```

from the host's cron/scheduler.

## Authority

Automatic physical action is **off by default**.

```text
STILLWILD_AUTOMATION_AUTHORITY=false
```

Agents may propose watering, inspection or another intervention. Stillwild does not claim an action happened until an authorised actuator integration returns telemetry.

## Event types

The initial agents understand these event families:

- `sensor.soil_moisture`
- `sensor.temperature`
- `sensor.humidity`
- `sensor.light`
- `weather.forecast`
- `weather.rain`
- `plant.observation`
- `wildlife.observation`
- `fungi.observation`
- `system.tick`

Unknown event types are still durably stored and observed. New agents can be added without changing the event ledger.

## API surface

- `GET /health`
- `POST /events`
- `GET /events`
- `GET /stream`
- `GET /state`
- `POST /experiments`
- `POST /outcomes`
- `POST /tasks/tick`

## Principle

Stillwild should not optimise the garden into submission.

Its default loop is:

```text
observe
  -> model
  -> interpret
  -> experiment when uncertain
  -> intervene only when justified
  -> measure
  -> remember
  -> evaluate the agents themselves
  -> adapt through tested changes
```

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the system boundary and next layers.
