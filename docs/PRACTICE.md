# Practitioner practice implementation

Implemented 4 October 2026 after inspecting the repository, documentation, existing paired experiment code, and the uncommitted Monte Carlo implementation. Existing research features and records were retained. Practitioner practice is the new default React entry experience; the research dashboard remains separately accessible.

## One bounded scenario

`backend/workbench/scenarios/assessment-preparation.v1.json` retains the original authored definition for Alex Morgan, a fictional adult preparing for an assessment. It includes a public introduction, configurable objective choices, private background, goals, concerns, communication preferences, initial understanding, volunteered information, conditional disclosures, explicit constraints and boundaries. No copyrighted assessment materials or real client records were used. A concurrent extension introduced `cases.py` and later versioned scenario definitions; the controller now selects from that registry and freezes the selected definition in each session. This document describes the assessment-preparation slice, not validation of additional cases or review routes.

The current scripted client is a deterministic, ordered response tree. Family questions can elicit a refusal; unsupported reassurance elicits uncertainty; privacy questions produce unresolved report-sharing concerns. A comprehension check depends on prior practitioner explanations. Repeated questions consider earlier client replies. Respectful wording alone does not raise an authored trust state. There are no psychological measurements or hidden numeric states.

These behaviors demonstrate a limited authored perspective, not validated realism. Keyword matching can misunderstand negation, indirect phrasing, mixed-topic questions and multilingual input. The fallback asks for clarification within preparation; it is explicitly part of the scripted demo. A model-provider failure never enters this fallback. Focused evaluations check selected consistency cases, not natural-language completeness.

## Boundaries and responsibilities

| Component | Responsibility and allowed material |
| --- | --- |
| `practice.py` | Ordinary controller: validates input, authorizes sessions, freezes configuration, serializes turns, enforces stages and limits, routes scope interruptions, ends and branches sessions. |
| `practice_client.py` | Client boundary: explicitly permitted material from the scenario's `client` object and this session's dialogue. No objectives, rubric, notebook, debrief, other session, tool schema or external tools. |
| `practice_reviewer.py` | Separate post-session reviewer: explicit versioned rubric, selected objectives and completed transcript. Private notes included only on explicit selection; displayed for reflection, not automatically graded. |
| `practice_store.py` | Recorder: SQLite using existing Store connections, full synchronous commits, immutable configuration and ancestry, append-only messages/notes/attempts/events/errors, optimistic revision checks, completed-record protection and pending-request recovery. |
| `Practice.tsx` / `practice.css` | Scenario library, objectives, source selection, conversation, categorized private notebook, end/debrief, evidence navigation, persisted history, branch comparison and export. |

Client calls use no agent framework or autonomous controller. The default offline client is ordinary authored code. The optional model adapter makes one text-only request to a fixed OpenAI endpoint using `httpx2`, an already installed dependency. It has a 30-second timeout and 350 completion-token limit, no retries or tools. Model identity is explicitly server configured. Actual model requests occur only after session authorization and user submission; a replay independently requires authorization. Scope-boundary replies and the initial opening are authored even in model sessions and individually labeled. The boundary check is a conservative keyword guard plus model instructions, not a clinically validated safety classifier.

The rule-based reviewer runs after completion in both source modes, with no paid calls. Findings separate exact transcript quotations from reviewer interpretation and attach one possible alternative plus an explanation. Missing wording cues are framed as questions, not failures. The debrief permits multiple defensible approaches. It does not diagnose, certify competence, infer emotional changes, measure empathy or award compliance.

## Records and replay

The additive `practice_sessions` table coexists with existing study revisions, runs and simulations. No existing research records are migrated or rewritten. Each record includes:

- A full immutable scenario snapshot/version/hash, selected objectives, conversation source, client version, authorization and model settings, and a frozen rubric/version.
- IDs and timestamps; append-only practitioner/client messages with source labels; categorized notes with optional transcript references; exact permitted client context for each attempted response; errors and lifecycle events.
- Parent session ID, branch-point message ID and the exact shared conversation prefix. A branch replaces a selected practitioner message, copying everything before it into a new session. It never copies private notes or reviewer output into dialogue. Branches may themselves be replayed.
- Completed feedback with message evidence references validated against the actual transcript. Complete records cannot be edited through the recorder.

Active API reads omit the private scenario definition and captured client contexts. Scenario library reads expose only practitioner material. Completed debriefs selectively reveal authored unexplored context; the heuristic can miss semantically equivalent wording and says so. Full exports intentionally contain the scenario snapshot, contexts and private notebook for inspectability. Downloads are labeled **fictional simulation records**, and the UI explicitly discloses inclusion of private notes.

Attempts are saved before invocation. Success/error events identify their attempt. Provider exception text, error bodies, authentication headers and credentials are not stored. Literal active-key echoes in practitioner input, notebook text and model output are redacted before persistence. This is not a general personal-data anonymizer. Never enter real client information. Local SQLite is not encrypted.

Concurrent/stale mutations are rejected by record revision checks; pending responses prevent notes/end actions until resolved. A crash clears pending state on startup with an interruption record and no automatic request replay. A browser disconnect can leave a saved request; use Reload session to inspect it before sending again. Sessions remain available from history after page reload. Text not yet submitted to the API is a draft and may be lost on browser refresh.

## Provenance categories

Probability simulation, scripted experimental fixture, model experimental output, scripted fictional conversation, and model-generated fictional conversation remain distinct. Human research data is neither imported nor supported. Repeated model responses are not treated as a sampled human population. This change introduces no new runtime dependency and leaves experimental scoring and Monte Carlo probability models intact.

## Professional validation still needed

No qualified professional has reviewed this scenario, rubric or UI. Use `SCENARIO_REVIEW_TEMPLATE.md` to assess plausibility, client agency, stereotypes, scope, appropriate responsibilities by profession/jurisdiction, feedback specificity and pedagogical usefulness. Model conversational quality, instruction resistance, broader boundary handling and indirect language have not been established with live models. Passing software tests does not establish psychological realism, clinical validation, efficacy or professional competence. Voice, avatars, additional scenarios, multi-user hosting and model-based review are not implemented.


## Evidence extension (2026-10-04)

The v2 registry adds original Jordan and Sam cases alongside Alex. Cases are validated with `OriginalCase`; the full frozen profile stays in the recorder, while the client sees initial facts, strengths/goals and only triggered later facts. Reference notes and held-out candidates never enter that context. Role, mode, setting, objective-specific reference notes and pre-feedback written reflection are retained. Empty reflection is explicitly recorded as skipped. Guided mode exposes reflection prompts; reflective mode reduces prompting.

Debrief findings now retain cited original learning notes and explicit observation/status labels. Unknown objectives return insufficient evidence. Corrections and independent reviews are separate append-only records and never rewrite completed feedback. See [review workflow](../evaluation/README.md) for qualified review and target-specific adjudication, and [data-use documentation](EVIDENCE_AND_DATA_USE.md) for permissions and limits. Old session snapshots and replay ancestry remain preserved; new behavior uses declared client/rubric versions.
