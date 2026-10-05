# Evidence and practice slice — 4 October 2026

Working preview: http://127.0.0.1:8103/ with a **separate demonstration notebook** in `.runtime/evidence-preview`. Existing notebooks were not migrated or replaced. The preview has three completed authored demo encounters, a 1,000-repetition measurement run and three diagnostic repeats per case. No paid model calls or human ratings were made.

## Implemented

- 36-entry registry: 33 research references plus three original cases. Separate component permissions, audit depth, bibliographic fields, limitations, context, review status and feature/case use. No external case, dataset, code or tool content imported.
- Objective- and case-specific original learning notes with primary-source links and insufficient evidence for unknown objectives. Structured reference access, without embeddings or fine-tuning.
- Three versioned English adult cases: assessment preparation, misunderstood fictional score, everyday mixed motivation. The schema covers strengths, goals, stable context, ambiguities, initial/later information, refusals, variation and provenance. The client receives permitted facts, not private notes, references, rubric or evaluation keys.
- Guided/reflective modes and local role/setting, encounter, notebook, written reflection before debrief, evidence quotes, interpretations, alternatives, missing evidence, preserved originals and replay. Replays retain historical case content but record current client/reviewer executable versions; attempts and debriefs record actual implementation versions. Archived executable code is not rerun.
- Append-only learner disagreement and professional corrections; independent review of transcript, case, rubric or cultural/language targets; same-target two-reviewer gate before adjudication. Reviewer identities are self-declared and require a coordinator to verify qualifications and independence.
- Original synthetic 1PL measurement lab: two lengths × fixed/adaptive selection, population/noise controls, bias/RMSE/coverage/interval width, exposure charts and detailed JSON exports. Reuses existing Monte Carlo worker, storage, cancellation and recovery.
- Per-case repeated scripted diagnostics, opening-only baseline and preserved failures. Separate candidate held-out families/transcripts and professional review procedure.

## Verification

The complete backend suite passed **97 tests**. A final replay-provenance regression was then added; the affected encounter/evidence subset passed **26 tests**, including the new regression (98 tests now in the backend suite). The final changes affect case-specific reference selection and executable-version reporting.

**2 frontend unit tests and 9 Chromium workflows passed**, including 1440px/390px layouts, retained research and conformity workflows, scenario selection, reflection/correction, source registry, measurement execution/export and conversation checks. New flows had no browser console errors or document overflow. Python/frontend lint and format, TypeScript production build, dependency compatibility and generated API contracts passed. Worker cancellation initially regressed, was fixed, and its regression test passed.

Local demo: all three cases completed, all simulation records persisted. Default measurement check at seed 42 with 1,000 independent repetitions:

| Design | Bias | RMSE | Empirical coverage |
|---|---:|---:|---:|
| 5 fixed-spread items | -0.019 | 0.770 | 95.6% |
| 5 adaptive items | -0.036 | 0.698 | 94.5% |
| 15 fixed-spread items | 0.005 | 0.563 | 95.4% |
| 15 adaptive items | -0.028 | 0.496 | 93.8% |

These are outputs under declared synthetic assumptions, not findings about human measurement quality. Run IDs and summaries are in `artifacts/evidence-demo-results.json`; desktop/mobile captures are in `artifacts/evidence-measurement-1440.png` and `artifacts/evidence-measurement-390.png`.

## Limits and next review

Cases and learning notes remain professionally unreviewed. Adult English fiction only; no jurisdiction-specific scope, reviewed translations or cultural equivalence. Scripted language coverage is limited. Live-model fidelity and repeated-run variability were not evaluated. Literal wording rules can miss nonverbal inferences and misread negation; development checks cannot detect all hallucinations or unsupported interpretations. Candidate held-outs are developer-authored, not independently sealed validation data.

WHO tool/manual reproduction, several repository/data licenses and third-party case rights remain unresolved or restricted; these resources remain references only. IPIP permission is recorded but no items were needed. catsim was not installed because existing NumPy supports this bounded exercise. No diagnosis, certification, human validity, clinical utility or learning benefit is claimed.

See [data-use decisions](EVIDENCE_AND_DATA_USE.md), [measurement methods](MEASUREMENT_LAB.md), [architecture and diagrams](ARCHITECTURE.md), and [review procedure](../evaluation/README.md).
