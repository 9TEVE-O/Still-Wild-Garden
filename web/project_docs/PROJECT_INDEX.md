# Stillwild project index

This index is relative to the web/ application directory. Current checkpoint updated 4 October 2026 for the GitHub source import. The Python backend at the repository root has its own preserved architecture and is not yet connected to this app. The implemented v1 contracts remain applicable to legacy modes; the latest v0.2 source brief records approved canonical authority for the bounded background milestone.

1. CURRENT_BUILD_STATE.md owns current work, evidence status and next action.
2. PRODUCT_AND_CONTRACTS.md owns scope, acceptance, runtime boundaries and seed format.
3. VALIDATION.md owns executed checks and limitations.
4. ../android/README.md owns the bounded Android companion contract, build/use instructions and phone acceptance checks. android/releases/build-evidence.json identifies its built candidate; android-scene-evidence.json identifies shared-renderer verification.
5. Stillwild_App_Brief_and_Background_Data_Plan_v0.2.md records the confirmed scheduling requirement and proposed first proof. D-02 canonical authority is recorded as approved in the latest source brief; SSE is deferred. v0.1 is retained as historical drafting context.
6. GITHUB_SYNC.md and source-import-manifest.json own this import's provenance, observed hosting discrepancy and fresh verification. They do not prove unattended operation.

Implementation: app/page.tsx composes the experience; components/garden-bubble.tsx is the floating view; lib/garden.ts owns growth; lib/render-garden.ts renders; lib/gift.ts and lib/seed-runtime.ts create offline seed files; db/schema.ts and db/garden.ts own cloud persistence; app/api/garden/route.ts is the API.
