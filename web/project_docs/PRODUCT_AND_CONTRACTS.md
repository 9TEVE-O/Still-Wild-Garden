# Stillwild web experience v0.1

Current observation, 4 October 2026: the source below implements v1 age-based growth; Sites metadata now reports public access and the route uses one shared origin, with no separate visitor ownership. References below to owner-private hosting describe the original delivery, not verified current access. This GitHub sync changes no runtime or audience. The latest v0.2 background brief records approved canonical authority for the bounded scheduled-garden milestone. Approval is recorded in that source brief; background implementation and its absence proof are still outstanding. This implemented v1 contract continues to govern the original garden and portable modes.

User: Steven Lees. Original delivery: private Sites garden with a modular movable web layer. On 28 September 2026 the owner confirmed website bubble operation and requested a bounded Android companion preserving the garden, floating across apps, with dismiss controls and an ongoing notification. Native source and a development APK are candidate work under that request. Independent native foundation closure and phone permission/runtime acceptance remain unexecuted.

## Behaviour and acceptance

| Requirement | Acceptance | Verification |
|---|---|---|
| R1 One small beginning | Plant creates one immutable garden seed; repeats return the same seed and birth time | Local API create/repeat/read, invalid mutation rejection |
| R2 Growth without tending | Age-based v1 rules reconstruct progress; keepers and plants stay within the scene; no prune/reset/speed controls | Growth/time fixtures, renderer inspection |
| R3 Durable garden | D1 holds the seed and birth time across sessions; failures show a retryable unavailable state | Migration and local runtime read/write checks |
| R4 A gift is a new beginning | Self-contained HTML contains child seed, parent lineage and embedded images; no account IDs, credentials, network access or public link; cancellation does not report delivery | Offline runtime syntax/fixture, source inspection; device sharing still needs device verification |
| R5 Adaptable viewing | Responsive canvas, reduced-motion support, ambient view, PNG wallpaper export | Build/source inspection; phone/browser UX not yet device-verified |
| R7 Small motion export | Export a six-second, 10 fps GIF below 2,000,000 measured bytes; fixed global palette, sparse transparent delta rectangles, periodic endpoint | Actual renderer/encoder and independent GIF decoder: loop-evidence.json |
| R6 Modular floating layer | Drag/snap bubble, keyboard arrow movement, tap expansion, shared sound/keeper/gift actions and full-world return | Source/type/build checks; pointer/keyboard browser QA unexecuted |

## Runtime and state

Vinext/React site served by a Cloudflare Worker. Originally delivered owner-private; Sites metadata observed on 4 October 2026 reports public access. The runtime has one shared `origin` garden and no separate-user ownership model. GET /api/garden is read-only and no-store. POST /api/garden accepts only same-origin JSON `{}` and atomically creates `origin` with ON CONFLICT DO NOTHING. No mutation or deletion endpoint exists.

D1 row: id='origin', uint32 seed, born_at UTC epoch milliseconds, version=1. The generated additive schema migration owns creation. No runtime schema mutation. SQLite can retain the row independently of browser sessions. UI-only bubble position uses localStorage; it is not authoritative garden state.

Keepers are deterministic visual simulation agents, not LLM calls. Growth is reconstructed from the saved birth time, not continuously executed while the page is closed. No external tools, web access, autonomous spending or real-world actions are available to them. Render work is capped and suspended while hidden. The logical history grows; only up to 45 additional plants are visible as the scene renews.

## Seed file contract v1

An offline .html file embeds a JSON record with version, seed, bornAt, parentSeed and parentBornAt, art data URLs and a closure-free renderer. It starts aging when the gift is prepared. It contains no hosted URL or user/account identity. The file is the durable copy: deleting it loses that gift unless backed up. The embedded CSP blocks network access. Descendant gifts generate fresh randomness and preserve their immediate parent's lineage. Offline runtime uses the recipient's clock; clock manipulation is not prevented.

Web Share is feature-detected and called from an explicit tap. If file sharing is unavailable, download and let the user share from Files. The web cannot enforce AirDrop/Quick Share exclusivity, confirm receipt, run local HTML in every mobile preview, or guarantee future compatibility. No share operation is triggered by the assistant.

## Android companion boundary (development candidate)

Website Bubble mode continues to float inside the web document. The requested Android companion lives in android/ and uses an installed, user-started TYPE_APPLICATION_OVERLAY with SYSTEM_ALERT_WINDOW permission and a specialUse foreground service. Its scope, lifecycle, device tests and limitations are owned by android/README.md. This is a bounded candidate, not an independently closed native production foundation. System-wide operation has not been observed on a phone.

The new personal export format is `{format: "stillwild-garden", formatVersion: 1, garden: {version: 1, seed, bornAt}}`. It is separate from v1 descendant HTML gifts and contains no credentials, hosted URL, account identifier, executable content or random replacement seed. The Android reader bounds the file to 4096 bytes, checks the marker and both versions, rejects unsupported fields/types/ranges, and refuses to replace a different saved seed/birth time. Importing the same record is idempotent. The website's database/API are unchanged; Android has no network access to them. The native scene is generated directly from lib/garden.ts and lib/render-garden.ts and includes source/art digests to detect drift. Both views follow the same elapsed-time rules; the native view relies on the phone clock.

A true live wallpaper would require a separate WallpaperService and is outside this milestone, as are iOS overlays, sound/gifting modules in the native panel, true agent services, store release and lifetime hosting guarantees. iOS compatibility is not inferred from Android source or compilation.

## Sources inspected on 2026-09-26

- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/share
- https://developer.mozilla.org/en-US/docs/Web/API/Navigator/canShare
- https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation
- https://developer.android.com/reference/android/view/WindowManager.LayoutParams
- https://developer.android.com/reference/android/Manifest.permission
- https://developer.android.com/reference/android/service/wallpaper/package-summary
- https://developer.apple.com/documentation/WidgetKit

## Sparse motion export

The landscape remains fixed. Local keepers, work particles and water highlights use periodic phases. A fixed 128-colour global palette and stable RGB555 lookup avoid frame-dependent palette jitter. The encoder records the first frame opaque, then changed subrectangles with transparent unchanged indices and disposal=1. It samples 60 frames over six seconds without duplicating the endpoint. Exports are measured before download is offered; if required, resolution falls from 800×320 to 640×256, then 480×192. Files at or above 2,000,000 bytes are rejected. This target applies to exported GIFs; downloaded seeds are self-contained HTML packages.

Actual visual assets are retained in design-assets; web PNGs are palette-optimised with no dithering. The cloud scene and portable scene retain generated original visual lineage. GIF encoding is a browser capability; device-level wallpaper installation is not inferred from a successful export.
