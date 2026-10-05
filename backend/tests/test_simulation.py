import copy
import csv
import io
import threading
import time

import numpy as np
import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from workbench import simulation
from workbench.api import create_app
from workbench.protocol import EXAMPLE, Study
from workbench.simulation import SimulationConfig, aggregate, generate_group, indices, repetition, score
from workbench.store import TERMINAL, Store


def wait(client, run_id):
    deadline = time.monotonic() + 20
    while time.monotonic() < deadline:
        result = client.get(f"/api/simulations/{run_id}").json()
        if result["status"] in TERMINAL:
            return result
        time.sleep(0.01)
    raise AssertionError("Simulation did not finish")


def launch(client, config=None, study=EXAMPLE):
    saved = client.post("/api/studies", json=study.model_dump()).json()
    response = client.post(
        "/api/simulations",
        json={"study_id": saved["id"], "revision": 1, "config": config or {"repetitions": 10}},
    )
    assert response.status_code == 202, response.text
    return response.json()["id"]


def test_reproducible_streams_independent_of_iteration_order_and_other_sizes():
    config = SimulationConfig(repetitions=10, seed=123, comparison_sizes=[10, 1000])
    first = [repetition(EXAMPLE, config, n, i) for i in range(10) for n in config.sizes]
    second = [repetition(EXAMPLE, config, n, i) for i in reversed(range(10)) for n in reversed(config.sizes)]
    assert first == list(reversed(second))
    assert first[1] == repetition(EXAMPLE, config.model_copy(update={"comparison_sizes": []}), 100, 0)
    changed = repetition(EXAMPLE, config.model_copy(update={"seed": 124}), 100, 0)
    assert first[1] != changed
    # Independent draws have the same distribution, not duplicated initial answers.
    assert any(row["control"]["initial_accuracy"] != row["treatment"]["initial_accuracy"] for row in first)


@pytest.mark.parametrize("p", [0, 1])
@pytest.mark.parametrize("baseline", [0, 1])
@pytest.mark.parametrize("adoption", [0, 1])
def test_probability_boundaries(p, baseline, adoption):
    config = SimulationConfig(initial_correctness=p, baseline_change=baseline, peer_adoption=adoption)
    for treatment in (False, True):
        initial, final = generate_group(np.random.default_rng(1), 1000, 3, 2, 0, config, treatment)
        assert np.all((initial == 2) == bool(p))
        if treatment and adoption == 1:
            assert np.all(final == 0)
        elif baseline == 0:
            np.testing.assert_array_equal(initial, final)
        elif baseline == 1:
            assert np.all(initial != final)
        assert np.all((final >= 0) & (final < 3))


def test_exact_metrics_denominators_and_reversal():
    initial, final = np.array([0, 1, 2, 0]), np.array([1, 1, 1, 0])
    scored = score(initial, final, correct=0, peer=1)
    assert scored["initial_accuracy"] == {"count": 2, "denominator": 4, "rate": 0.5}
    assert scored["final_accuracy"]["rate"] == 0.25
    assert scored["answer_change"]["count"] == 2
    assert scored["peer_selection"]["rate"] == 0.75
    assert scored["adoption"] == {"count": 2, "denominator": 3, "rate": 2 / 3}
    zero = score(np.ones(4), np.ones(4), 0, 1)
    assert zero["adoption"] == {"count": 0, "denominator": 0, "rate": None}
    # Everyone starts at peer; baseline switches away, peer rule restores it.
    config = SimulationConfig(initial_correctness=0, baseline_change=1, peer_adoption=1)
    initial, final = generate_group(np.random.default_rng(1), 100, 2, 0, 1, config, True)
    assert score(initial, final, 0, 1)["answer_change"]["count"] == 0


def test_no_changes_and_no_eligible_adoption():
    two_options = EXAMPLE.model_copy(update={"options": EXAMPLE.options[:2]})
    config = SimulationConfig(initial_correctness=0, baseline_change=0, peer_adoption=0)
    row = repetition(two_options, config, 100, 0)
    for arm in ("control", "treatment"):
        assert row[arm]["answer_change"]["rate"] == 0
        assert row[arm]["adoption"]["rate"] is None
    assert row["difference_pp"]["adoption"] is None
    summary = aggregate([row], [100])[0]
    assert summary["difference_pp"]["adoption"]["mean"] is None
    assert summary["difference_pp"]["adoption"]["count"] == 0


