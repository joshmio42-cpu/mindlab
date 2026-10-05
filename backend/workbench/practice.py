"""Ordinary session controller; client, reviewer and recorder have separate boundaries."""

import asyncio
import copy
import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

from . import practice_client
from .cases import CASES, case_schema
from .knowledge import REGISTRY, retrieve
from .practice_reviewer import RUBRIC, review
from .practice_store import PracticeRecorder
from .protocol import digest
from .store import now, uid

SCENARIO = CASES["assessment-preparation"]
OBJECTIVES = [o["id"] for o in SCENARIO["objectives"]]


class StrictInput(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class PracticeLaunch(StrictInput):
    scenario_id: str = "assessment-preparation"
    mode: Literal["guided", "reflective"] = "guided"
    role: Literal["student", "psychometrician", "psychologist", "professional"] = "student"
    setting: str = Field(
        default="Educational rehearsal; local scope not specified", min_length=1, max_length=500
    )
    source: Literal["scripted", "model"] = "scripted"
    objectives: list[Literal["explain", "invite", "uncertainty", "neutral", "observe"]] = Field(
        default_factory=lambda: list(OBJECTIVES), min_length=1, max_length=5
    )
    authorize_model_calls: bool = False


class PracticeTurn(StrictInput):
    text: str = Field(min_length=1, max_length=3000)
    revision: int


class PracticeNote(StrictInput):
    observed: str = Field(default="", max_length=3000)
    interpretation: str = Field(default="", max_length=3000)
    follow_up: str = Field(default="", max_length=3000)
    message_id: str | None = None
    revision: int


class PracticeEnd(StrictInput):
    include_notes: bool = False
    reflection: str = Field(default="", max_length=6000)
    revision: int


class PracticeBranch(StrictInput):
    message_id: str
    authorize_model_calls: bool = False


def public_scenario(scenario=SCENARIO):
    return {k: copy.deepcopy(v) for k, v in scenario.items() if k != "client"}


def public_session(session):
    result = copy.deepcopy(session)
    # Hidden scenario data is only revealed as selected authored context in completed debriefs.
    snapshot = result["config"].pop("scenario")
    result["scenario"] = {k: v for k, v in snapshot.items() if k != "client"}
    result.pop("attempts")
    return result


class PracticeController:
    def __init__(self, store, model_name=None, api_key=None):
        self.recorder = PracticeRecorder(store)
        self.recorder.recover()
        self.model_name = model_name
        self.api_key = api_key
        self.locks = {}

    def authorize(self, source, approved):
        if source == "model":
            if not approved:
                raise ValueError(
                    "Explicit authorization for paid model calls is required for each session or replay."
                )
            if not self.model_name or not self.api_key:
                raise ValueError(
                    "Model sessions are not configured on this server. Select the offline demonstration explicitly."
                )

    def create(self, body, parent=None, point=None):
        self.authorize(body.source, body.authorize_model_calls)
        if body.scenario_id not in CASES:
            raise ValueError("Unknown scenario")
        scenario = CASES[body.scenario_id]
        prefix = []
        if parent:
            if parent["status"] != "completed":
                raise ValueError("End the original session before branching so its record stays fixed.")
            index = next(
                (
                    i
                    for i, m in enumerate(parent["messages"])
                    if m["id"] == point and m["role"] == "practitioner"
                ),
                None,
            )
            if index is None:
                raise ValueError("Choose a practitioner message as the branch point.")
            prefix = copy.deepcopy(parent["messages"][:index])
        config = (
            copy.deepcopy(parent["config"])
            if parent
            else {
                "scenario_id": scenario["id"],
                "briefing": public_scenario(scenario),
                "mode": body.mode,
                "role": body.role,
                "setting": body.setting,
                "references": retrieve(body.objectives, scenario["id"]),
                "scenario_version": scenario["version"],
                "scenario_hash": digest(scenario),
                "scenario": copy.deepcopy(scenario),
                "objectives": list(dict.fromkeys(body.objectives)),
                "source": body.source,
                "model_settings": {
                    "model": self.model_name if body.source == "model" else None,
                    "max_completion_tokens": 350,
                    "timeout_seconds": 30,
                    "retries": 0,
                },
                "client_version": practice_client.CLIENT_VERSION,
                "rubric": copy.deepcopy(RUBRIC),
            }
        )
        # Replays preserve the case, while explicitly recording current executable versions.
        config["client_version"] = practice_client.CLIENT_VERSION
        config["rubric"] = copy.deepcopy(RUBRIC)
        config["model_calls_authorized"] = body.authorize_model_calls if body.source == "model" else False
        session = {
            "id": uid("practice"),
            "record_type": "fictional_simulation_record",
            "created_at": now(),
            "updated_at": now(),
            "status": "active",
            "revision": 0,
            "config": config,
            "parent_session_id": parent["id"] if parent else None,
            "branch_point": point,
            "conversation_prefix": copy.deepcopy(prefix),
            "messages": prefix
            or [
                {
                    "id": uid("message"),
                    "role": "client",
                    "text": config["scenario"]["introduction"]["opening"],
                    "at": now(),
                    "origin": "authored_opening",
                }
            ],
            "notes": [],
            "events": [{"at": now(), "kind": "created"}],
            "attempts": [],
            "errors": [],
            "pending": None,
            "feedback": None,
        }
        self.recorder.create(session)
        return session

    def editable(self, session_id, revision):
        session = self.recorder.get(session_id)
        if session["status"] != "active" or session["pending"]:
            raise ValueError("Session is complete or a response is pending. Reload the record.")
        if session["revision"] != revision:
            raise ValueError("This record changed. Reload it before continuing.")
        return session

    async def turn(self, session_id, body):
        lock = self.locks.setdefault(session_id, asyncio.Lock())
        if lock.locked():
            raise ValueError("A response is already pending.")
        async with lock:
            session = self.editable(session_id, body.revision)
            if len(session["messages"]) >= 81:
                raise ValueError(
                    "This bounded rehearsal has reached 40 exchanges. End it to reflect or replay."
                )
            # Redact the active credential if accidentally pasted, before any persistence or echo.
            text = body.text.replace(self.api_key, "[REDACTED]") if self.api_key else body.text
            session["messages"].append(
                {
                    "id": uid("message"),
                    "role": "practitioner",
                    "text": text,
                    "at": now(),
                    "origin": "practitioner",
                }
            )
            context = practice_client.client_context(session["config"]["scenario"], session["messages"])
            attempt_id = uid("client_call")
            session["pending"] = attempt_id
            session["attempts"].append(
                {
                    "id": attempt_id,
                    "at": now(),
                    "context": context,
                    "source": session["config"]["source"],
                    "client_version": practice_client.CLIENT_VERSION,
                }
            )
            self.recorder.save(session)
            try:
                if practice_client.outside_scope(text):
                    reply, origin = practice_client.SCOPE_REPLY, "authored_scope_boundary"
                elif session["config"]["source"] == "scripted":
                    reply, rule = practice_client.scripted_reply(context)
                    origin = "scripted"
                    session["events"].append({"at": now(), "kind": "script_rule", "rule": rule})
                else:
                    reply = await practice_client.model_reply(
                        context, session["config"]["model_settings"], self.api_key
                    )
                    origin = "model"
                session["messages"].append(
                    {"id": uid("message"), "role": "client", "text": reply, "at": now(), "origin": origin}
                )
                session["events"].append({"at": now(), "kind": "response", "attempt_id": attempt_id})
            except asyncio.CancelledError:
                session["errors"].append(
                    {
                        "at": now(),
                        "attempt_id": attempt_id,
                        "message": "Request interrupted. No response was substituted or automatically retried.",
                    }
                )
                session["events"].append({"at": now(), "kind": "interrupted", "attempt_id": attempt_id})
                session["pending"] = None
                self.recorder.save(session)
                raise
            except Exception:
                # Never log/export provider exception text, headers or bodies (may contain secrets).
                session["errors"].append(
                    {
                        "at": now(),
                        "attempt_id": attempt_id,
                        "message": "Client request failed or timed out. No response was substituted and no retry was made. Your message is saved; you may continue with a new message or end the session.",
                    }
                )
                session["events"].append({"at": now(), "kind": "request_failed", "attempt_id": attempt_id})
            session["pending"] = None
            self.recorder.save(session)
            return session

    def note(self, session_id, body):
        session = self.editable(session_id, body.revision)
        if not any((body.observed, body.interpretation, body.follow_up)):
            raise ValueError("Write at least one note field.")
        if body.message_id and body.message_id not in {m["id"] for m in session["messages"]}:
            raise ValueError("The observation reference must belong to this transcript.")
        data = body.model_dump(exclude={"revision"})
        if self.api_key:
            data = {
                k: v.replace(self.api_key, "[REDACTED]") if isinstance(v, str) else v for k, v in data.items()
            }
        session["notes"].append({"id": uid("note"), "at": now(), **data})
        self.recorder.save(session)
        return session

    def end(self, session_id, body):
        session = self.editable(session_id, body.revision)
        session["feedback"] = review(
            session["config"]["scenario"],
            session["messages"],
            session["config"]["objectives"],
            session["notes"],
            body.include_notes,
            session["config"]["rubric"],
        )
        session["reflection"] = {
            "text": body.reflection.replace(self.api_key, "[REDACTED]") if self.api_key else body.reflection,
            "status": "recorded" if body.reflection else "skipped",
            "at": now(),
        }
        session["feedback"]["references"] = copy.deepcopy(
            session["config"].get(
                "references", retrieve(session["config"]["objectives"], session["config"]["scenario_id"])
            )
        )
        for finding in session["feedback"]["findings"]:
            finding["references"] = [
                copy.deepcopy(note)
                for note in session["feedback"]["references"]
                if note["objective"] == finding["criterion"]
            ]
        session["status"] = "completed"
        session["events"].append({"at": now(), "kind": "ended", "notes_included": body.include_notes})
        self.recorder.save(session)
        return session


router = APIRouter(prefix="/api/practice", tags=["Practitioner practice"])


def controller(request):
    return request.app.state.practice


@router.get("/scenarios")
def scenarios():
    return [
        public_scenario(CASES[k])
        for k in ["assessment-preparation", *[k for k in CASES if k != "assessment-preparation"]]
    ]


@router.get("/sessions")
def sessions(request: Request):
    return [
        {
            "id": s["id"],
            "created_at": s["created_at"],
            "status": s["status"],
            "source": s["config"]["source"],
            "parent_session_id": s["parent_session_id"],
            "scenario_version": s["config"]["scenario_version"],
            "scenario_title": s["config"]["scenario"]["title"],
            "message_count": len(s["messages"]),
        }
        for s in controller(request).recorder.list()
    ]


@router.post("/sessions", status_code=201)
def launch(body: PracticeLaunch, request: Request):
    try:
        return public_session(controller(request).create(body))
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc


@router.get("/sessions/{session_id}")
def get_session(session_id: str, request: Request):
    return public_session(controller(request).recorder.get(session_id))


@router.post("/sessions/{session_id}/messages")
async def send(session_id: str, body: PracticeTurn, request: Request):
    try:
        return public_session(await controller(request).turn(session_id, body))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/sessions/{session_id}/notes")
def note(session_id: str, body: PracticeNote, request: Request):
    try:
        return public_session(controller(request).note(session_id, body))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/sessions/{session_id}/end")
def end(session_id: str, body: PracticeEnd, request: Request):
    try:
        return public_session(controller(request).end(session_id, body))
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.post("/sessions/{session_id}/branches", status_code=201)
def branch(session_id: str, body: PracticeBranch, request: Request):
    c = controller(request)
    parent = c.recorder.get(session_id)
    try:
        return public_session(
            c.create(
                PracticeLaunch(
                    source=parent["config"]["source"],
                    objectives=parent["config"]["objectives"],
                    authorize_model_calls=body.authorize_model_calls,
                ),
                parent,
                body.message_id,
            )
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc)) from exc


@router.get("/sessions/{session_id}/export")
def export(session_id: str, request: Request):
    # Exports include private notes by design; the download is explicitly labeled in the UI.
    session = controller(request).recorder.get(session_id)
    return Response(
        json.dumps(session, ensure_ascii=False, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": f'attachment; filename="fictional-simulation-{session_id}.json"'},
    )


@router.get("/sources")
def sources():
    return REGISTRY


@router.get("/references")
def references(objective: str):
    return retrieve([objective])


@router.get("/case-schema")
def schema():
    return case_schema()
