# Stillwild

A quiet pixel garden that develops at its own pace. Plant one seed, watch Pip, Dew and Moss make a home around it, and give someone a portable seed of their own.

**No tasks. No score. No streaks. No punishment for leaving.**

[Open Stillwild](https://stillwild-garden.subzteveo.chatgpt.site/)

This repository contains the existing web app, artwork, database migration, offline gift renderer, Android companion candidate and the revised background-data brief. The application source was imported from saved Site version 2, commit `bcf2d5210282e3683502be5066d745f920ffb191`, on 4 October 2026.

## What works today

- React and TypeScript interface with a Canvas 2D garden, ambient sound and a movable viewing bubble.
- One shared cloud garden: an immutable seed and birth time stored in Cloudflare D1.
- Version 1 growth reconstructed from elapsed time, with deterministic keeper animations.
- Self-contained offline HTML seed gifts, PNG wallpaper and small GIF exports.
- An Android overlay development candidate with original-garden JSON import. Physical-device acceptance remains open.

The current published Site is public. It has no separate visitor ownership model. Older source documents describe its original private deployment; the current observation and that discrepancy are recorded in [GITHUB_SYNC.md](project_docs/GITHUB_SYNC.md).

## Background development

The confirmed requirement is **scheduled execution**: a server job must save garden outcomes before anyone returns. The isolated implementation now lives in [background-proof/](../background-proof/README.md). This public legacy app remains unchanged; the separate test garden's 24-hour absence proof is pending.

The proposed first milestone is one isolated Darwin test garden, hourly weather intervals keyed in UTC, saved keeper consequences, and a read-only snapshot with visible-page refresh. Its acceptance includes 24 hours with every view closed. SSE and WebSockets are deferred.

The latest [v0.2 brief](project_docs/Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md) records **approved / canonical** authority for the bounded background milestone, through the owner's `/approved / action` on 4 October 2026. This approval was added to the source brief during the GitHub update. The fourteen-agent prompt set remains parked as an uninspected reference, and future LLM use is undecided. Approval of the requirements does not establish implemented operation or a passed 24-hour proof.

## Run locally

Use Node.js 22.13 or later and the project's pinned `pnpm@11.25.0`. Keep the lockfile.

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm exec wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_superb_krista_starr.sql
pnpm start
```

Open the local URL printed by Wrangler. The migration and server above use local storage. For development, `pnpm dev` starts the Vinext/Vite preview; initialise its local D1 storage before testing planting. Use local fixtures for testing and preserve the live garden.

The existing `.openai/hosting.json` retains the original Site identity and logical `DB` binding. GitHub commits do not automatically deploy that Site. Sites owns its hosted database, access settings and publication workflow.

## Checks and continuation

```sh
pnpm exec tsc --noEmit
node scripts/verify-persistence.cjs
node scripts/verify-garden.cjs
node scripts/verify-android.cjs
```

The two renderer checks additionally use `@napi-rs/canvas` from `CODEX_PRIMARY_RUNTIME_NODE_MODULES`, as supplied in the Work Mode environment. Their results do not establish browser or Android device acceptance.

Read [AGENTS.md](AGENTS.md), [the project index](project_docs/PROJECT_INDEX.md), [the current checkpoint](project_docs/CURRENT_BUILD_STATE.md) and [validation evidence](project_docs/VALIDATION.md) before making changes. [The Android README](android/README.md) owns its build instructions and phone acceptance. [Source provenance](project_docs/source-import-manifest.json) records the imported files and original hashes.
