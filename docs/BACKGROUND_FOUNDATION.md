# Background foundation v0.1

This slice hardens the **experimental Python backend and its simulated Wild**. It is a
reusable foundation for the approved background milestone, not a connection to the
published pixel garden. The live `origin`, v1 gifts and Android companion are untouched.

## Observable contract

An authorised scheduler or a local worker processes completed UTC slots without a viewer.
A retry, worker restart or simultaneous cron call reuses a committed slot. State, events,
agent outcomes, candidate records, slot markers and the successful run receipt commit
together. An ordinary failure rolls back the bounded batch and records a failed attempt.
A killed process may leave a `started` attempt; that is not evidence of committed progress.

The first invocation processes one slot and establishes its baseline. It does not invent
activity before the scheduler existed. Later invocations process at most
`STILLWILD_CATCH_UP_LIMIT` missed slots and return the remaining backlog. A simulated day
per slot is accelerated model time, not an hour of actual weather or physical growth.

The database pins the interval, simulation mode, seed configuration and rules version.
An incompatible configuration returns a conflict rather than silently resetting the garden.
Use a separate test database for different configurations. No reset/migration endpoint is added.

## Permissions and routes

| Actor | Credential | Allowed API writes |
|---|---|---|
| Scheduler | `STILLWILD_TASK_TOKEN` | `POST /tasks/tick` |
| Operator | `STILLWILD_OPERATOR_TOKEN` | `POST /events`, `/experiments`, `/outcomes`, `/wild/advance` |
| Viewer | None | None |
| Local worker | Local database access | The same `run_due` transaction as the scheduler |

Use `Authorization: Bearer <token>`. Tokens must be distinct and at least 32 characters.
Empty, short or shared tokens disable API writes with HTTP 503. Missing/wrong credentials
return HTTP 401 when the relevant token is configured. Simulation/lease/configuration
conflicts return HTTP 409. These service credentials do not implement separate-user ownership.

`GET /wild`, `/state`, `/events` and `/garden` remain read-only prototype views.
`GET /tasks/runs` requires the operator key and returns attempted execution separately
from committed progress. The Wild snapshot exposes its immutable seed, version and revision.

The dashboard requests an operator token in a password field for each manual advance.
It sends it only in the request header; it does not save it in a URL, cookie, local storage
or session storage. The scheduler token never belongs in the dashboard.

Docker binds the API to `127.0.0.1` by default. Use authenticated TLS hosting for an external
scheduler. Hosting, private reads and an owner mapping are not supplied by this slice.

## Run locally

Install development dependencies and prepare configuration:

```sh
python -m pip install -e '.[dev]'
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(32))'
```

Generate two different values with that last command and set the task/operator token fields
in `.env`. For an isolated simulated Docker garden, set `STILLWILD_WILD_SIM=true`.
The optional `STILLWILD_TICK_SECONDS=3600` selects hourly UTC slots. API and worker receive
the same cadence and catch-up limit from Compose. The existing prototype default is 300 seconds.

```sh
docker compose up --build
```

Open `http://localhost:8000/garden`. The worker needs no browser or API token because it
already has local database access. Blank API credentials still disable HTTP writes.
Keep test and real observations in different databases.

After exporting the task/operator credentials in the calling terminal:

```sh
curl -X POST http://localhost:8000/tasks/tick \
  -H "Authorization: Bearer $STILLWILD_TASK_TOKEN"
curl http://localhost:8000/tasks/runs \
  -H "Authorization: Bearer $STILLWILD_OPERATOR_TOKEN"
```

`committed_slots: 0` and `status: duplicate` mean no new progression occurred. A real-observation
database with simulation enabled returns `wild.skipped`; a completed evaluation tick in
that database is not simulated growth. Changing a pinned schedule requires a separate
configuration decision. No physical watering or inspection is executed by this code.

## Existing agent duties

All current agents are deterministic Python rules. No LLM or self-modification is introduced.

| Agent | Current duty | Limit |
|---|---|---|
| Observer | Record each observation and its evidence ID | A periodic tick is not an environmental observation |
| Water | Assess soil moisture and forecast rain; propose bounded irrigation | A proposal is not executed watering |
| Plant | Classify supplied plant condition; propose inspection for stress | Does not diagnose a cause from appearance alone |
| Ecologist | Preserve plant, wildlife and fungi observations | Presence alone does not establish a causal relationship |
| Microclimate | Add environmental measurements to zone history | Requires repeated evidence for a microclimate rule |
| Wildness | Defer low-confidence intervention proposals | An allowed proposal still needs council review |
| Council | Reconcile proposals, investigations and observation | Execution still requires separate actuator telemetry |

The Wild judges selected advice against later **simulated** conditions. Agent scores measure
contribution to council advice, not causal individual performance or real-world accuracy.
Poor scored advice may create a candidate; replay, trial and human promotion remain future work.

## Verification and remaining work

```sh
ruff check src tests scripts/verify-background.py
pytest -q
python scripts/verify-background.py --output /tmp/stillwild-smoke.json
```

The last command starts a worker on disposable storage with a one-second simulation cadence,
then stops it before starting an API and making the first garden request. It compares saved
state and worker logs, verifies an anonymous task is rejected, and checks the return read
does not change state. Its default window is three seconds. It is not the 24-hour proof.

The approved pixel-garden milestone still needs archived Darwin environment intervals,
versioned pixel-keeper consequences, a pixel snapshot/refresh adapter, an authorised host
schedule and independently corroborated 24-hour absence evidence. Separate-user ownership
is a release gate. Existing experimental SSE is retained; it is not adopted for that milestone.

The current audit and exact evidence are in [the audit record](audits/2026-10-04/AUDIT.md).
