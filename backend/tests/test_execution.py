import asyncio
import csv
import io
import json
import socket

import httpx2
import pytest
from openai import APITimeoutError
from workbench.exports import attempt_csv, safe_cell, session_csv
from workbench.protocol import EXAMPLE, Settings, Study, initial, preview, revision
from workbench.runner import Runner
from workbench.store import Store


async def test_provider_timeout_is_not_retried_even_when_transport_retry_enabled(tmp_path, monkeypatch):
    async def timeout(**kwargs):
        raise APITimeoutError(request=httpx2.Request("POST", "https://example.invalid"))

    monkeypatch.setattr("workbench.runner.respond", timeout)
    _, _, run = await execute(tmp_path, pairs=1, transport_retries=1)
    assert len(run["attempts"]) == 2
    assert {a["status"] for a in run["attempts"]} == {"timeout"}


async def execute(tmp_path, study=EXAMPLE, **config):
    store = Store(tmp_path / "study.sqlite3")
    saved = store.save_study(study)
    runner = Runner(store)
    run = runner.launch(saved, Settings(fixture_delay_ms=0, **config))
    await runner.task
    return store, runner, store.run(run["id"])


def user_prompts(attempt):
    return [
        part["content"]
        for m in attempt["request"]["messages"]
        for part in m["parts"]
        if part["part_kind"] == "user-prompt"
    ]


async def test_full_offline_run_isolated_histories_actual_previews_and_records(tmp_path):
    store, runner, run = await execute(tmp_path)
    assert run["status"] == "completed"
    assert len(run["attempts"]) == 12
    assert len(run["realized_schedule"]) == 12
    assert run["metrics"]["peer"]["changed"] == 2
    assert run["metrics"]["control"]["changed"] == 1
    assert run["provenance"]["response_origin"] == "scripted_fixture"
    assert run["provenance"]["execution_mode"] == "fresh"
    assert run["provenance"]["sdk_retries"] == 0
    initial_ids = set()
    for session in run["sessions"]:
        a, b = [x for x in run["attempts"] if x["session_id"] == session["id"]]
        assert a["stage"] == "initial" and b["stage"] == "revision"
        assert user_prompts(a) == [initial(EXAMPLE)]
        assert user_prompts(b) == [initial(EXAMPLE), revision(EXAMPLE, session["arm"])]
        own_response = a["response"]
        history_responses = [m for m in b["request"]["messages"] if m["kind"] == "response"]
        assert len(history_responses) == 1
        # PydanticAI attaches its internal trace IDs after the raw boundary capture.
        # The response content, timing and usage must remain identical.
        assert {k: v for k, v in history_responses[0].items() if k not in ("run_id", "conversation_id")} == {
            k: v for k, v in own_response.items() if k not in ("run_id", "conversation_id")
        }
        initial_ids.add(a["id"])
        assert (
            a["request"]["parameters"]["output_tools"][0]["parameters_json_schema"]
            == preview(EXAMPLE, "A")["schema"]
        )
        assert a["wire_request"] is None
    assert len(initial_ids) == 6
    # A second run gets fresh initial histories and distinct identifiers.
    again = runner.launch(store.study(run["study_id"]), Settings(pairs=1, fixture_delay_ms=0))
    await runner.task
    assert again["id"] != run["id"]
    assert all(len(user_prompts(a)) == 1 for a in again["attempts"] if a["stage"] == "initial")


async def test_actual_model_boundary_excludes_private_canaries(tmp_path):
    data = EXAMPLE.model_dump()
    data.update(
        title="PRIVATE_TITLE",
        hypothesis="PRIVATE_HYPOTHESIS",
        notes="PRIVATE_NOTES",
        research_question="PRIVATE_RQ",
    )
    for i, option in enumerate(data["options"]):
        old = option["id"]
        option["id"] = f"PRIVATE_OPTION_{i}"
        if data["ground_truth"] == old:
            data["ground_truth"] = option["id"]
        for peer in data["peers"]:
            if peer["choice_id"] == old:
                peer["choice_id"] = option["id"]
    _, _, run = await execute(tmp_path, Study.model_validate(data))
    for attempt in run["attempts"]:
        encoded = json.dumps(attempt["request"])
        assert "PRIVATE_" not in encoded
        assert attempt["session_id"] not in encoded
        assert "control" not in encoded
    assert run["protocol"]["notes"] == "PRIVATE_NOTES"


async def test_offline_mode_cannot_open_a_network_socket(tmp_path, monkeypatch):
    def deny(*args, **kwargs):
        raise AssertionError("Offline rehearsal attempted network access")

    monkeypatch.setattr(socket.socket, "connect", deny)
    _, _, run = await execute(tmp_path, pairs=1)
    assert run["status"] == "completed"


async def test_reordered_options_keep_neutral_tokens_and_score_stable_ids(tmp_path):
    data = EXAMPLE.model_dump()
    data["options"].reverse()
    _, _, run = await execute(tmp_path, Study.model_validate(data), pairs=1, fixture="follow")
    assert run["mapping"] == {"A": "four", "B": "eight", "C": "seven"}
    for session in run["sessions"]:
        assert session["initial"]["choice_id"] == "four"
        assert session["initial_correct"] is False
    assert run["metrics"]["peer"]["correct_to_incorrect"]["denominator"] == 0


