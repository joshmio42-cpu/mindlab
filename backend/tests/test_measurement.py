import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from workbench.api import create_app
from workbench.measurement import GRID, MeasurementConfig, aggregate, measure, posterior, repetition


def test_numerical_prior_symmetry_extremes_and_no_repeated_items():
    mean, low, high = posterior(-(GRID**2) / 2)
    assert abs(mean) < 1e-14
    assert abs(low + high) < 1e-12
    assert 1.9 < high < 2.0
    correct = measure(0, np.zeros(41), 30, "adaptive")
    incorrect = measure(0, np.ones(41), 30, "adaptive")
    assert np.isfinite(correct["estimate"]) and np.isfinite(incorrect["estimate"])
    assert correct["estimate"] > 0 > incorrect["estimate"]
    assert len(set(correct["item_indices"])) == 30
    assert correct["item_indices"][0] == 20
    assert correct["item_indices"][1] > 20
    assert incorrect["item_indices"][1] < 20
    assert correct["low"] < correct["high"]


def test_reproducible_pairing_and_monte_carlo_recovery():
    config = MeasurementConfig(repetitions=1000)
    rows = [repetition(config, i) for i in range(1000)]
    assert repetition(config, 10) == rows[10]
    assert repetition(MeasurementConfig(seed=43), 10) != rows[10]
    # Pairing uses a single latent ability and a potential response per item.
    for row in rows[:10]:
        responses = {}
        for d in row["designs"]:
            for i, response in zip(d["item_indices"], d["responses"]):
                assert responses.setdefault(i, response) == response
    result = aggregate(rows)
    for summary in result:
        assert abs(summary["bias"]) < 0.1
        assert 0.90 < summary["coverage"] < 0.99
        assert sum(summary["exposure"]) == pytest.approx(summary["length"])
    for selection in ("spread", "adaptive"):
        short, long = [s for s in result if s["selection"] == selection]
        assert long["rmse"] < short["rmse"]
        assert long["mean_interval_width"] < short["mean_interval_width"]


def test_bounded_inputs():
    for kwargs in (
        {"repetitions": 1001},
        {"short_length": 20, "long_length": 5},
        {"lapse": float("nan")},
        {"seed": True},
    ):
        with pytest.raises(ValidationError):
            MeasurementConfig(**kwargs)


def test_measurement_shared_runner_persistence_and_exports(tmp_path):
    path = tmp_path / "lab.sqlite3"
    with TestClient(create_app(path)) as c:
        response = c.post("/api/measurement/runs", json={"repetitions": 12})
        assert response.status_code == 202
        run_id = response.json()["id"]
        for _ in range(200):
            run = c.get(f"/api/simulations/{run_id}").json()
            if run["status"] == "completed":
                break
            time.sleep(0.01)
        assert run["status"] == "completed"
        assert len(run["repetitions"]) == 12 and len(run["aggregate"]) == 4
        assert run["protocol"]["items"][20]["difficulty"] == 0
        assert c.get("/api/simulations").json() == []
        assert c.get("/api/measurement/runs").json()[0]["id"] == run_id
        assert c.get(f"/api/simulations/{run_id}/export/json").json() == run
        assert c.get(f"/api/simulations/{run_id}/export/repetitions.csv").status_code == 422
    with TestClient(create_app(path)) as c:
        assert c.get(f"/api/simulations/{run_id}").json() == run
