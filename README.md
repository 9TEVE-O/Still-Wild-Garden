# Still Wild Garden

A quiet pixel garden that develops at its own pace. No tasks, score, streaks or punishment for leaving.

[Open the published garden](https://stillwild-garden.subzteveo.chatgpt.site/)

The repository contains two working codebases. Their integration is still outstanding.

| Location | What it contains | Current boundary |
|---|---|---|
| [web/](web/README.md) | Published Site version 2: React/TypeScript, Canvas, Cloudflare Worker/D1, portable gifts and Android companion candidate | One shared origin; age-based growth and animated keepers |
| [src/stillwild/](src/stillwild/) | Experimental Python/FastAPI/SQLite agent backend, worker, event ledger, memory, recommendations and SSE | Separate runtime; not connected to the pixel garden or a deployed weather feed |
| [docs/](docs/ARCHITECTURE.md) | Existing experimental backend architecture and original backend README | Backend reference; does not establish the approved pixel-garden proof |
| [web/project_docs/](web/project_docs/PROJECT_INDEX.md) | App contracts, latest brief, checkpoint, source manifest and verification | Records current decisions and what remains unproven |

The web app was imported from saved Site version 2, commit `bcf2d5210282e3683502be5066d745f920ffb191`. The Python backend added in `d123b97cbf86a1a0d989ccce8a5d6be561f11734`, the uploaded image and the subsequently merged [agent prompt catalog](docs/garden-agent-prompts.md) are preserved. The catalog remains a parked reference for the approved pixel-garden milestone.

## Confirmed direction

The latest [v0.2 brief](web/project_docs/Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md) records approved canonical authority for the bounded background milestone, through the owner's `/approved / action` on 4 October 2026.

Scheduled server work must save pixel-garden outcomes before a viewer returns. The first proof is one isolated Darwin test garden, hourly weather intervals keyed in UTC, saved keeper consequences, and a read-only snapshot with refresh. Acceptance requires 24 hours with every view closed.

The backend contains a worker and SSE endpoint, but it does not yet implement that weather-driven pixel-garden milestone. SSE remains deferred for the approved milestone. The fourteen-agent prompt set is parked; future LLM use remains undecided. Neither source code nor passing unit tests establishes deployed unattended operation.

The current published Site is public and uses one shared garden record. Separate personal ownership is still a release requirement. The Android companion is a development candidate with physical-device acceptance open.

## Run the web app

Use Node.js 22.13 or later and the pinned pnpm 11.25.0. From `web/`:

```sh
cd web
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_superb_krista_starr.sql
pnpm start
```

The migration and server use local D1 storage. [Web instructions](web/README.md) cover the existing verifiers and continuation. GitHub commits do not deploy the managed Site.

## Run the experimental backend

From the repository root:

```sh
docker compose up --build
```

Open `http://localhost:8000/docs`. The separate worker uses the shared Docker data volume and runs independently of connected viewers. Physical action is off by default. No real actuator or weather adapter is connected.

The [original backend README](docs/EXPERIMENTAL_BACKEND_README.md) retains its API examples, event types and worker instructions. [Backend architecture](docs/ARCHITECTURE.md) describes its existing scope.

## Verification and next work

The imported web app passes TypeScript, production build, persistence, GIF/renderer, Android-scene and local Worker/D1 checks. The preserved Python backend passes all 21 pytest tests and Ruff. [The sync record](web/project_docs/GITHUB_SYNC.md) and [machine-readable evidence](web/project_docs/repository-verification.json) describe their scope and the preserved backend.

The next bounded build is connecting a protected, isolated scheduled pixel-garden updater under v0.2, followed by the 24-hour absence proof. Preserve the original origin, version 1 gifts and Android companion behaviour.
