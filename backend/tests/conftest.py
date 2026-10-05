import os

import pytest
from pydantic_ai import models

os.environ["PYDANTIC_AI_NO_BANNER"] = "1"


@pytest.fixture(autouse=True)
def no_paid_calls(monkeypatch):
    monkeypatch.setattr(models, "ALLOW_MODEL_REQUESTS", False)
    monkeypatch.delenv("MINDLAB_ENABLE_REMOTE", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("MINDLAB_OPENAI_MODEL", raising=False)
