from dataclasses import replace

import pytest

from stillwild import api

OPERATOR_TOKEN = "test-operator-" + "o" * 32
TASK_TOKEN = "test-scheduler-" + "t" * 32
OPERATOR_HEADERS = {"Authorization": f"Bearer {OPERATOR_TOKEN}"}
TASK_HEADERS = {"Authorization": f"Bearer {TASK_TOKEN}"}


@pytest.fixture(autouse=True)
def configured_test_tokens(monkeypatch):
    """Use non-secret fixtures; individual authorization tests explicitly remove them."""
    monkeypatch.setattr(api, "settings", replace(
        api.settings, operator_token=OPERATOR_TOKEN, task_token=TASK_TOKEN,
    ))
