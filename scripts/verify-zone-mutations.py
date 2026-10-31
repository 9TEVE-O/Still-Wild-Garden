#!/usr/bin/env python3
"""Five bounded source mutations for the garden memory-scope repair.

Only copies under TemporaryDirectory are mutated. No stored garden or live site is opened.
This is a focused adapter to pytest, not a general-purpose mutation engine.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ("src/stillwild/domain.py", "src/stillwild/engine.py")
TEST_NAMES = (
    "test_explicit_garden_zone_is_rejected",
    "test_blank_zone_is_rejected",
    "test_unzoned_and_named_zone_memories_remain_separate",
)
MUTATIONS = (
    (
        "M01-reserved-zone-bypass", SOURCES[0],
        'if self.zone_id == "garden":', 'if self.zone_id == "Garden":',
        TEST_NAMES[0],
    ),
    (
        "M02-blank-zone-bypass", SOURCES[0],
        "if not self.zone_id.strip():", "if False:",
        TEST_NAMES[1],
    ),
    (
        "M03-unzoned-rejected", SOURCES[0],
        "if self.zone_id is not None:", "if True:",
        TEST_NAMES[2],
    ),
    (
        "M04-named-zone-collapses", SOURCES[1],
        'zone = event.zone_id or "garden"', 'zone = "garden"',
        TEST_NAMES[2],
    ),
    (
        "M05-whole-zone-renamed", SOURCES[1],
        'zone = event.zone_id or "garden"', 'zone = event.zone_id or "global"',
        TEST_NAMES[2],
    ),
)


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test(root: Path) -> dict:
    env = os.environ.copy()
    env["PYTHONPATH"] = str(root / "src") + os.pathsep + env.get("PYTHONPATH", "")
    command = (
        sys.executable, "-m", "pytest", "-q", "tests/test_engine.py",
        "-k", " or ".join(TEST_NAMES),
    )
    try:
        result = subprocess.run(
            command, cwd=root, env=env, capture_output=True, text=True,
            timeout=90, check=False,
        )
        output = result.stdout + "\n" + result.stderr
        return {
            "exit_code": result.returncode,
            "summary": "\n".join(output.splitlines()[-18:])[-2500:],
            "timed_out": False,
        }
    except subprocess.TimeoutExpired:
        return {"exit_code": None, "summary": "timeout", "timed_out": True}


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="zone-mutation-receipt.json")
    args = parser.parse_args()
    output = Path(args.output).resolve()
    before = {path: digest(ROOT / path) for path in SOURCES}
    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
        text=True, check=True,
    ).stdout.strip()
    baseline = test(ROOT)
    mutants = []

    if baseline["exit_code"] != 0:
        raise SystemExit("Baseline targeted tests failed; no mutations executed")

    for name, path, anchor, replacement, failed_test in MUTATIONS:
        with TemporaryDirectory(prefix="stillwild-mutation-") as directory:
            scratch = Path(directory)
            shutil.copytree(ROOT / "src", scratch / "src")
            shutil.copytree(ROOT / "tests", scratch / "tests")
            shutil.copy2(ROOT / "pyproject.toml", scratch / "pyproject.toml")
            target = scratch / path
            original = target.read_text(encoding="utf-8")
            if original.count(anchor) != 1:
                raise SystemExit(f"Mutation {name}: expected exactly one source anchor")
            target.write_text(original.replace(anchor, replacement, 1), encoding="utf-8")
            mutated_sha = digest(target)
            if mutated_sha == before[path]:
                raise SystemExit(f"Mutation {name}: no source change")
            result = test(scratch)
            detected = (
                result["exit_code"] == 1
                and f"FAILED tests/test_engine.py::{failed_test}" in result["summary"]
                and not result["timed_out"]
            )
            mutants.append({
                "id": name,
                "path": path,
                "target_failed_test": failed_test,
                "original_sha256": before[path],
                "mutated_sha256": mutated_sha,
                "exit_code": result["exit_code"],
                "timed_out": result["timed_out"],
                "detected": detected,
                "test_excerpt": result["summary"][-1300:],
            })
            print(f"{name}: {'KILLED' if detected else 'NOT VERIFIED'}")

    after = {path: digest(ROOT / path) for path in SOURCES}
    post_repair = test(ROOT)
    receipt = {
        "schema": "stillwild.zone-mutation-repair/1",
        "source_commit": head,
        "source_sha256_before": before,
        "source_sha256_after": after,
        "baseline": baseline,
        "mutants": mutants,
        "mutant_count": len(mutants),
        "detected_count": sum(int(m["detected"]) for m in mutants),
        "source_restored": before == after,
        "post_repair": post_repair,
        "scope": "isolated source-copy mutation; no deployed garden or database access",
    }
    output.write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    print(f"Receipt: {output}")
    if not (len(mutants) == 5 and all(m["detected"] for m in mutants)
            and before == after and post_repair["exit_code"] == 0):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
