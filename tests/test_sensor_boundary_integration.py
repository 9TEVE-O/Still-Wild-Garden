from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

import pytest

ROOT = Path(__file__).resolve().parents[1]
OPERATOR_TOKEN = "integration-operator-" + "o" * 32
TASK_TOKEN = "integration-task-" + "t" * 32
SENSOR_TOKEN = "integration-sensor-" + "s" * 32


def _post(path: str, payload: dict, token: str) -> dict:
    request = Request(
        f"http://127.0.0.1:8000{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {token}",
            "content-type": "application/json",
        },
        method="POST",
    )
    with urlopen(request, timeout=5) as response:  # noqa: S310 - disposable localhost server
        return json.loads(response.read().decode("utf-8"))


def _wait_for_api() -> None:
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        try:
            with urlopen("http://127.0.0.1:8000/health", timeout=1):
                return
        except (OSError, URLError):
            time.sleep(0.1)
    raise AssertionError("disposable Stillwild API did not become ready")


def test_compose_forwards_sensor_token_when_rendered():
    if shutil.which("docker") is None:
        pytest.skip("docker CLI unavailable")

    env = os.environ.copy()
    env.update(
        {
            "STILLWILD_OPERATOR_TOKEN": OPERATOR_TOKEN,
            "STILLWILD_TASK_TOKEN": TASK_TOKEN,
            "STILLWILD_SENSOR_TOKEN": SENSOR_TOKEN,
        }
    )
    result = subprocess.run(
        ["docker", "compose", "config", "--format", "json"],
        cwd=ROOT,
        env=env,
        capture_output=True,
        text=True,
        timeout=30,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    rendered = json.loads(result.stdout)
    api_environment = rendered["services"]["api"]["environment"]
    assert api_environment["STILLWILD_SENSOR_TOKEN"] == SENSOR_TOKEN


def test_documented_sensor_curl_executes_against_disposable_api(tmp_path):
    if shutil.which("curl") is None or shutil.which("bash") is None:
        pytest.skip("curl and bash are required for literal README command verification")

    env = os.environ.copy()
    env.update(
        {
            "STILLWILD_DB_PATH": str(tmp_path / "sensor-curl.db"),
            "STILLWILD_OPERATOR_TOKEN": OPERATOR_TOKEN,
            "STILLWILD_TASK_TOKEN": TASK_TOKEN,
            "STILLWILD_SENSOR_TOKEN": SENSOR_TOKEN,
        }
    )
    server = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "stillwild.api:app",
            "--host",
            "127.0.0.1",
            "--port",
            "8000",
        ],
        cwd=ROOT,
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        _wait_for_api()
        _post(
            "/real/gardens",
            {
                "id": "darwin-test",
                "name": "Disposable integration garden",
                "latitude": -12.4634,
                "longitude": 130.8456,
            },
            OPERATOR_TOKEN,
        )
        _post(
            "/real/sensors",
            {
                "id": "soil-1",
                "garden_id": "darwin-test",
                "kind": "soil_moisture",
                "unit": "%",
                "source": "disposable-curl-fixture",
            },
            OPERATOR_TOKEN,
        )

        readme = (ROOT / "docs" / "EXPERIMENTAL_BACKEND_README.md").read_text(encoding="utf-8")
        section = readme.split("## Connect a physical sensor or gateway", 1)[1]
        command = section.split("```bash", 1)[1].split("```", 1)[0].strip()
        result = subprocess.run(
            ["bash", "-lc", command],
            cwd=ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )

        assert result.returncode == 0, result.stderr
        receipt = json.loads(result.stdout)
        assert receipt["event"]["payload"]["sensor_id"] == "soil-1"
        assert receipt["event"]["id"]
        assert receipt["event"]["seq"] >= 1
    finally:
        server.terminate()
        try:
            server.wait(timeout=5)
        except subprocess.TimeoutExpired:
            server.kill()
            server.wait(timeout=5)
