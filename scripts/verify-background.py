"""Short, isolated process smoke check. This is never the 24-hour hosted absence proof."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import secrets
import socket
import sqlite3
import subprocess
import sys
import time
from datetime import UTC, datetime
from pathlib import Path
from tempfile import TemporaryDirectory

import httpx


def utc_now() -> str:
    return datetime.now(UTC).isoformat()


def state_evidence(db_path: Path) -> dict:
    with sqlite3.connect(db_path) as conn:
        encoded = conn.execute("SELECT state_json FROM worlds WHERE name='wild'").fetchone()[0]
        state = json.loads(encoded)
        ticks = conn.execute(
            "SELECT run_id,slot_end_ms,committed_at FROM background_ticks ORDER BY slot_end_ms",
        ).fetchall()
        events = conn.execute("SELECT count(*) FROM events").fetchone()[0]
    return {"day": state["day"], "revision": state["revision"], "seed": state["seed"],
            "world_sha256": hashlib.sha256(encoded.encode()).hexdigest(),
            "event_count": events,
            "ticks": [{"run_id": r[0], "slot_end_ms": r[1], "committed_at": r[2]} for r in ticks]}


def stop(process: subprocess.Popen) -> None:
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def verify(seconds: float = 3) -> dict:
    with TemporaryDirectory(prefix="stillwild-process-proof-") as directory:
        root = Path(directory)
        db_path = root / "isolated.db"
        env = {**os.environ,
               "STILLWILD_DB_PATH": str(db_path), "STILLWILD_WILD_SIM": "true",
               "STILLWILD_WILD_SEED": "7", "STILLWILD_TICK_SECONDS": "1",
               "STILLWILD_CATCH_UP_LIMIT": "2", "STILLWILD_WILD_DAYS_PER_TICK": "1",
               "STILLWILD_AUTOMATION_AUTHORITY": "false",
               "STILLWILD_TASK_TOKEN": secrets.token_urlsafe(32),
               "STILLWILD_OPERATOR_TOKEN": secrets.token_urlsafe(32)}
        started_at = utc_now()
        with (root / "worker.log").open("w") as output:
            worker = subprocess.Popen(
                [sys.executable, "-m", "stillwild.worker"], env=env,
                stdout=output, stderr=subprocess.STDOUT,
            )
            try:
                time.sleep(seconds)  # Deliberately short and bounded, no API process or viewers.
                assert worker.poll() is None, "worker exited before the observation window ended"
            finally:
                stop(worker)
        stopped_at = utc_now()
        before = state_evidence(db_path)
        assert before["day"] >= 2 and before["day"] == len(before["ticks"])
        log = (root / "worker.log").read_text()
        assert all(tick["run_id"] in log for tick in before["ticks"])
        with socket.socket() as listener:
            listener.bind(("127.0.0.1", 0))
            port = listener.getsockname()[1]
        with (root / "api.log").open("w") as output:
            server = subprocess.Popen(
                [sys.executable, "-m", "uvicorn", "stillwild.api:app",
                 "--host", "127.0.0.1", "--port", str(port)],
                env=env, stdout=output, stderr=subprocess.STDOUT,
            )
            try:
                with httpx.Client(
                    base_url=f"http://127.0.0.1:{port}", timeout=1, trust_env=False,
                ) as client:
                    deadline = time.monotonic() + 10
                    while True:
                        try:
                            if client.get("/health").status_code == 200:
                                break
                        except httpx.TransportError:
                            pass
                        assert time.monotonic() < deadline, "API failed to start"
                        time.sleep(0.1)
                    first_return_at = utc_now()
                    response = client.get("/wild")
                    assert response.status_code == 200
                    returned = response.json()
                    assert returned["day"] == before["day"]
                    assert returned["revision"] == before["revision"]
                    anonymous = client.post("/tasks/tick").status_code
                    assert anonymous == 401
                    assert state_evidence(db_path) == before
            finally:
                stop(server)
        assert all(tick["committed_at"] < first_return_at for tick in before["ticks"])
        return {
            "check": "isolated-local-process-smoke-v1", "status": "passed",
            "scope": "Short local simulated progression before first return; not 24-hour or hosted proof",
            "requested_no_view_seconds": seconds, "tick_seconds": 1,
            "worker_started_at": started_at, "worker_stopped_at": stopped_at,
            "first_return_at": first_return_at,
            "pre_return": before, "read_changed_state": False,
            "anonymous_tick_status": anonymous, "worker_log": log,
        }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--seconds", type=float, default=3)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    if not 3 <= args.seconds <= 30:
        parser.error("--seconds must be between 3 and 30")
    report = verify(args.seconds)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(json.dumps(report, indent=2) + "\n")
    print(json.dumps({key: report[key] for key in (
        "status", "scope", "requested_no_view_seconds", "anonymous_tick_status", "read_changed_state",
    )}))


if __name__ == "__main__":
    main()
