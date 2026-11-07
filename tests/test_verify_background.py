import ast
import subprocess
import sys
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[1] / "scripts" / "verify-background.py"


def test_smoke_check_has_no_assert_statements():
    tree = ast.parse(SCRIPT.read_text())
    assert not any(isinstance(node, ast.Assert) for node in ast.walk(tree))


def test_smoke_check_failure_survives_optimized_python():
    result = subprocess.run(
        [
            sys.executable,
            "-O",
            "-c",
            (
                "import runpy; "
                "runpy.run_path(__import__('sys').argv[1])['require'](False, 'sentinel')"
            ),
            str(SCRIPT),
        ],
        capture_output=True,
        text=True,
        check=False,
    )

    assert result.returncode != 0
    assert "background smoke check failed: sentinel" in result.stderr
    assert '"status": "passed"' not in result.stdout
