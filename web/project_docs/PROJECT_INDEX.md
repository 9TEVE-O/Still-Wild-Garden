# Stillwild project index

This index is relative to the web/ application directory. Current checkpoint updated 13 October 2026 to record the INCONCLUSIVE original absence review. The Python backend at the repository root and the isolated background-proof/ app have their own boundaries and are not connected to this legacy app. The implemented v1 contracts remain applicable to legacy modes; the latest v0.2 source brief records approved canonical authority for the bounded background milestone.

1. CURRENT_BUILD_STATE.md owns current work, evidence status and next action.
2. PRODUCT_AND_CONTRACTS.md owns scope, acceptance, runtime boundaries and seed format.
3. OBSERVATION_INVARIANT.md owns the owner-approved, canonical, frozen observation contract: viewing may reconstruct the garden but cannot create or alter persistent world state.
4. VALIDATION.md owns executed checks and limitations.
5. ../android/README.md owns the bounded Android companion contract, build/use instructions and phone acceptance checks. android/releases/build-evidence.json identifies its built candidate; android-scene-evidence.json identifies shared-renderer verification.
6. Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md records the confirmed scheduling requirement and proposed first proof. D-02 canonical authority is recorded as approved in the latest source brief; SSE is deferred. v0.1 is retained as historical drafting context.
7. GITHUB_SYNC.md and source-import-manifest.json own this import's provenance, observed hosting discrepancy and fresh verification. They do not prove unattended operation.

Implementation: app/page.tsx composes the experience; components/garden-bubble.tsx is the floating view; lib/garden.ts owns growth; lib/render-garden.ts is the version 1 renderer kept for gifts and Android; lib/render-world.ts renders the live view with lib/growth.ts and the generated lib/growth-atlas.ts (source in design-assets/growth/); lib/gift.ts and lib/seed-runtime.ts create offline seed files; db/schema.ts and db/garden.ts own cloud persistence; app/api/garden/route.ts is the API.

8. The root docs/audits/2026-10-05/ report and background-proof/ source record the isolated implementation and observed progress. The original 24-hour absence review is INCONCLUSIVE; background-proof/project_docs/CURRENT_BUILD_STATE.md owns current proof status.

9. DEPTH_DESIGN_ACCEPTANCE_2026-10-17.md records the scoped PR #19 visual preservation rules, layer map, camera remediation, source-backed findings and remaining mobile/browser acceptance requirements. It does not supersede the frozen Observation Invariant or background milestone.
