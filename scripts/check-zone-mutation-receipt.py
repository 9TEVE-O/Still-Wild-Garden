"""Independently check mutation receipts against the unmodified checkout."""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = {
    "M01-reserved-zone-bypass": (
        "src/stillwild/domain.py", "test_explicit_garden_zone_is_rejected",
    ),
    "M02-blank-zone-bypass": (
        "src/stillwild/domain.py", "test_blank_zone_is_rejected",
    ),
    "M03-unzoned-rejected": (
        "src/stillwild/domain.py", "test_unzoned_and_named_zone_memories_remain_separate",
    ),
    "M04-named-zone-collapses": (
        "src/stillwild/engine.py", "test_unzoned_and_named_zone_memories_remain_separate",
    ),
    "M05-whole-zone-renamed": (
        "src/stillwild/engine.py", "test_unzoned_and_named_zone_memories_remain_separate",
    ),
}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()
    receipt = json.loads(Path(args.receipt).read_text(encoding="utf-8"))
    require(receipt.get("schema") == "stillwild.zone-mutation-repair/1", "wrong schema")

    head = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=ROOT, capture_output=True,
        text=True, check=True,
    ).stdout.strip()
    require(receipt["source_commit"] == head, "source revision mismatch")

    paths = {item[0] for item in EXPECTED.values()}
    actual = {
        path: hashlib.sha256((ROOT / path).read_bytes()).hexdigest()
        for path in paths
    }
    require(receipt["source_sha256_before"] == actual, "source not pinned to checkout")
    require(receipt["source_sha256_after"] == actual, "source not restored")
    require(receipt["source_restored"] is True, "source restoration not asserted")

    for label in ("baseline", "post_repair"):
        run = receipt[label]
        require(run["exit_code"] == 0 and not run["timed_out"], f"{label} did not pass")
        require(
            re.search(r"\b[1-9][0-9]* passed\b", run["summary"]) is not None,
            f"{label} has no test-pass summary",
        )

    mutants = receipt["mutants"]
    require(len(mutants) == 5 and receipt["mutant_count"] == 5, "expected five runs")
    require({item["id"] for item in mutants} == set(EXPECTED), "wrong mutant identities")
    require(receipt["detected_count"] == 5, "mutant kill count incorrect")
    for mutant in mutants:
        path, test = EXPECTED[mutant["id"]]
        require(mutant["path"] == path, "wrong mutation path")
        require(mutant["target_failed_test"] == test, "wrong expected failure")
        require(mutant["original_sha256"] == actual[path], "wrong original hash")
        require(mutant["mutated_sha256"] != actual[path], "mutation did not change code")
        require(mutant["exit_code"] == 1 and not mutant["timed_out"], "no valid failure")
        require(mutant["detected"] is True, "mutation escaped")
        require(
            f"FAILED tests/test_engine.py::{test}" in mutant["test_excerpt"],
            "missing test-specific mutant failure evidence",
        )

    print(f"INDEPENDENT VERIFICATION PASS: {len(mutants)}/5 mutants killed; "
          "baseline and post-repair tests pass; pinned source unchanged")


if __name__ == "__main__":
    main()
