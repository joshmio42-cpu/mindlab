# Evaluation and review procedure

No professional review, independent human ratings, cross-cultural validation or learning-benefit study has occurred. The three supported practice cases are original adult English fiction, not a representative international population.

## A usable review cycle

1. Freeze the case hash, client version, source, model settings, rubric version and exported transcript. Use `docs/SCENARIO_REVIEW_TEMPLATE.md` for a case/rubric assessment. Record profession, jurisdiction, supervision, relevant cultural/language expertise and conflicts. A role title alone is not a scope of practice.
2. A review coordinator recruits suitable independent professionals and verifies credentials outside this local prototype. Each reviews the same frozen transcript and target independently. Do not share the other rater's judgments beforehand.
3. In a completed encounter, open **Disagree, correct, or submit a professional review**, choose case, rubric, transcript, or cultural/language review; submit **independent rating** with an evidence turn. Mark unsupported feedback and missed problems as present, not observed, or not assessable, and explain in text. The server conceals independent rating contents until two distinct local reviewer identifiers submit for the same target.
4. The server then permits **adjudication** for that target. Discuss disagreements and record reasons without replacing either independent rating. Corrections and learner disagreements are append-only sidecar records; original transcripts and feedback remain immutable. Records can be retrieved as JSON at `/api/practice/sessions/{id}/reviews`.
5. This is a local workflow, not authenticated blinded research infrastructure. Names are self-declared; users with database access can inspect records. No record automatically upgrades a case to reviewed. A maintainer must assess the actual review and publish a new case/rubric version with supported uses and limitations.

## Separation and held-out material

`backend/workbench/scenarios` holds development/practice cases. `conversation_evaluation.py` contains explicit development probes. `evaluation/heldout/reviewer-transcripts.json` contains separate **candidate** families and transcripts; the client and runtime reviewer never load it. These developer-authored candidates are not an independently sealed validation set. Their known gaps must not be counted as successful validation.

For an independent study, the coordinator should commission new case families, freeze and hash the held-out set before development decisions, keep keys outside runtime prompts, predeclare unsupported-feedback and missed-problem adjudication rules, and obtain independent ratings before scoring. Do not reuse the visible candidates to claim generalization after tuning on them. Compare the wording reviewer with a no-feedback transcript-inspection baseline, and the client with the opening-only baseline. Include indirect language, negation, refusals, misunderstood scores, access needs, unsupported reassurance, nonverbal inferences, and out-of-scope requests. Review translations and cultural contexts independently before enabling them.

## Implemented diagnostics

The library's **Conversation simulator checks** repeat the same three development probes within each case and compare against an opening-only baseline. Records preserve each attempt, transcript, failure, model/client version, case hash and checks. Offline replies have no RNG seed and are deterministic; distinct-response counts describe repeated runs of one case, never population variability. Literal marker checks and exact quote/reference checks are narrow: they cannot certify factual consistency or supported interpretations. Paid-model repeated-run evaluation is not implemented or run.

Measurement checks cover prior symmetry, finite extreme estimates, unique adaptive items, paired potential responses, seeded repeatability, empirical coverage, item exposure, longer-test error reduction under matched defaults, storage and export. Changing population/noise can make estimation assumptions wrong. No real norms, fairness, reliability coefficient, diagnosis or construct-validity claim follows from these checks.

Future promotion requires permission review for each imported component, independent professional/cultural review, benchmark error analyses, and evidence appropriate to the proposed use. No third-party benchmark dataset has been imported and no model has been fine-tuned.
