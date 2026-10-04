# Validation evidence — 2026-09-26

| Check | Observed result | Scope |
|---|---|---|
| TypeScript `tsc --noEmit` | PASS | Full authored TypeScript |
| Sites production build | PASS (initial); final build runs as part of publication | Worker/SSR/client compilation |
| Generated D1 migration | Inspected; local Wrangler D1 execution passed | Additive one-table schema |
| `node scripts/verify-persistence.cjs` | PASS | Actual route/query code with a SQLite-backed D1 adapter; empty read, idempotent planting, five repeats, reopen persistence, wrong-origin 403, mutation 400, media-type 415 |
| `node scripts/verify-garden.cjs` | PASS | Actual shared renderer with Node canvas and actual codec; independent GIF decoder |
| GIF result | 121,484 bytes; 800×320; 60 frames; 6 seconds | See loop-evidence.json; exact t=0/t=T equality, complete decode, opaque loop reset |
| Maximum changed pixels per adjacent raw frame | 1.78359375% | At least 98.21640625% stationary pixels in the measured fixture |
| Offline runtime | Syntax PASS; no network primitive in runtime | `seedRuntime.toString()` compiled closure-free; not a full device HTML compatibility test |
| Art | Both generated originals and optimised frame inspected | Original pixel-art assets plus deterministic compositing |
| Supervised preview | Reported running; HTTP access returned 502 | Preview access limitation; no working source was changed to compensate |

Not established: native OS integration, actual AirDrop/Quick Share transport, mobile HTML opening, browser pointer/keyboard/screenshot QA, live cloud planting or WebMCP tool registration/execution. The required control-browser skill is unavailable; no alternate browser automation was improvised. These limits do not make source/build checks equivalent to device tests.

Private hosting completion was verified through native Sites deployment status. The assistant left the original publication unplanted; the owner's 28 September screenshots subsequently show Day 2. No production garden was planted or reset by these checks.

## Android companion increment — 2026-09-28

Owner evidence: two phone screenshots show the expanded website bubble with the orb at different positions, and the owner reports that it works well inside the website. They also report that it does not follow other apps, consistent with the web implementation. Native execution is not inferred from this evidence.

| Executed check | Result and scope |
|---|---|
| `node node_modules/typescript/bin/tsc --noEmit` | PASS after same-garden export and shared native scene source were added |
| Sites `build-site.mjs` | PASS: Worker, client and SSR compilation with Save for Android |
| `node scripts/build-android-scene.cjs` | Bundled the original growth/renderer and both art assets; source hashes recorded |
| `node scripts/verify-android.cjs` | PASS: 146-byte original identity export, five-age exact pixel parity, pause/resume and provenance checks; Node canvas/VM, not Android WebView |
| Java JUnit `GardenRecordTest` | 4 tests PASS via JDK 17 + JUnit 4.13.2 + org.json 20240303, including the actual web-export fixture, uint32 maximum/zero and malformed/type/version/range/gift rejection |
| Native SDK compilation | PASS through scripts/build-android-sdk.py: actual Android Java/resources/assets, SDK platform 35, build tools 35.0.0, D8 and zipalign |
| APK signature | Verified v2/v3; development signing identity, not production/store signing. Exact size/source hashes and APK digest in android/releases/build-evidence.json |
| Gradle wrapper | Generated with official Gradle 8.11.1; distribution SHA-256 pinned |
| Full Gradle Android build | NOT COMPLETED: its JVM could not reach its configured repository proxy. Direct SDK compilation above is separate positive evidence |

Device acceptance remains OPEN. No emulator/phone installation, native WebView image decoding, Messenger/YouTube overlay, gesture/rotation routing, notification action, permission denial/revocation or lock-screen lifecycle was executed here. Native independent foundation review, release-key continuity and store suitability are unestablished. See android/README.md for the specific phone checks. Website persistence/gift/GIF implementations were not changed, so earlier evidence retains only its original scope. No production read/write was used to obtain a real seed for these tests.

## GitHub source import — 2026-10-04

Saved Site version 2 source `bcf2d5210282e3683502be5066d745f920ffb191` was imported under web/ in the user's GitHub repository. The concurrently added Python backend and its tests are preserved at the root; they are not connected to the pixel garden. Runtime files and the applied schema migration are unchanged. The latest v0.2 source brief records approved canonical authority for the bounded background milestone, through the owner's `/approved / action` on 4 October 2026. Scheduled execution is confirmed and SSE is deferred. Approval of the brief does not establish background execution.

Fresh TypeScript and production build checks passed. The existing persistence, GIF/renderer and Android-scene verifiers were re-executed and passed; their evidence records retained identical contents. GITHUB_SYNC.md and repository-verification.json record this execution and source-comparison scope. Java/native compilation and physical-device checks were not repeated.

Sites metadata now reports the Site as public with one shared origin and no linked schedules, in contrast to the original private-delivery descriptions above. This GitHub update changes no hosting audience or production data. There is no executed pixel-garden background updater, connected weather integration, separate-user isolation test or 24-hour absence proof. The preserved Python backend has a separate worker/SSE prototype; its presence does not establish this milestone.

The preserved Python backend at commit `d123b97cbf86a1a0d989ccce8a5d6be561f11734` was checked locally with its unchanged runtime/tests: 21 pytest tests and Ruff passed. Its original runtime, Docker/CI configuration and architecture remain unchanged in GitHub; the root README and ignore rules are merged, and the original backend README is archived. This establishes local backend checks, not connection to the pixel garden or a deployed unattended proof.