def test_monte_carlo_means_match_analytic_model_and_variability_decreases():
    config = SimulationConfig(
        repetitions=600, initial_correctness=0.65, baseline_change=0.2, peer_adoption=0.35
    )
    rows = [repetition(EXAMPLE, config, n, i) for i in range(600) for n in (25, 1000)]
    small, large = aggregate(rows, [25, 1000])
    q_initial = (1 - 0.65) / 2
    q_baseline = 0.8 * q_initial + 0.2 * (1 - q_initial) / 2
    expected_difference = 100 * 0.35 * (1 - q_baseline)
    assert abs(large["difference_pp"]["peer_selection"]["mean"] - expected_difference) < 0.5
    assert abs(large["control"]["final_accuracy"]["mean"] - (0.8 * 0.65 + 0.2 * 0.35 / 2)) < 0.005
    assert abs(large["treatment"]["adoption"]["mean"] - (0.35 + 0.65 * 0.2 / 2)) < 0.005
    assert small["difference_pp"]["peer_selection"]["sd"] > 4 * large["difference_pp"]["peer_selection"]["sd"]
    assert sum(b["count"] for b in large["histogram"]) == 600
    config = config.model_copy(update={"peer_adoption": 0})
    null_rows = [repetition(EXAMPLE, config, 1000, i) for i in range(600)]
    null_summary = aggregate(null_rows, [1000])[0]
    for metric in simulation.METRICS:
        assert abs(null_summary["difference_pp"][metric]["mean"]) < 0.5
    assert null_summary["difference_pp"]["peer_selection"]["sd"] > 0


@pytest.mark.parametrize(
    "body",
    [
        {"participants_per_condition": 0},
        {"participants_per_condition": 1.5},
        {"repetitions": 2001},
        {"initial_correctness": -0.1},
        {"peer_adoption": 1.1},
        {"baseline_change": float("nan")},
        {"seed": -1},
        {"comparison_sizes": [10, 10]},
        {"comparison_sizes": [1, 2, 3, 4, 5, 6]},
        {"participants_per_condition": 10000, "repetitions": 2000},
    ],
)
def test_limits(body):
    with pytest.raises(ValidationError):
        SimulationConfig(**body)


def test_peer_validation():
    study = EXAMPLE.model_dump()
    study["peers"][0]["choice_id"] = study["ground_truth"]
    with pytest.raises(ValueError, match="same answer"):
        indices(Study.model_validate(study))
    for peer in study["peers"]:
        peer["choice_id"] = study["ground_truth"]
    with pytest.raises(ValueError, match="different from"):
        indices(Study.model_validate(study))


def test_api_complete_exports_frozen_revision_and_restart(tmp_path):
    path = tmp_path / "api.sqlite3"
    with TestClient(create_app(path)) as client:
        run_id = launch(client, {"repetitions": 8, "comparison_sizes": [10, 500]})
        result = wait(client, run_id)
        assert result["status"] == "completed"
        assert result["completed_repetitions"] == result["planned_repetitions"] == 24
        assert result["aggregate"] == aggregate(result["repetitions"], result["sample_sizes"])
        assert client.get(f"/api/simulations/{run_id}/export/json").json() == result
        assert "repetitions" not in client.get(f"/api/simulations/{run_id}?summary_only=true").json()
        exported = client.get(f"/api/simulations/{run_id}/export/repetitions.csv")
        rows = list(csv.DictReader(io.StringIO(exported.text)))
        assert len(rows) == 24
        for record, row in zip(result["repetitions"], rows):
            assert int(row["control_adoption_denominator"]) == record["control"]["adoption"]["denominator"]
            assert float(row["difference_peer_selection_pp"]) == record["difference_pp"]["peer_selection"]
        revised = EXAMPLE.model_dump() | {"title": "Changed after simulation"}
        client.put(f"/api/studies/{result['study_id']}", json=revised)
        assert client.get(f"/api/simulations/{run_id}").json() == result
        assert client.get(f"/api/simulations/{run_id}/export/nope").status_code == 404
        with pytest.raises(ValueError, match="terminal"):
            Store(path).checkpoint_simulation(result)
    with TestClient(create_app(path)) as client:
        assert client.get(f"/api/simulations/{run_id}").json() == result
        assert client.get("/api/health").json()["active_simulation"] is None


