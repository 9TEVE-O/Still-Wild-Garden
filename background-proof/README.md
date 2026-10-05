# Stillwild background proof

One private, isolated Darwin test garden under the approved [app brief v0.2](project_docs/APP_BRIEF_v0.2.md). This GitHub directory contains the source recovered from managed Site version 3, commit `89babb648b5519f6f8545d265171b351d9c47154`. [The import manifest](../docs/audits/2026-10-05/background-source-manifest.json) records its original file hashes and the documentation/evidence changes made for this repository.

The hourly updater stores completed UTC weather intervals and meaningful Pip, Dew and Moss consequences in D1. Reads never advance the world. Native evidence currently supports revision 22 and 22 committed ticks; **24-hour absence remains pending**. This is separate from the public legacy garden and the Python Wild simulation.

## Local development

Use Node.js 24 and `pnpm@11.25.0`. From this directory:

```sh
pnpm install --frozen-lockfile
pnpm exec tsc --noEmit
node scripts/verify-background.cjs
pnpm build
pnpm exec wrangler d1 execute site-creator-d1 --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_melodic_lucky_pierre.sql
pnpm start
```

Use the local URL printed by Wrangler. A fresh local database is empty until its first local background write. For example, send JSON `{"trigger":"manual"}` to the local `/api/background/tick` route, then read local `/api/evidence`. Never use these steps against either hosted garden.

`verify-background.cjs` tests the actual transition, weather parser, SQL and route code against an isolated transactional SQLite adapter with a controlled clock and weather. It exercises duplicate/overlapping ticks, rollback, rainfall intervals, fallback, catch-up, read-only snapshots and immutable checkpoints. It does not prove deployed absence or platform access enforcement.

## Hosted boundary and continuation

The hosted writer relies on the managed Site's owner-private access boundary. It has no portable authentication middleware for a public deployment. Keep this test Site private. `.openai/hosting.json` retains its exact identity; a GitHub commit does not deploy it.

Read [BACKGROUND_PLAN.md](project_docs/BACKGROUND_PLAN.md) for service access, input provenance and keeper rules, and [CURRENT_BUILD_STATE.md](project_docs/CURRENT_BUILD_STATE.md) for current evidence. Source import omits the generated `tsconfig.tsbuildinfo` cache. Inherited legacy/Android verifier scripts are not this app's acceptance checks.

The current absence checkpoint and the existing hourly and review tasks remain in place. Do not open the hosted view, reset state, redeploy or restart the checkpoint during the test. The earliest review is 5 October 2026, 16:57:51 ACST; the scheduled review is at 17:12:51 ACST.
