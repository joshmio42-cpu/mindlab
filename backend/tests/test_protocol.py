import json

import pytest
from pydantic import ValidationError
from workbench.protocol import (
    EXAMPLE,
    REASK,
    Settings,
    Study,
    allocate,
    digest,
    initial,
    mapping,
    preview,
    revision,
)


def test_preview_contains_only_authorized_material():
    data = EXAMPLE.model_dump()
    data.update(
        title="PRIVATE_TITLE",
        research_question="PRIVATE_QUESTION",
        hypothesis="PRIVATE_HYPOTHESIS",
        notes="PRIVATE_NOTES",
    )
    data["options"][0]["id"] = "SECRET_CORRECT_ID"
    data["ground_truth"] = "SECRET_CORRECT_ID"
    study = Study.model_validate(data)
    view = preview(study, "B")
    for secret in (
        "PRIVATE_TITLE",
        "PRIVATE_QUESTION",
        "PRIVATE_HYPOTHESIS",
        "PRIVATE_NOTES",
        "SECRET_CORRECT_ID",
    ):
        assert secret not in json.dumps(view)
    assert view["initial"] == initial(study)
    assert view["conditions"]["peer"]["prompt"] == revision(study, "peer")
    assert json.loads(revision(study, "control")) == {"instruction": REASK}
    assert view["example_answer"] == {"choice": "B"}
    assert view["schema"]["properties"]["choice"]["enum"] == ["A", "B", "C"]
    assert mapping(study)["A"] == "SECRET_CORRECT_ID"
    with pytest.raises(ValueError):
        preview(study, "Z")


def test_allocation_is_matched_seeded_and_preserves_distinct_sessions():
    settings = Settings(pairs=30, seed=24)
    schedule = allocate("r", settings)
    assert allocate("r", settings) == schedule
    assert [s["arm"] for s in allocate("r", Settings(pairs=30, seed=25))] != [s["arm"] for s in schedule]
    assert len({s["id"] for s in schedule}) == 60
    for i in range(0, 60, 2):
        a, b = schedule[i : i + 2]
        assert a["pair_id"] == b["pair_id"]
        assert {a["arm"], b["arm"]} == {"peer", "control"}
        assert a["fixture"] == b["fixture"]
        assert a["id"] != b["id"]


@pytest.mark.parametrize(
    "change",
    [
        {"question": " "},
        {"ground_truth": "unknown"},
        {"peers": []},
        {"options": EXAMPLE.model_dump()["options"][:1]},
        {"options": [EXAMPLE.model_dump()["options"][0]] * 2},
        {"peers": [{"speaker": "a", "choice_id": "missing", "statement": "b"}]},
        {"share_memory": True},
    ],
)
def test_invalid_protocol_cannot_run(change):
    with pytest.raises(ValidationError):
        Study.model_validate(EXAMPLE.model_dump() | change)


@pytest.mark.parametrize(
    "change",
    [
        {"pairs": 0},
        {"pairs": 41},
        {"transport_retries": 2},
        {"seed": -1},
        {"timeout_seconds": 0},
        {"format_repair": True},
    ],
)
def test_invalid_or_unsupported_settings_rejected(change):
    with pytest.raises(ValidationError):
        Settings(**change)


def test_hash_is_canonical_and_sensitive():
    assert digest({"b": 2, "a": 1}) == digest({"a": 1, "b": 2})
    assert digest({"a": 2}) != digest({"a": 1})