@pytest.mark.parametrize(
    "fixture,status,needle",
    [
        ("malformed", "invalid", '{\\"choice\\":'),
        ("unknown", "invalid", "NOT_AN_OPTION"),
        ("stall", "timeout", None),
    ],
)
async def test_invalid_and_missing_answers_are_preserved_without_repair(tmp_path, fixture, status, needle):
    _, _, run = await execute(tmp_path, pairs=1, fixture=fixture, timeout_seconds=1)
    assert run["status"] == "completed_with_errors"
    assert len(run["attempts"]) == 2
    assert {a["status"] for a in run["attempts"]} == {status}
    assert all(a["stage"] == "initial" for a in run["attempts"])
    assert all(s["initial"] is None and s["revised"] is None for s in run["sessions"])
    assert run["metrics"]["peer"]["complete"] == 0
    assert run["metrics"]["peer"]["missing"] == 1
    if needle:
        assert needle in json.dumps(run["attempts"][0]["response"])
    else:
        assert run["attempts"][0]["request"] and run["attempts"][0]["response"] is None


async def test_retry_is_explicit_bounded_and_does_not_pollute_history(tmp_path):
    _, _, run = await execute(tmp_path, pairs=1, fixture="flaky", transport_retries=1)
    assert run["status"] == "completed"
    assert len(run["attempts"]) == 8
    for i in range(0, 8, 2):
        first, second = run["attempts"][i : i + 2]
        assert first["status"] == "transport_error"
        assert second["status"] == "valid" and second["purpose"] == "transport_retry"
        assert second["retry_of"] == first["id"]
        assert first["stage_id"] == second["stage_id"]
        assert user_prompts(first) == user_prompts(second)


async def test_cancellation_keeps_attempt_and_stops_dispatch(tmp_path):
    store = Store(tmp_path / "cancel.sqlite3")
    runner = Runner(store)
    run = runner.launch(store.save_study(EXAMPLE), Settings(pairs=3, fixture="stall", timeout_seconds=30))
    for _ in range(100):
        if run["attempts"] and run["attempts"][0]["request"]:
            break
        await asyncio.sleep(0.01)
    runner.cancel(run["id"])
    await runner.task
    result = store.run(run["id"])
    assert result["status"] == "cancelled"
    assert len(result["attempts"]) == 1
    assert result["attempts"][0]["status"] == "cancelled"
    assert all(s["status"] == "cancelled" for s in result["sessions"])


async def test_immutable_revisions_restart_and_exports(tmp_path):
    data = EXAMPLE.model_dump()
    data["title"] = '=HYPERLINK("https://example.invalid")'
    data["options"][0]["text"] = "Unicode café\nsecond line"
    store, _, run = await execute(tmp_path, Study.model_validate(data), pairs=1)
    before = store.run(run["id"])
    revision2 = store.save_study(EXAMPLE, run["study_id"])
    assert revision2["revision"] == 2
    assert store.study(run["study_id"], 1)["study"]["title"] == data["title"]
    assert store.run(run["id"]) == before
    with pytest.raises(ValueError, match="terminal"):
        store.checkpoint(run)
    reopened = Store(store.path)
    reopened.recover()
    assert reopened.run(run["id"]) == before
    sessions = list(csv.DictReader(io.StringIO(session_csv(run))))
    attempts = list(csv.DictReader(io.StringIO(attempt_csv(run))))
    assert len(sessions) == 2 and len(attempts) == 4
    assert sessions[0]["title"].startswith("'=")
    assert sessions[0]["initial_text"] == "Unicode café\nsecond line"
    assert {a["session_id"] for a in attempts} == {s["session_id"] for s in sessions}
    assert {a["attempt_id"] for a in attempts} == {a["id"] for a in run["attempts"]}
    assert json.loads(attempts[0]["request"]) == run["attempts"][0]["request"]


async def test_recovery_preserves_completed_work_and_never_resumes(tmp_path):
    store = Store(tmp_path / "recovery.sqlite3")
    runner = Runner(store)
    run = runner.launch(store.save_study(EXAMPLE), Settings(pairs=3, fixture_delay_ms=100))
    while (
        not run["attempts"]
        or not any(a["status"] == "valid" for a in run["attempts"])
        or run["attempts"][-1]["request"] is None
    ):
        await asyncio.sleep(0.01)
    await runner.shutdown()
    before = store.run(run["id"])
    finished = [a for a in before["attempts"] if a["status"] == "valid"]
    assert finished
    store.recover()
    after = store.run(run["id"])
    assert after["status"] == "interrupted"
    assert [a for a in after["attempts"] if a["status"] == "valid"] == finished
    assert len(after["attempts"]) == len(before["attempts"])
    assert any(a["status"] == "interrupted" for a in after["attempts"])


@pytest.mark.parametrize("value", ["=SUM(1)", " +1", "-a", "@a", "\ta", "\ra", "\na"])
def test_formula_escaping(value):
    assert safe_cell(value) == "'" + value
    assert safe_cell(None) == ""
    assert safe_cell(-2) == -2
