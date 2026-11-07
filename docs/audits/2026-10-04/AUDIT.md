# Still Wild Garden audit and continuation

Review context: **SAME_CONTEXT_ADVISORY**. Make AI do Good and Project Auditor were applied
sequentially in this working context. This is not an independent review.

Audit status: **COMPLETE for the declared scope**. The approved pixel-garden milestone and
multi-user release remain incomplete. Completion here describes the audit, not the project.

Starting revision: `edd4fec25c6835fe305a3896d3391fa039ea48b5`.
Rechecked implementation: `31af17f7711224219d0378c99f9068f4570ab339`.
The [source manifest](source-manifest.json) binds the checked code, configuration and tests.
Canonical audit state: [project-auditor/audit-case](../../project-auditor/audit-case.json).

## Basis and coverage

The owner-approved v0.2 brief governs the bounded background pixel-garden milestone.
Root/web AGENTS preserve `origin`, legacy v1 gifts, the Android candidate and the separation
between the published Site and the Python backend. Backend architecture defines the
experimental Wild. The fourteen-agent prompt catalog remains a parked reference.

Source, requirements and runtime evidence were assessed separately. The baseline ran
56 pytest cases and Ruff successfully; its matching GitHub workflow also
[succeeded](https://github.com/9TEVE-O/Still-Wild-Garden/actions/runs/37196900998).
That workflow belongs to the starting revision, not this change's PR head.

The focused review covered mutation authority, scheduled execution/recovery, simulated
evidence separation, agent duties, outcome/candidate boundaries and read-only returns.
Live Site state, Android phone acceptance, scientific calibration and visual-export repair
were not verified in this audit. Historical web checks are not refreshed by backend tests.

## Findings and targeted recheck

| ID | Severity | Finding | Current state |
|---|---|---|---|
| F01 | Material | Backend writes accepted anonymous requests | Resolved within the Python prototype: separate task/operator keys and no-key rejection |
| F02 | Material | Retried cron advanced simulation again; worker/cron lacked shared slot identity | Resolved within the prototype: UTC slot transaction, pinned configuration, bounded catch-up and receipts |
| F03 | Material | Darwin input archive, pixel-keeper consequences and pixel snapshot adapter absent | Open; the Wild is a separate modeled ecosystem |
| F04 | Material | Hosted 24-hour absence acceptance has not executed | Open; local three-second evidence cannot establish it |
| F05 | Material | Separate authenticated owners and cross-garden rejection absent | Open before a multi-user promise; service credentials are not ownership |
| F06 | Minor | Root README retained the historical 21-test backend count | Resolved; new checks are bound to the current implementation |
| F07 | Minor | Agent score window argument is unused; SQL aggregates all scored advice | Open before replay/promotion design; current scores are contribution measures |
| F08 | Minor | Dashboard world, event cursor and agent summaries use separate read queries | Open before coherent active-update snapshot acceptance; read-only behavior is verified |

The baseline defect was reproduced on disposable storage: two anonymous `POST /tasks/tick`
calls returned HTTP 200 and advanced from Day 1 to Day 2. A snapshot read did not mutate
that world. F01/F02 were then handed from review into the authorised implementation step.
No source was silently repaired while judging the baseline.

The recheck covered F01/F02/F06 and the shared transaction dependencies. F03/F04/F05 are
unaffected by this backend slice. F07/F08 remain explicit limitations. No overall `ready`
or `validated` flag is asserted.

## Implemented slice

Scheduler and operator bearer keys have distinct scopes. Empty, short or shared keys disable
HTTP writes. Docker binds the API to localhost. The optional dashboard's manual advances
request an operator token per action without retaining it in browser storage.

Worker and cron share completed UTC slot identities. The initial call establishes a baseline;
later calls catch up from a persisted cursor in bounded batches. Simulation days, events,
outcomes, candidate records, slot markers and the completed receipt share one transaction.
Retries report a duplicate. Failed batches roll back. Interrupted attempts are separate
from successful receipts. Configuration cannot silently change a pinned interval or seed.

Existing rule-based agents continue observing and proposing. Evolution produces candidates,
not promoted rules. No LLM, physical actuator or Darwin weather adapter is introduced.

See [the operating contract](../../BACKGROUND_FOUNDATION.md) for routes, credentials, agent
duties, local commands and failure behavior. Web runtime code and assets are unchanged;
no production garden write, Site publish or audience change was performed.

## Executed evidence

[Validation details](validation.json) record the exact runtime versions and limitations.

| Check | Result | What it establishes |
|---|---|---|
| Pytest | 80 passed | Scoped auth, concurrent slot calls, bounded catch-up, restart, rollback, lease conflict, read-only return and existing backend behavior |
| Ruff | Passed | Source, tests and process verifier satisfy lint checks |
| Separate worker/API smoke | Passed | Saved simulated state existed before a short local return and that read did not alter it |
| Dashboard JavaScript syntax | Passed | Syntax only; visual/browser interaction acceptance is not established |
| Python wheel | Built; background module and dashboard included | Packaging only; no installed Docker/host claim |
| Diff check | Passed | Whitespace only |

The [process evidence](local-process-smoke.json) records a three-second no-view window.
The worker committed three simulated days/slots and revision 4, then stopped before the API
started. Its first return exposed the already saved revision; an anonymous task returned
401; the stored state hash, events and slots were unchanged by these reads/rejected writes.
Worker stdout corroborates run IDs on the same local host. This is accelerated simulation,
not three days of actual unattended operation, and not independent host corroboration.

CI now repeats the short process check and uploads its receipt. CI success must be matched
to the actual PR head after publication; the old workflow result is not carried forward.

## Continuation

Next bounded build: implement the isolated Darwin environment/keeper-state adapter under
the approved v0.2 brief. Pin each historical input interval, save meaningful keeper events,
and expose them through a read-only pixel snapshot with modest refresh. Preserve `origin`
and portable v1 behavior. Hosting/authentication must be selected and demonstrated before
running the 24-hour absence procedure.

Separate-user isolation precedes a multi-user release. Agent replay/trial/promotion follows
explicit scoring rules and evidence; the parked prompts do not silently gain authority.

Technical references checked during implementation:
[FastAPI security tools](https://fastapi.tiangolo.com/reference/security/) and
[SQLite transactions](https://www.sqlite.org/lang_transaction.html). These references explain
mechanisms; they do not supply Stillwild execution evidence.