def test_cancel_keeps_completed_studies_and_server_responsive(tmp_path, monkeypatch):
    entered, release = threading.Event(), threading.Event()
    real = simulation.repetition

    def gated(*args):
        entered.set()
        assert release.wait(5)
        return real(*args)

    monkeypatch.setattr(simulation, "repetition", gated)
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        run_id = launch(client, {"repetitions": 100})
        assert entered.wait(5)
        try:
            assert client.get("/api/health").json()["active_simulation"] == run_id
            record = client.get(f"/api/simulations/{run_id}").json()
            body = {"study_id": record["study_id"], "revision": 1}
            assert client.post("/api/simulations", json=body).status_code == 409
            assert client.post("/api/runs", json=body).status_code == 409
            assert client.post(f"/api/simulations/{run_id}/cancel", json={}).status_code == 200
        finally:
            release.set()
        result = wait(client, run_id)
        assert result["status"] == "cancelled"
        assert result["cancel_requested"] is True
        assert result["completed_repetitions"] == 1
        assert result["aggregate"] == aggregate(result["repetitions"], [100])
        assert (
            len(
                list(
                    csv.DictReader(
                        io.StringIO(client.get(f"/api/simulations/{run_id}/export/repetitions.csv").text)
                    )
                )
            )
            == 1
        )
        assert client.get(f"/api/simulations/{run_id}/export/json").json() == result


def test_failure_and_recovery_and_frozen_fields(tmp_path, monkeypatch):
    real = simulation.repetition

    def fails_on_second(study, config, n, i):
        if i == 1:
            raise RuntimeError("Synthetic failure")
        return real(study, config, n, i)

    monkeypatch.setattr(simulation, "repetition", fails_on_second)
    path = tmp_path / "api.sqlite3"
    with TestClient(create_app(path)) as client:
        run_id = launch(client)
        result = wait(client, run_id)
        assert result["status"] == "failed"
        assert result["completed_repetitions"] == 1
        assert result["error"]
    store = Store(path)
    interrupted = copy.deepcopy(result)
    interrupted.update(id="sim_interrupted", status="running", ended_at=None)
    store.create_simulation(interrupted)
    modified = copy.deepcopy(interrupted)
    modified["config"]["seed"] += 1
    with pytest.raises(ValueError, match="immutable"):
        store.checkpoint_simulation(modified)
    modified = copy.deepcopy(interrupted)
    modified["repetitions"][0]["repetition"] = 99
    with pytest.raises(ValueError, match="append only"):
        store.checkpoint_simulation(modified)
    store.recover()
    recovered = store.simulation(interrupted["id"])
    assert recovered["status"] == "interrupted"
    assert recovered["repetitions"] == result["repetitions"]
    assert recovered["aggregate"] == result["aggregate"]


def test_missing_adoption_csv_blank_and_validation_api(tmp_path):
    two = EXAMPLE.model_copy(update={"options": EXAMPLE.options[:2]})
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        run_id = launch(
            client,
            {"repetitions": 2, "initial_correctness": 0, "baseline_change": 0, "peer_adoption": 0},
            two,
        )
        wait(client, run_id)
        rows = list(
            csv.DictReader(io.StringIO(client.get(f"/api/simulations/{run_id}/export/repetitions.csv").text))
        )
        assert len(rows) == 2
        assert rows[0]["control_adoption_denominator"] == "0"
        assert rows[0]["control_adoption_rate"] == rows[0]["difference_adoption_pp"] == ""
        assert client.get("/api/simulations/missing").status_code == 404
        assert client.post("/api/simulations", json={}).status_code == 422
        assert client.post("/api/simulations/missing/cancel", json={}).status_code == 404
        assert (
            client.post("/api/simulations", json={}, headers={"origin": "https://example.com"}).status_code
            == 403
        )
