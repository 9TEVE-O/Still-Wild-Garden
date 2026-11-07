# GitHub source synchronisation

Date: 4 October 2026, Australia/Darwin.

Request: update https://github.com/9TEVE-O/Still-Wild-Garden with the current project and revised brief.

## Baseline and import

The target repository initially contained only README.md and .gitignore at commit `26714a4fbd31fec8023f4b22018f167faca79a1b`. The existing Sites checkout was clean at `bcf2d5210282e3683502be5066d745f920ffb191`, matching saved Site version 2 returned by Sites history on this date.

During preparation, the owner uploaded `download.png` in commit `560d190c806120464037eedf5e0abc0a07a55b4d`. The GitHub update builds on that newer tree and preserves the image unchanged (`3455a3c05e1239c3176455b815f0d848166eea3a` Git blob). It does not replace the repository with an older snapshot.

A concurrent task then added the Python agent backend in `d123b97cbf86a1a0d989ccce8a5d6be561f11734`. This sync builds on that commit and preserves all backend runtime files, Docker configuration, tests, CI, architecture and the uploaded image. The root README/ignore rules were merged; the original backend README is retained byte-for-byte in `docs/EXPERIMENTAL_BACKEND_README.md`. The web application is self-contained under `web/`. Both runtimes are separate; this sync implements no connection between them.

The update also preserves merge commit `e3572850912d3d2acca50f1f6a4fd48001d4b831` and its `docs/garden-agent-prompts.md` catalog. This changes no backend runtime files; the 21-test result retains its scope.

164 tracked source/art/build-evidence files were imported under `web/` to keep the concurrently added Python backend intact. The generated `tsconfig.tsbuildinfo` cache was excluded. The original and optimised art, generated offline Android scene, Gradle wrapper, existing development APK and evidence records are retained. No environment files, private signing keys, local database, live garden export, or Sites/GitHub credentials are copied.

The README, agent continuation instructions, project index, checkpoint, hosting description, Android export instructions and ignore rules were reconciled for this GitHub handoff. The v0.1 and v0.2 briefs were added; v0.1 is historical and the latest v0.2 source brief records approved canonical authority for the bounded background milestone. `source-import-manifest.json` records original file digests and identifies the documentation differences.

Within `web/`, application code, database migration, immutable seed behaviour, growth/keeper rules, gift format and companion runtime remain byte-for-byte identical to the imported source. This update is not a Site deployment, weather integration, pixel-garden background updater implementation or 24-hour absence proof. The preserved experimental backend contains its own worker and SSE implementation; those do not establish completion of the approved pixel-garden milestone.

## Authority and observed hosting

- D-01 scheduled execution is a confirmed user requirement.
- D-02 canonical authority is recorded as approved in the latest source brief, through the owner's `/approved / action` on 4 October 2026. The brief changed from draft to approved during this sync. That source record supplies the approval provenance; this GitHub task does not independently execute or validate the background design.
- The fourteen-agent prompt set remains parked. A concurrently merged catalog at docs/garden-agent-prompts.md is preserved as source reference; it is not promoted to governing runtime requirements by this update.
- The first proposed proof uses a saved snapshot with refresh. SSE and WebSockets are deferred.
- Future LLM use and the final provider choice remain undecided.
- Current Sites metadata reports public access, active status, version 2 and `automations: []`. Historical documents describe private hosting. This update records the discrepancy without changing the audience.
- The existing route is a shared origin, not separate personal gardens. Ownership isolation and the absence proof are outstanding release requirements.

## Fresh checks

The following checks executed against the imported working tree on 4 October 2026 with Node 24.19.0 and the pinned pnpm 11.25.0 dependency set. The supported `npm run install:ci` completed successfully with the frozen lockfile; no dependency policy was disabled and no application dependencies were changed.

| Check | Result | What it proves |
|---|---|---|
| TypeScript `tsc --noEmit --incremental false` | PASS | Imported TypeScript compiles without errors |
| `npm run build` | PASS | Vinext/Vite produces Worker, client and SSR output with the `/` and `/api/garden` routes |
| `node scripts/verify-persistence.cjs` | PASS | Actual query/route code, local SQLite migration, idempotent planting, five repeated requests, reopen persistence and invalid-request rejection |
| `node scripts/verify-garden.cjs` | PASS | Actual renderer and codec; 800×320, 60-frame, six-second GIF, 121,484 bytes, independent decode and exact loop closure |
| `node scripts/verify-android.cjs` | PASS | Original identity export, generated scene/art provenance, five-age pixel parity and pause/resume in Node |
| Built local Worker and D1 | PASS | README's local migration succeeds; local HTTP checks return the home page and garden snapshot, preserve repeat planting and reject a wrong-origin POST |
| Source comparison | PASS | Web runtime, migration, art, portable formats, companion code/assets and lockfile equal the cited source; only listed documentation/ignore files differ. Existing Python runtime, tests and deployment configuration retain their Git blob hashes. |
| Preserved Python backend | PASS | 21 pytest tests and Ruff pass on the unchanged backend source; does not establish deployed operation or pixel-garden integration |
| Brief comparison | PASS | The added v0.2 is byte-identical to the latest source brief supplied in this workspace |

Machine-readable results are in `repository-verification.json`. The existing loop, persistence and Android-scene evidence records were reproduced without changing their contents. Historical Java/native build evidence is retained; Java tests, native APK compilation, installation and physical-device acceptance were not re-executed for this import. These results establish the source handoff, not unattended garden execution.
