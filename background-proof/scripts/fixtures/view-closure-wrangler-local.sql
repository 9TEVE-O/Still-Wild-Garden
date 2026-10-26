-- Isolated local D1 / Wrangler fixture. Never execute against a managed Site or remote D1.
-- Uses the actual 0000/0001/0002 migrations and an ephemeral --persist-to directory.
-- These assertions test row ordering and fail-closed SQL conditions, NOT hosted D1 atomic batch semantics.

CREATE TABLE d1_assertions (
  name TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);

INSERT INTO worlds (id, seed, born_at, rules_version, climate, state, revision, last_tick, updated_at)
VALUES ('darwin-proof-001', 73, 100, 2, 'darwin', '{"plants":1}', 6, 5, 100);

-- Keep the original proof record unchanged throughout this fixture.
INSERT INTO proof_baseline (id, garden_id, started_at, revision, state)
VALUES ('absence-check-001', 'darwin-proof-001', 500, 0, '{"plants":1}');

-- A silent/unclosed view must block the checkpoint regardless of heartbeat age.
INSERT INTO view_sessions (id, opened_at, last_seen_at, closed_at)
VALUES ('stale', 1, 5, NULL);
INSERT INTO proof_baseline (id, garden_id, started_at, revision, state)
SELECT 'absence-check-002', id, 2000, revision, state
FROM worlds WHERE id = 'darwin-proof-001'
AND NOT EXISTS (SELECT 1 FROM view_sessions WHERE closed_at IS NULL)
ON CONFLICT(id) DO NOTHING;
INSERT INTO d1_assertions
SELECT 'stale view blocks checkpoint', COUNT(*) = 0
FROM proof_baseline WHERE id = 'absence-check-002';

-- Close and log the pre-checkpoint view at the SAME millisecond as checkpoint time.
UPDATE view_sessions SET closed_at = 2000, last_seen_at = 2000 WHERE id = 'stale';
INSERT INTO view_events (id, session_id, event_type, occurred_at)
VALUES ('pre:close', 'stale', 'close', 2000);

-- Mirror the production conditional checkpoint, gate and marker writes.
INSERT INTO proof_baseline (id, garden_id, started_at, revision, state)
SELECT 'absence-check-002', id, 2000, revision, state
FROM worlds WHERE id = 'darwin-proof-001'
AND NOT EXISTS (SELECT 1 FROM view_sessions WHERE closed_at IS NULL)
ON CONFLICT(id) DO NOTHING;
INSERT INTO proof_view_gate (checkpoint_id, owner_attested_at, active_sessions_at_start, protocol_version)
SELECT 'absence-check-002', 2000,
 (SELECT COUNT(*) FROM view_sessions WHERE closed_at IS NULL), 'stillwild-view-v2'
WHERE EXISTS (SELECT 1 FROM proof_baseline WHERE id = 'absence-check-002' AND started_at = 2000)
ON CONFLICT(checkpoint_id) DO NOTHING;
INSERT INTO view_events (id, session_id, event_type, occurred_at)
SELECT 'view:checkpoint:absence-check-002', NULL, 'checkpoint', 2000
WHERE EXISTS (SELECT 1 FROM proof_view_gate WHERE checkpoint_id = 'absence-check-002' AND owner_attested_at = 2000)
ON CONFLICT(id) DO NOTHING;

INSERT INTO d1_assertions
SELECT 'checkpoint and gate written after closure',
 COUNT(*) = 1 AND (SELECT active_sessions_at_start FROM proof_view_gate WHERE checkpoint_id = 'absence-check-002') = 0
FROM proof_baseline WHERE id = 'absence-check-002';
INSERT INTO d1_assertions
SELECT 'same millisecond pre-checkpoint close excluded',
 (SELECT rowid FROM view_events WHERE id = 'pre:close') <
 (SELECT rowid FROM view_events WHERE id = 'view:checkpoint:absence-check-002');
INSERT INTO d1_assertions
SELECT 'no in-window close before post-marker activity',
 COUNT(*) = 0
FROM view_events
WHERE rowid > (SELECT rowid FROM view_events WHERE id = 'view:checkpoint:absence-check-002')
  AND occurred_at < 2000 + 86400000 AND event_type = 'close';

-- A request carrying a pre-checkpoint timestamp but inserted afterwards MUST count.
INSERT INTO view_sessions (id, opened_at, last_seen_at, closed_at)
VALUES ('delayed', 1999, 1999, NULL);
INSERT INTO view_events (id, session_id, event_type, occurred_at)
VALUES ('delayed:open', 'delayed', 'open', 1999);
INSERT INTO d1_assertions
SELECT 'delayed earlier-timestamp event counted by rowid',
 COUNT(*) = 1
FROM view_events WHERE rowid >
 (SELECT rowid FROM view_events WHERE id = 'view:checkpoint:absence-check-002')
 AND occurred_at < 2000 + 86400000 AND event_type = 'open';

-- A second close after the marker must not reuse the pre-checkpoint event ID.
UPDATE view_sessions SET last_seen_at = 2100 WHERE id = 'stale';
INSERT INTO view_events (id, session_id, event_type, occurred_at)
VALUES ('post:close:distinct', 'stale', 'close', 2100);
INSERT INTO d1_assertions
SELECT 'repeated close recorded after checkpoint',
 COUNT(*) = 1
FROM view_events WHERE rowid >
 (SELECT rowid FROM view_events WHERE id = 'view:checkpoint:absence-check-002')
 AND session_id = 'stale' AND event_type = 'close'
 AND occurred_at < 2000 + 86400000;
INSERT INTO d1_assertions
SELECT 'in-window view evidence invalidates closure',
 (SELECT COUNT(*) FROM view_events WHERE rowid >
  (SELECT rowid FROM view_events WHERE id = 'view:checkpoint:absence-check-002')
  AND occurred_at < 2000 + 86400000
  AND event_type IN ('open','snapshot_read','heartbeat','close')) = 2;

-- Absent marker cannot be treated as complete view instrumentation.
INSERT INTO d1_assertions
SELECT 'missing marker cannot supply rowid',
 (SELECT rowid FROM view_events WHERE id = 'view:checkpoint:missing') IS NULL;
INSERT INTO d1_assertions
SELECT 'original checkpoint remains immutable',
 started_at = 500 AND revision = 0 AND state = '{"plants":1}'
FROM proof_baseline WHERE id = 'absence-check-001';

SELECT 'WRANGLER_LOCAL_D1_VIEW_CLOSURE_PASS' AS status, COUNT(*) AS checks
FROM d1_assertions;
