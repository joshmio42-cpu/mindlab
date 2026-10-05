"""Versioned original fiction. Evaluation fixtures are deliberately not loaded here."""

import json
from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class Disclosure(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    topic: str
    fact: str
    when: str
    trigger_pattern: str
    marker: str


class FictionalClient(BaseModel):
    model_config = ConfigDict(extra="forbid")
    identity: str
    background: str
    goals: list[str]
    preferences: str
    concerns: list[str]
    context: str
    initial_understanding: str
    volunteered: list[str]
    strengths: list[str]
    stable_facts: list[str]
    initial_facts: list[str]
    ambiguities: list[str]
    disclosures: list[Disclosure]
    constraints: list[str]
    boundaries: str


class OriginalCase(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    version: str
    schema_version: str
    title: str
    subtitle: str
    duration: str
    review_status: str
    introduction: dict[str, str | int]
    objectives: list[dict[str, str]] = Field(min_length=1)
    provenance: dict
    supported_context: dict
    variation: dict
    client: FictionalClient


CASES = {}
for path in sorted((Path(__file__).parent / "scenarios").glob("*.v2.json")):
    case = OriginalCase.model_validate_json(path.read_text(encoding="utf-8")).model_dump()
    CASES[case["id"]] = case


def case_schema():
    return json.loads(json.dumps(OriginalCase.model_json_schema()))
