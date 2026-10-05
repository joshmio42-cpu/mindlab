"""Repeated scripted-baseline diagnostics, never evidence of human validity."""

import copy

from fastapi import APIRouter, HTTPException, Request
from pydantic import Field

from .cases import CASES
from .practice_client import CLIENT_VERSION, client_context, scripted_reply
from .practice_reviewer import RUBRIC, review
from .protocol import StrictModel, digest

VERSION = "conversation-probes/1.0.0"
PROBES = ["Hello", "What concerns or choices would you like to discuss?", "Tell me about your family."]


class EvaluationConfig(StrictModel):
    repetitions: int = Field(default=3, strict=True, ge=1, le=30)


def repetition(config, index, cases=CASES):
    results = []
    for case_id, case in cases.items():
        messages = [{"id": "opening", "role": "client", "text": case["introduction"]["opening"]}]
        probes = []
        for turn, prompt in enumerate(PROBES):
            messages.append({"id": f"learner-{turn}", "role": "practitioner", "text": prompt})
            try:
                context = client_context(case, messages)
                reply, rule = scripted_reply(context)
                messages.append({"id": f"client-{turn}", "role": "client", "text": reply})
                debrief = review(case, messages, ["invite", "neutral"], [], False)
                by_id = {m["id"]: m for m in messages}
                unsupported = sum(
                    f["message_id"] not in by_id or f["observation"] != by_id[f["message_id"]]["text"]
                    for f in debrief["findings"]
                )
                # A narrow disclosure check; passing does not establish semantic consistency.
                initial_leak = turn == 0 and any(
                    d["marker"].lower() in reply.lower() for d in case["client"]["disclosures"]
                )
                refusal_missing = turn == 2 and not any(
                    cue in reply.lower() for cue in ("rather not", "decline", "not discuss")
                )
                probes.append(
                    {
                        "prompt": prompt,
                        "reply": reply,
                        "rule": rule,
                        "failure": None,
                        "initial_disclosure_violation": initial_leak,
                        "missing_refusal": refusal_missing,
                        "unsupported_evidence_links": unsupported,
                        "baseline": {
                            "method": "repeat authored opening",
                            "reply": case["introduction"]["opening"],
                            "missing_refusal": turn == 2,
                        },
                    }
                )
            except Exception as exc:
                probes.append({"prompt": prompt, "failure": type(exc).__name__, "reply": None})
        results.append(
            {"case_id": case_id, "case_version": case["version"], "transcript": messages, "probes": probes}
        )
    return {"repetition": index + 1, "cases": results}


def aggregate(rows):
    cases = sorted({case["case_id"] for row in rows for case in row["cases"]})
    result = []
    for case_id in cases:
        observations = [case for row in rows for case in row["cases"] if case["case_id"] == case_id]
        probes = [p for case in observations for p in case["probes"]]
        valid = [p for p in probes if not p["failure"]]
        result.append(
            {
                "case_id": case_id,
                "repetitions": len(observations),
                "attempts": len(probes),
                "failures": sum(p["failure"] is not None for p in probes),
                "disclosure_flags": sum(p["initial_disclosure_violation"] for p in valid),
                "refusal_flags": sum(p["missing_refusal"] for p in valid),
                "unsupported_evidence_links": sum(p["unsupported_evidence_links"] for p in valid),
                "opening_baseline_refusal_flags": sum(p["baseline"]["missing_refusal"] for p in valid),
                "unique_replies_per_probe": [
                    len(
                        {c["probes"][i]["reply"] for c in observations if c["probes"][i]["reply"] is not None}
                    )
                    for i in range(len(PROBES))
                ],
            }
        )
    return result


router = APIRouter(prefix="/api/practice/evaluations", tags=["Conversation diagnostics"])


@router.get("")
def history(request: Request):
    return [
        {k: r[k] for k in ("id", "status", "created_at")}
        for r in request.app.state.store.simulations()
        if r["provenance"].get("exercise") == "conversation-evaluation"
    ]


@router.post("", status_code=202)
async def launch(config: EvaluationConfig, request: Request):
    if request.app.state.runner.busy:
        raise HTTPException(409, "Another rehearsal is running.")
    snapshots = copy.deepcopy(CASES)
    protocol = {
        "version": VERSION,
        "cases": snapshots,
        "case_hashes": {k: digest(v) for k, v in snapshots.items()},
        "development_probes": PROBES,
        "rubric": RUBRIC,
    }
    try:
        run_id = request.app.state.simulator.launch_exercise(
            "conversation-evaluation",
            config,
            protocol,
            {
                "model_version": CLIENT_VERSION,
                "source": "scripted",
                "seed": None,
                "model_settings": None,
                "assumptions": "Deterministic authored dialogue; repeats should be identical within a case. Cases are fixed distinct profiles, not a population sample.",
                "limitations": "Development probes only. Literal marker and evidence-link checks miss paraphrased hallucinations and unsupported interpretations. Human review and held-out evaluation remain required. No LLM or human-validity claim.",
            },
            lambda c, i: repetition(c, i, snapshots),
            aggregate,
        )
    except RuntimeError as exc:
        raise HTTPException(409, str(exc)) from exc
    return {"id": run_id}
