# Real-world ingestion v0.1

Status: experimental backend layer. This does not connect the published pixel garden in `web/` to the Python service and does not establish the approved 24-hour unattended pixel-garden proof.

## Purpose

Move Stillwild from demonstration data toward longitudinal evidence from a real garden while preserving the existing authority boundary:

```text
real garden -> registry / weather / sensors -> durable event ledger -> agents -> memory
```

Reality is authoritative. Weather-provider output and sensor values are observations with provenance, not proof that a physical action occurred.

## Isolation

The real-world registry refuses to write into a database that contains The Wild simulation. Use separate database files or volumes for simulated and real evidence.

The production pixel garden `origin` in `web/` is not read, planted, reset, updated or deleted by this layer.

## Records

The layer adds four real-world registries plus archived weather inputs:

- `real_gardens`: garden identity, coordinates, timezone and climate label
- `garden_zones`: named garden areas with structured exposure notes
- `organisms`: plants, animals, fungi or other organisms associated with a garden/zone
- `sensors`: typed measurement sources with semantic units
- `environment_intervals`: versioned provider inputs keyed by garden, provider and completed UTC interval

Sensor readings themselves enter the existing immutable event ledger. Weather intervals are archived first and, when a new revision is recorded, a `weather.interval` event enters the same ledger.

## Weather

Open-Meteo is the first provider adapter. Collection requests UTC Unix timestamps and saves the latest completed UTC hour. The stored interval includes:

- provider and model label
- valid start/end UTC
- fetch time UTC
- source status
- temperature
- relative humidity
- precipitation
- cloud cover
- 10 m wind speed
- sunrise and sunset
- units
- revision

Repeating the same completed interval with identical values is idempotent and does not create another ledger event. A changed provider response is archived as a new revision.

This records model-derived environmental evidence. It does not claim site-level sensor precision or physical realism.

## API

Create an isolated real garden:

```http
POST /real/gardens
{
  "id": "darwin-test",
  "name": "Darwin test garden",
  "latitude": -12.4634,
  "longitude": 130.8456,
  "timezone": "Australia/Darwin",
  "climate": "tropical savanna"
}
```

Add a zone:

```http
POST /real/zones
{
  "id": "north-bed",
  "garden_id": "darwin-test",
  "name": "North bed",
  "exposure": {"sun": "morning", "wind": "open"}
}
```

Register an organism:

```http
POST /real/organisms
{
  "id": "lemon-1",
  "garden_id": "darwin-test",
  "zone_id": "north-bed",
  "kind": "plant",
  "common_name": "Lemon",
  "scientific_name": "Citrus limon"
}
```

Register a sensor:

```http
POST /real/sensors
{
  "id": "soil-1",
  "garden_id": "darwin-test",
  "zone_id": "north-bed",
  "kind": "soil_moisture",
  "unit": "%",
  "source": "soil-probe-01"
}
```

Ingest a reading:

```http
POST /real/sensor-readings
{
  "sensor_id": "soil-1",
  "value": 17.2,
  "forecast_rain_mm_24h": 0
}
```

Collect weather manually:

```http
POST /real/gardens/darwin-test/weather/collect
```

Read archived environment intervals:

```http
GET /real/gardens/darwin-test/environment?limit=48
```

## Background collection

The existing worker and `/tasks/tick` can collect weather when explicitly configured:

```text
STILLWILD_WEATHER_COLLECT=true
STILLWILD_REAL_GARDEN_ID=darwin-test
STILLWILD_WEATHER_TIMEOUT_SECONDS=10
```

This only establishes a code path. A deployed recurring schedule and the pixel garden's 24-hour closed-view proof remain separate evidence requirements.

## Next boundary

The next integration after this layer is not another agent. It is a controlled bridge from these real-world records into the isolated scheduled pixel-garden state machine required by the approved v0.2 brief, followed by the 24-hour unattended proof.
