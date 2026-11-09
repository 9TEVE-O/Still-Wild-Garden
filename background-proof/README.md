# Stillwild background proof

One private, isolated Darwin test garden under the approved [app brief v0.2](project_docs/APP_BRIEF_v0.2.md). This GitHub directory began as the source recovered from managed Site version 3, commit `89babb648b5519f6f8545d265171b351d9c47154`; the deployment history and 10 November 2026 owner-authorised publication are recorded in [CURRENT_BUILD_STATE.md](project_docs/CURRENT_BUILD_STATE.md). [The import manifest](../docs/audits/2026-10-05/background-source-manifest.json) records its original file hashes and the documentation/evidence changes made for this repository.

The hourly updater stores completed UTC weather intervals and meaningful Pip, Dew and Moss consequences in D1. Reads never advance the world. Native evidence recorded revision 22 and 22 committed ticks at the 5 October cutoff. The original 24-hour absence review is **INCONCLUSIVE**: complete view closure and historical scheduler identity were not established. This is separate from the public legacy garden and the Python Wild simulation.

On 10 November 2026, repository source `ac0828ee0d4dcd19c39dcf45543a81a9bfffac34` was published as Site source `2fa7e1a388b72784c710fe7ae2fb06454e1394e9`. Native Sites reported success with owner-only access. TypeScript, transactional background checks, provenance checks and the production build passed locally. The existing D1 binding was retained; live data was not reread, and no new absence checkpoint was started.

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

`verify-background.cjs` tests the actual transition, weather parser, SQL and route code against an isolated transactional SQLite adapter with a controlled clock and weather. It exercises duplicate/overlapping ticks, rollback, rainfall intervals, fallback, catch-up, read-only snapshots served only to open view sessions, immutable checkpoints and the view-closure gate (stale and racing sessions, close-before-open, in-window activity). Both verifiers run from any working directory. It does not prove deployed absence or platform access enforcement.

## Hosted boundary and continuation

The hosted writer relies on the managed Site's owner-private access boundary. It has no portable authentication middleware for a public deployment. Keep this test Site private. `.openai/hosting.json` retains its exact identity; a GitHub commit does not deploy it.

Read [BACKGROUND_PLAN.md](project_docs/BACKGROUND_PLAN.md) for service access, input provenance and keeper rules, and [CURRENT_BUILD_STATE.md](project_docs/CURRENT_BUILD_STATE.md) for current evidence. Source import omits the generated `tsconfig.tsbuildinfo` cache. Inherited legacy/Android verifier scripts are not this app's acceptance checks.

The original checkpoint `absence-check-001` (4 October 2026, 16:57:51 ACST) is preserved and must never be restarted or overwritten. Its review was executed and is INCONCLUSIVE. View-closure source is now published. Current scheduler progress, hosted D1 gate behaviour and preserved records still require fresh verification. A second 24-hour window needs a distinct immutable checkpoint and separate owner authorisation. Do not open the hosted view, reset state or redeploy without that authorisation.
