"""Append-only corrections and independently submitted review records.

Local reviewer identities are self-declared, not authenticated credentials.
"""

import json
from typing import Literal

from fastapi import APIRouter, HTTPException, Request
from pydantic import BaseModel, ConfigDict, Field

from .store import now, uid

router = APIRouter(prefix="/api/practice", tags=["Practice review"])


class Annotation(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    kind: Literal["learner disagreement", "professional correction", "independent rating", "adjudication"]
    reviewer: str = Field(min_length=1, max_length=100)
    review_target: Literal["transcript", "case", "rubric", "cultural/language"] = "transcript"
    qualifications_and_scope: str = Field(default="Not supplied; credentials unverified", max_length=1500)
    message_id: str
    text: str = Field(min_length=1, max_length=4000)
    unsupported_feedback: Literal["present", "not observed", "not assessable"] = "not assessable"
    missed_problem: Literal["present", "not observed", "not assessable"] = "not assessable"
    cultural_language_review: str = Field(default="Not reviewed", max_length=1000)


def records(store, session_id):
    with store.connection() as db:
        db.execute(
            "CREATE TABLE IF NOT EXISTS practice_reviews (id TEXT PRIMARY KEY, session_id TEXT NOT NULL, body TEXT NOT NULL)"
        )
        rows = db.execute(
            "SELECT body FROM practice_reviews WHERE session_id=? ORDER BY rowid", (session_id,)
        ).fetchall()
    return [json.loads(row[0]) for row in rows]


@router.get("/sessions/{session_id}/reviews")
def get_reviews(session_id: str, request: Request):
    request.app.state.practice.recorder.get(session_id)
    rows = records(request.app.state.store, session_id)
    ratings = [r for r in rows if r["kind"] == "independent rating"]
    targets = ("transcript", "case", "rubric", "cultural/language")
    ready = [
        target
        for target in targets
        if len({r["reviewer"].casefold() for r in ratings if r.get("review_target", "transcript") == target})
        >= 2
    ]
    return {
        "records": [
            r
            for r in rows
            if r["kind"] != "independent rating" or r.get("review_target", "transcript") in ready
        ],
        "independent_ratings": len(ratings),
        "adjudication_ready": bool(ready),
        "ready_targets": ready,
        "identity_limit": "Local self-declared reviewers. Independence and qualifications require an external review coordinator.",
    }


@router.post("/sessions/{session_id}/reviews", status_code=201)
def add_review(session_id: str, body: Annotation, request: Request):
    c = request.app.state.practice
    session = c.recorder.get(session_id)
    if session["status"] != "completed":
        raise HTTPException(409, "Complete the session before reviewing it.")
    if body.message_id not in {m["id"] for m in session["messages"]}:
        raise HTTPException(422, "Cite a turn from this transcript.")
    store = request.app.state.store
    records(store, session_id)  # initialize additive table
    with store.connection() as db:
        db.execute("BEGIN IMMEDIATE")
        rows = [
            json.loads(r[0])
            for r in db.execute("SELECT body FROM practice_reviews WHERE session_id=?", (session_id,))
        ]
        raters = {
            r["reviewer"].casefold()
            for r in rows
            if r["kind"] == "independent rating"
            and r.get("review_target", "transcript") == body.review_target
        }
        if body.kind == "independent rating" and body.reviewer.casefold() in raters:
            raise HTTPException(409, "This reviewer already submitted an independent rating.")
        if body.kind == "adjudication" and len(raters) < 2:
            raise HTTPException(
                409, "Two different independent reviewers must submit for this target before adjudication."
            )
        record = {
            "id": uid("review"),
            "at": now(),
            "session_id": session_id,
            "scenario_version": session["config"]["scenario_version"],
            "rubric_version": session["config"]["rubric"]["version"],
            **body.model_dump(),
        }
        if c.api_key:
            record = {
                k: v.replace(c.api_key, "[REDACTED]") if isinstance(v, str) else v for k, v in record.items()
            }
        db.execute(
            "INSERT INTO practice_reviews VALUES (?, ?, ?)", (record["id"], session_id, json.dumps(record))
        )
    return {"id": record["id"], "status": "saved; original feedback unchanged"}
