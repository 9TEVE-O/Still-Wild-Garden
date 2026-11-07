# Stillwild background proof index

1. APP_BRIEF_v0.2.md: approved governing scope and recorded decisions.
2. BACKGROUND_PLAN.md: exact update/read paths, access scope, rule and proof contract.
3. CURRENT_BUILD_STATE.md: current implementation and acceptance limits.
4. background-test-evidence.json: executed local source/SQLite checks.

Code: lib/world.ts and lib/weather.ts own transitions/inputs. db/background.ts owns persistence, commits and snapshots. app/api/background/tick is the private service writer. Snapshot/evidence routes are read-only. app/page.tsx displays stored counts. This repository is a separate test Site with no original origin record.

5. README.md at this app root gives GitHub-copy local instructions. The root repository docs/audits/2026-10-05/ record owns the source import, bounded audit and current native evidence; see CURRENT_BUILD_STATE.md for the pending absence window.
