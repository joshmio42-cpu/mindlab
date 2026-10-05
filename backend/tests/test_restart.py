import os
import socket
import subprocess
import sys
import time

import httpx
from workbench.protocol import EXAMPLE


def test_real_process_crash_recovery(tmp_path):
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    url = f"http://127.0.0.1:{port}"
    environment = os.environ | {
        "MINDLAB_DATA_DIR": str(tmp_path),
        "MINDLAB_ENABLE_REMOTE": "0",
        "PYDANTIC_AI_NO_BANNER": "1",
    }
    log = (tmp_path / "server.log").open("w", encoding="utf-8")

    def start():
        process = subprocess.Popen(
            [
                sys.executable,
                "-m",
                "uvicorn",
                "workbench.api:app",
                "--host",
                "127.0.0.1",
                "--port",
                str(port),
            ],
            env=environment,
            stdout=log,
            stderr=log,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
        )
        for _ in range(150):
            try:
                if httpx.get(f"{url}/api/health", timeout=0.5).status_code == 200:
                    return process
            except httpx.HTTPError:
                pass
            if process.poll() is not None:
                break
            time.sleep(0.1)
        process.kill()
        process.wait()
        raise AssertionError("Server did not start: " + (tmp_path / "server.log").read_text())

    process = start()
    try:
        with httpx.Client(base_url=url, timeout=5) as client:
            saved = client.post("/api/studies", json=EXAMPLE.model_dump()).json()
            request = {
                "study_id": saved["id"],
                "revision": 1,
                "settings": {"pairs": 1, "fixture_delay_ms": 0},
            }
            complete_id = client.post("/api/runs", json=request).json()["id"]
            for _ in range(150):
                complete = client.get(f"/api/runs/{complete_id}").json()
                if complete["status"] == "completed":
                    break
                time.sleep(0.05)
            assert complete["status"] == "completed"
            request["settings"] = {"pairs": 2, "fixture": "stall", "timeout_seconds": 60}
            crash_id = client.post("/api/runs", json=request).json()["id"]
            for _ in range(150):
                before = client.get(f"/api/runs/{crash_id}").json()
                if before["attempts"] and before["attempts"][0]["request"]:
                    break
                time.sleep(0.05)
            assert before["attempts"][0]["request"]
        process.kill()
        process.wait(timeout=10)
        process = start()
        with httpx.Client(base_url=url, timeout=5) as client:
            assert client.get(f"/api/runs/{complete_id}").json() == complete
            recovered = client.get(f"/api/runs/{crash_id}").json()
            assert recovered["status"] == "interrupted"
            assert len(recovered["attempts"]) == 1
            assert recovered["attempts"][0]["status"] == "interrupted"
            assert recovered["attempts"][0]["request"] == before["attempts"][0]["request"]
            assert client.get("/api/health").json()["active_run"] is None
    finally:
        if process.poll() is None:
            process.kill()
            process.wait(timeout=10)
        log.close()
