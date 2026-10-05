import copy
import json

from fastapi.testclient import TestClient
from workbench import conversation_evaluation as evaluation
from workbench.api import create_app
from workbench.cases import CASES
from workbench.knowledge import REGISTRY, retrieve
from workbench.practice import PracticeController, PracticeLaunch
from workbench.practice_client import client_context
from workbench.store import Store


def test_disclosure_gate_and_objective_retrieval():
    case = copy.deepcopy(CASES["assessment-preparation"])
    case["client"]["disclosures"][0]["fact"] = "HIDDEN_REPORT_CANARY"
    case["client"]["background"] = "PRIVATE_BACKGROUND_CANARY"
    context = client_context(case, [{"role": "practitioner", "text": "Hello"}])
    assert "CANARY" not in json.dumps(context)
    context = client_context(case, [{"role": "practitioner", "text": "What worries you?"}])
    assert "HIDDEN_REPORT_CANARY" in json.dumps(context)
    assert "PRIVATE_BACKGROUND_CANARY" not in json.dumps(context)
    assert len(retrieve(["invite"])) == 1
    assert retrieve(["diagnose"])[0]["status"] == "insufficient evidence"
    for source in REGISTRY["sources"]:
        assert set(source["permissions"]) == {"code", "publication", "dataset", "case_materials"}
        assert source["used_by"] and source["review_status"]


def test_reflection_correction_and_independent_review(tmp_path):
    with TestClient(create_app(tmp_path / "reviews.sqlite3")) as c:
        s = c.post(
            "/api/practice/sessions",
            json={
                "mode": "reflective",
                "role": "psychometrician",
                "setting": "Supervised educational role; local scope to check",
            },
        ).json()
        s = c.post(
            f"/api/practice/sessions/{s['id']}/messages",
            json={"text": "What concerns you?", "revision": s["revision"]},
        ).json()
        s = c.post(
            f"/api/practice/sessions/{s['id']}/end",
            json={"reflection": "I should check my assumption.", "revision": s["revision"]},
        ).json()
        assert s["reflection"]["text"] == "I should check my assumption."
        assert s["feedback"]["findings"][0]["references"][0]["citations"]
        path = f"/api/practice/sessions/{s['id']}/reviews"
        data = {
            "kind": "adjudication",
            "reviewer": "A",
            "message_id": s["messages"][1]["id"],
            "text": "This wording may also be leading.",
        }
        assert c.post(path, json=data).status_code == 409
        data["kind"] = "independent rating"
        assert c.post(path, json=data).status_code == 201
        assert c.get(path).json()["records"] == []
        assert c.post(path, json=data).status_code == 409
        data["reviewer"] = "B"
        assert c.post(path, json=data).status_code == 201
        assert c.get(path).json()["adjudication_ready"]
        data["kind"] = "adjudication"
        assert c.post(path, json=data).status_code == 201
        assert c.get(f"/api/practice/sessions/{s['id']}").json() == s
        data["message_id"] = "made-up"
        assert c.post(path, json=data).status_code == 422


def test_all_original_cases_complete_and_replay_their_own_profile(tmp_path):
    with TestClient(create_app(tmp_path / "cases.sqlite3")) as c:
        assert len(c.get("/api/practice/scenarios").json()) == 3
        for case in CASES.values():
            s = c.post("/api/practice/sessions", json={"scenario_id": case["id"]}).json()
            assert s["messages"][0]["text"] == case["introduction"]["opening"]
            s = c.post(
                f"/api/practice/sessions/{s['id']}/messages",
                json={"text": "Tell me about your family.", "revision": s["revision"]},
            ).json()
            assert "rather not" in s["messages"][-1]["text"]
            s = c.post(f"/api/practice/sessions/{s['id']}/end", json={"revision": s["revision"]}).json()
            replay = c.post(
                f"/api/practice/sessions/{s['id']}/branches", json={"message_id": s["messages"][1]["id"]}
            ).json()
            assert replay["config"] == s["config"]
            assert replay["scenario"] == s["scenario"]
            assert replay["messages"] == s["messages"][:1]


def test_replay_records_current_code_with_historical_case(tmp_path):
    controller = PracticeController(Store(tmp_path / "historical.sqlite3"))
    original = controller.create(PracticeLaunch())
    parent = copy.deepcopy(original)
    parent["status"] = "completed"
    parent["config"]["client_version"] = "historical-client"
    parent["config"]["rubric"]["version"] = "historical-reviewer"
    parent["config"]["scenario"]["version"] = "historical-case"
    parent["messages"].append({"id": "branch", "role": "practitioner", "text": "Hello"})
    replay = controller.create(PracticeLaunch(), parent, "branch")
    assert replay["config"]["scenario"] == parent["config"]["scenario"]
    assert replay["config"]["client_version"] != "historical-client"
    assert replay["config"]["rubric"]["version"] != "historical-reviewer"
    assert controller.recorder.get(original["id"]) == original


def test_conversation_checks_separate_cases_runs_and_preserve_failures(monkeypatch):
    config = evaluation.EvaluationConfig()
    rows = [evaluation.repetition(config, i) for i in range(3)]
    summaries = evaluation.aggregate(rows)
    assert len(summaries) == 3
    for summary in summaries:
        assert summary["repetitions"] == 3
        assert summary["failures"] == 0
        assert summary["unique_replies_per_probe"] == [1, 1, 1]
        assert summary["unsupported_evidence_links"] == 0
        assert summary["refusal_flags"] == 0
        assert summary["opening_baseline_refusal_flags"] == 3

    def fail(context):
        raise ValueError("failure detail should not be included")

    monkeypatch.setattr(evaluation, "scripted_reply", fail)
    result = evaluation.repetition(config, 0)
    assert len(result["cases"]) == 3
    assert all(s["failures"] == 3 for s in evaluation.aggregate([result]))
    assert "failure detail" not in json.dumps(result)
