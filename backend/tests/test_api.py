import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from workbench.api import create_app
from workbench.protocol import EXAMPLE
from workbench.store import TERMINAL


def wait(client, run_id):
    for _ in range(250):
        run = client.get(f"/api/runs/{run_id}").json()
        if run["status"] in TERMINAL:
            return run
        time.sleep(0.02)
    raise AssertionError("Run did not finish")


def test_api_complete_workflow_and_restart(tmp_path):
    path = tmp_path / "api.sqlite3"
    with TestClient(create_app(path)) as client:
        assert client.get("/api/health").json()["remote_available"] is False
        example = client.get("/api/example").json()
        study = client.post("/api/studies", json=example).json()
        view = client.post("/api/preview", json={"study": example}).json()
        assert view["initial"]
        launch = client.post(
            "/api/runs",
            json={"study_id": study["id"], "revision": 1, "settings": {"pairs": 1, "fixture_delay_ms": 0}},
        )
        assert launch.status_code == 202
        run_id = launch.json()["id"]
        run = wait(client, run_id)
        assert run["status"] == "completed"
        for kind in ("json", "sessions.csv", "attempts.csv"):
            download = client.get(f"/api/runs/{run_id}/export/{kind}")
            assert download.status_code == 200
            assert "attachment" in download.headers["content-disposition"]
        assert client.get(f"/api/runs/{run_id}/export/json").json() == run
        assert (
            client.put(f"/api/studies/{study['id']}", json=example | {"title": "Edited study"}).json()[
                "revision"
            ]
            == 2
        )
        assert client.get(f"/api/studies/{study['id']}?revision=1").json()["study"] == example
    with TestClient(create_app(path)) as client:
        assert client.get(f"/api/runs/{run_id}").json() == run


def test_invalid_busy_cancellation_remote_and_browser_boundaries(tmp_path):
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        assert client.get("/api/runs/missing").status_code == 404
        assert client.post("/api/studies", json={}).status_code == 422
        assert (
            client.post(
                "/api/studies", json=EXAMPLE.model_dump(), headers={"origin": "https://evil.example"}
            ).status_code
            == 403
        )
        assert client.post("/api/studies", content="{}").status_code == 415
        assert client.get("/api/health", headers={"host": "evil.example"}).status_code == 400
        study = client.post("/api/studies", json=EXAMPLE.model_dump()).json()
        body = {"study_id": study["id"], "revision": 1, "settings": {"source": "openai"}}
        assert client.post("/api/runs", json=body).status_code == 422
        body["settings"] = {"fixture": "stall", "pairs": 1}
        run_id = client.post("/api/runs", json=body).json()["id"]
        assert client.post("/api/runs", json=body).status_code == 409
        assert client.post(f"/api/runs/{run_id}/cancel", json={}).status_code == 200
        assert wait(client, run_id)["status"] == "cancelled"


def test_generated_contract_matches_backend():
    path = Path(__file__).resolve().parents[2] / "docs/openapi.json"
    assert json.loads(path.read_text(encoding="utf-8")) == create_app().openapi()
