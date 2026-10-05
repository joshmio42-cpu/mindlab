"""Objective-scoped original learning notes, with bibliographic references only.

Never used by the client. No third-party tools, test items or training corpora.
"""

import copy
import json
from pathlib import Path

REGISTRY = json.loads((Path(__file__).parent / "knowledge/sources.json").read_text(encoding="utf-8"))
SOURCES = {s["id"]: s for s in REGISTRY["sources"]}
CARDS = {
    "explain": (
        "itc-use",
        "Ask what the person wants to understand. Distinguish the purpose of an assessment from service arrangements that need confirmation.",
    ),
    "invite": (
        "who-manual",
        "Invite the person's account and questions. An invitation is observable in text; understanding or a helping relationship cannot be established from a wording match.",
    ),
    "neutral": (
        "who-manual",
        "Explore concerns without requiring agreement. A client's refusal or continued uncertainty is not a measure of practitioner failure.",
    ),
    "uncertainty": (
        "itc-use",
        "Identify what is known, what is missing, and who could clarify it. Consider the intended use and context before interpreting a result.",
    ),
    "observe": (
        "itc-use",
        "Keep the client's exact words separate from your interpretation. Document information needed before making an assessment decision.",
    ),
    "measurement": (
        "testing-standards",
        "Interpret a score in relation to its intended use, error and relevant population. A synthetic model cannot establish validity, fairness or appropriate norms for people.",
    ),
}


def retrieve(objectives, scenario_id=None):
    cards = []
    for objective in dict.fromkeys(objectives):
        if objective not in CARDS:
            cards.append(
                {
                    "objective": objective,
                    "status": "insufficient evidence",
                    "text": "No reviewed reference note is available for this objective.",
                    "citations": [],
                }
            )
            continue
        source_id, text = CARDS[objective]
        if scenario_id == "everyday-change" and objective in ("explain", "uncertainty", "observe"):
            source_id = "who-manual"
            text = "Explore the person's goals and competing preferences before discussing options. Distinguish their stated reasons from your interpretation; uncertainty or declining a plan can remain unresolved."
        elif scenario_id == "score-understanding" and objective in ("explain", "uncertainty"):
            source_id = "testing-standards"
            text = "Clarify what the fictional score scale represents before using the number. Ask what is known about uncertainty, intended use and the comparison group; a score alone cannot justify the person's decision."
        source = SOURCES[source_id]
        cards.append(
            {
                "objective": objective,
                "status": "original educational interpretation; professionally unreviewed",
                "text": text,
                "citations": [{"id": source_id, "title": source["title"], "url": source["url"]}],
                "content_origin": "Original MindLab learning note; not an extract or validated rubric from the cited source.",
            }
        )
    return copy.deepcopy(cards)
