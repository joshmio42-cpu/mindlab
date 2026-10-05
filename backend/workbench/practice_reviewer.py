"""An explicit, fallible educational rubric applied after completion. No model calls."""

import re

from .knowledge import retrieve

RUBRIC = {
    "version": "encounter-reflection-2.0.0",
    "method": "Offline rule-based educational review; wording cues require human interpretation.",
    "criteria": [
        {
            "id": "explain",
            "question": "Was the purpose or process explained in everyday terms, without inventing local procedures?",
        },
        {
            "id": "invite",
            "question": "Were questions invited and understanding checked without requiring agreement?",
        },
        {
            "id": "uncertainty",
            "question": "Were unknowns acknowledged and next steps for clarification offered?",
        },
        {
            "id": "neutral",
            "question": "Was wording free of pressure, leading assumptions and unsupported guarantees?",
        },
        {
            "id": "observe",
            "question": "Are quotations and observable behavior separated from interpretations and information still needed?",
        },
    ],
    "limits": "No diagnostic conclusions, competence scores or clinical validation. Multiple approaches can be defensible. A wording match is not proof of quality, intention or effect.",
}


def review(scenario, messages, objectives, notes, include_notes, rubric=RUBRIC):
    practitioner = [m for m in messages if m["role"] == "practitioner"]
    findings = []
    rules = [
        (
            "explain",
            r"\b(purpose|understand|process|conversation|activities)\b",
            "Explanation to examine",
            "This message contains an explanation cue. Check whether it answers the client's question and avoids claiming unconfirmed service details.",
            "The assessment can help us understand what has been difficult. I can explain the general process and check the details I don't have.",
            "Distinguishes general purpose from arrangements that need verification.",
        ),
        (
            "invite",
            r"\b(what|how|which)\b[^?]*\?",
            "Open question to examine",
            "The question begins with an open-question cue. Its wording and context still matter; an open form can contain an assumption.",
            "What would you most like to understand about this conversation?",
            "Lets the client set a priority without presuming a particular concern.",
        ),
        (
            "invite",
            r"\b(own words|understanding|understood|make sense|take away)\b",
            "Check for understanding",
            "This wording may check understanding. A yes/no agreement is different from hearing the client's own account.",
            "How would you describe what we have discussed, from what we've discussed?",
            "Invites a paraphrase and gives room to correct the explanation.",
        ),
        (
            "uncertainty",
            r"\b(check|confirm|don.t know|unsure|uncertain)\b",
            "Acknowledging uncertainty",
            "The message names uncertainty or checking. Consider whether a concrete next step was offered.",
            "I don't have that arrangement confirmed. We can check who receives the report before you decide what to share.",
            "Keeps uncertainty visible without promising a particular policy.",
        ),
        (
            "neutral",
            r"\b(don.t worry|nothing to worry|guarantee|definitely|you.ll be fine|you agree|isn.t it|won.t you|obviously)\b",
            "Potential reassurance or leading wording",
            "This phrase may promise an outcome or invite agreement. The rule cannot determine your intent or how a real person would receive it.",
            "What feels uncertain about the assessment? We can talk through what is known and what we need to check.",
            "Explores uncertainty without asking the client to accept reassurance.",
        ),
    ]
    for message in practitioner:
        for criterion, pattern, title, interpretation, alternative, why in rules:
            if criterion in objectives and re.search(pattern, message["text"], re.I):
                findings.append(
                    {
                        "criterion": criterion,
                        "title": title,
                        "message_id": message["id"],
                        "observation": message["text"],
                        "interpretation": interpretation,
                        "alternative": alternative,
                        "why": why,
                        "status": "observed wording; interpretation unverified",
                        "references": retrieve([criterion], scenario["id"]),
                    }
                )
    if scenario["id"] != "assessment-preparation":
        alternatives = {
            "explain": "Could we separate what we know about this topic from what still needs clarification?",
            "invite": "What would you most like to explore, and how would you describe what we have discussed?",
            "uncertainty": "We do not have enough information to settle that. What would be useful to check before a decision?",
            "neutral": "What feels unresolved? We can consider more than one possibility without deciding today.",
        }
        for finding in findings:
            finding["alternative"] = alternatives[finding["criterion"]]
            finding["interpretation"] = (
                finding["interpretation"]
                .replace("the client's question", "the person's question")
                .replace("unconfirmed service details", "unsupported details")
            )
            finding["why"] = (
                "Keeps the person's question, choices and missing information visible. It is one possible approach, not a prescribed script."
            )
    explored = " ".join(m["text"].lower() for m in messages if m["role"] == "client")
    markers = {"report": "employer", "letter": "short letter", "family": "family"}
    unexplored = [
        d
        for d in scenario["client"]["disclosures"]
        if d.get("marker", markers.get(d["id"], d["id"])) not in explored
    ]
    return {
        "rule_engine_version": RUBRIC["version"],
        "rubric": rubric,
        "summary": f"The saved transcript contains {len(practitioner)} practitioner messages and {len(messages) - len(practitioner)} client messages, including the authored opening. No emotional change or understanding level was measured.",
        "summary_evidence": [m["id"] for m in messages],
        "findings": findings,
        "missed_opportunities": [
            {
                "criterion": c["id"],
                "status": "not assessable" if c["id"] == "observe" else "not observed",
                "question": c["question"],
                "observation": "No matching wording cue was found in this transcript."
                if c["id"] != "observe"
                else "Review notebook categories separately; text alone cannot establish whether an observation occurred.",
                "interpretation": "This is an invitation to inspect the record, not evidence that the skill was absent.",
            }
            for c in rubric["criteria"]
            if c["id"] in objectives and not any(f["criterion"] == c["id"] for f in findings)
        ],
        "reflection": [
            "Which question did the client seem to be asking? Which exact words support your reading?",
            "Where did you infer something rather than observe it? What else could explain the exchange?",
            "What would you check with the service before answering? What would you try differently in a replay?",
        ],
        "unexplored": unexplored,
        "unexplored_label": "Authored fictional context not explicitly identified in the client replies by this rule-based reviewer. It is not a requirement to elicit every detail; verify against the transcript.",
        "notes_included": include_notes,
        "notes": notes if include_notes else [],
        "notes_comment": "Included by your choice for your own reflection; no automated judgment of notebook content is made."
        if include_notes
        else "Private notes were excluded from this debrief.",
    }
