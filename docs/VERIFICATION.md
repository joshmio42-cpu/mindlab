# Independent verification

## Practitioner practice slice — 4 October 2026

Implemented and verified the default assessment-preparation experience with Alex: select objectives and explicit response source, converse, save categorized private notes, choose note inclusion, end, inspect transcript-linked debrief, branch before a practitioner response, compare continuations, export and reopen history. Existing experiment and Monte Carlo work was preserved.

- **21 focused backend tests passed**. Coverage includes session/scenario isolation, private-note and other-session canaries, context allowlisting, explicit model authorization, model/source labels, authored scope interruptions, mocked provider requests without tools, one-request provider failure without fallback, credential redaction, cancellation and crash recovery, optimistic mutation conflicts, immutable configuration/transcripts/completed records, persisted branches and prefix/model settings, note inclusion consent, and feedback IDs resolving to actual transcript messages.
- Authored scenario evaluations check personal-history refusal, unresolved concern after polite wording, uncertainty after unsupported reassurance or leading wording, privacy and letter disclosures, scope returns, pausing, and checks for understanding with/without earlier explanations. These are bounded consistency examples, not evidence of psychological realism. Rule-based feedback examples were checked for transcript evidence, alternative phrasing and explicit interpretive limits; no clinical or educational effectiveness validation occurred.
- Full backend regression initially passed **87 tests**. After two additional cancellation/model-authorization tests and concurrent backend additions, **88 passed and one generated-contract check failed**. OpenAPI and TypeScript contracts were regenerated; the contract test plus all 21 practice tests then passed (**22 passed**). This distinguishes the final focused repair from a claim of a new all-repository check-script pass.
- **Seven Chromium workflows passed together**: two new desktop/mobile practice flows and five existing experiment/Monte Carlo workflows. Later UI checks caught a mobile reply outside the viewport; scrolling was corrected and both complete practice workflows passed again, including the viewport assertion and keyboard Home/End navigation among session views. The five research workflows also passed in that later regression run.
- Frontend unit tests (**2**), ESLint, Prettier, TypeScript/Vite build and Python dependency compatibility passed. Practice-owned Python lint and formatting passed. Existing non-failing Windows pytest cache-permission and Playwright color-environment warnings remain.
- Browser verification used 1440×1050 desktop and 390×844 mobile, reduced-motion mode, temporary SQLite databases and non-local browser-request blocking. It checked source labels, note exclusion/inclusion, actual JSON downloads, immutable original equality after replay, branch comparison, reopened records and no horizontal overflow. Chromium was installed after its required build was initially absent.
- Screenshots in `artifacts/practice-{desktop,mobile}-{library,conversation,debrief,replay}.png` were inspected. A shared research/practice CSS name collision was corrected by giving practice messages their own class names. Message replies now scroll into view. Saved sessions render their own scenario introduction/objectives snapshot.

The local practice preview is **http://127.0.0.1:8102/** with remote calls disabled and a separate database under `.runtime/practice-preview`. It does not replace the original research notebook. The preview was started after the build and its scenario endpoint and dashboard were checked.

**Concurrent-work boundary:** other work in this shared repository began adding a case registry, source material and practice-review routes during this implementation. Those edits were preserved; the verification above concerns the assessment-preparation path, not every additional case or review route. The retained `assessment-preparation.v1.json` is the original authored scenario; active registry snapshots may have a later version. Do not infer validation of those additional features from these counts.

A later integration check still passed ESLint, TypeScript/Vite and the generated API contract. At that checkpoint, Prettier reported formatting differences in the concurrently edited `Practice.tsx` and newly added `PracticeEvidence.tsx`; a blanket final formatting pass is not claimed for that moving shared workspace.

No live or paid model calls, real client records, human participants, professional review or clinical validation were used. Model conversational quality, broad prompt/wording robustness, screen-reader behavior and psychological realism remain unverified. Use [the professional review template](SCENARIO_REVIEW_TEMPLATE.md) before broader educational use.

## Original research baseline (historical)

Verified **4 October 2026** on native Windows with Python **3.12.14**, Node **24.15.0**, and Chromium through Playwright **1.63.0**. These checks belong to this new implementation, independently of the earlier MindLab results.

## Passing checks

The complete `scripts/check.ps1` command passed:

- **41 backend tests** covering protocol validation, participant exposure, independent histories, matched allocation, fixed token mapping, malformed/unknown responses, bounded transport retries, provider/local timeouts, cancellation, immutable revisions and completed records, storage recovery, exports, API boundaries and contract consistency.
- **2 frontend unit tests** covering validation-error presentation and lifecycle polling.
- **3 Chromium workflow tests** covering creation/editing, both participant previews, offline paired execution, inspection, actual JSON/CSV downloads, historical revision preservation, failure fixtures, cancellation and a complete mobile workflow.
- Python dependency compatibility, Ruff lint and formatting, ESLint, TypeScript, Vite production build, and generated OpenAPI/TypeScript consistency. A subsequent Prettier formatting check and all three browser workflows also passed after source formatting.

`scripts/setup.ps1 -PythonPath <Python 3.12 executable>` passed end to end: local uv installation, locked Python sync, `npm ci`, Chromium availability and production build. The npm install audit reported **0 known vulnerabilities** after updating the development lint dependencies.

The combined check emitted a non-failing pytest cache warning because the shared test environment ran under different Windows accounts. Test data itself used a fresh project-local temporary directory. No tests were skipped. Playwright's environment also emitted a color-output warning, which did not affect checks.

## Evidence and coverage

| Requirement | Verification |
| --- | --- |
| Installed participant library | PydanticAI 2.54.0 FunctionModel produced twelve structured answers in the three-pair suite |
| Separate initial answers | Six distinct initial attempts; each revision contains only its own initial exchange |
| Participant privacy | Researcher canaries and semantic option IDs absent from captured model-boundary requests |
| Preview fidelity | Shared renderer and exact response-schema comparison with captured offline requests |
| Allocation and mappings | Deterministic seed-specific pairing; reordering researcher options preserves token-to-ID scoring |
| No hidden repairs | Malformed JSON and unknown tokens remain raw invalid outcomes; no revision follows an invalid initial answer |
| Retry transparency | Every explicitly permitted transport retry has a new attempt ID, retry link and unchanged authorized history |
| Timeout handling | Local and provider timeouts retain missing outcomes and are not retried |
| Cancellation | In-flight attempt retained; remaining sessions not dispatched |
| Durable records | Fresh Store/API instances reopen completed runs unchanged |
| Real process recovery | A live Uvicorn process was killed during an invocation and restarted against the same database; the active record became interrupted without another call |
| Export consistency | Complete JSON, session CSV and attempt CSV preserve joins, nulls, Unicode, multiline text and formula-safe cells |
| Server provider boundary | Mocked OpenAI transport verifies structured schema, request/response body capture, absence of credential headers and zero hidden retries on HTTP 429 |
| Offline operation | Socket connections rejected in an offline test; browser requests outside loopback blocked |
| Responsive UI | Desktop 1440×1050 and mobile 390×844; full workflow and no document-level horizontal overflow |
| Source reference | Shachi checkout confirmed at `cdca203330b8ddac72975909d12c607cfaf62f3f` |

Screenshots generated in `artifacts/` were visually inspected for the study editor, participant preview, run comparison/inspector and mobile layout. Browser test records use isolated temporary databases rather than the researcher's local notebook.

## Issues found and resolved

- Explicit label associations and `aria-describedby` separate field names from textarea content and helper text.
- Preview schema construction accounts for PydanticAI's removal of nested property titles.
- Raw boundary responses remain untouched when the framework later attaches internal trace IDs.
- Provider timeout exceptions are distinguished from retryable connection errors.
- Unit and browser test discovery are separated; pytest uses a fresh local temporary directory in the check script.
- The sandbox could start the first browser test server but did not cleanly finish its teardown; the combined check was run outside the sandbox and cleanly completed all three browser tests.

## Unverified or unsupported

No live or paid model calls were made. Mocked provider tests do not prove real provider availability, account access, support for every model's settings, output quality, or latency. No human participants, behavioral validation, clinical validation, cloud deployment, publication or event registration was performed. No claim of hackathon eligibility is made.

At the original research baseline, live peer agents, autonomous controllers, model-based scoring, a reviewer assistant, generated personas, a multi-question experiment engine, human-study deployment, multi-user authentication, replay, automatic resume and continuation were not implemented. Practitioner conversation replay and a rule-based educational reviewer were added later as described above. Other operating systems, browsers and assistive technologies were not tested.

## Monte Carlo extension verification — 4 October 2026

The new Study rehearsal mode was verified separately from the original implementation above. Its model and interpretation contract are in [STUDY_REHEARSAL.md](STUDY_REHEARSAL.md).

- **68 backend tests passed together**: the original 41 tests plus 27 simulation tests. New coverage includes reproducibility independent of iteration order and included sample sizes; independent condition streams; all combinations of probability boundaries; exact denominators and zero-eligible adoption; no changes when both change probabilities are zero; peer-adoption saturation and intermediate-switch reversal; Monte Carlo means against analytic expectations; no systematic condition difference at zero adoption; spread versus sample size; limits; peer validation; frozen revisions/records; cancellation with a responsive API; failed/interrupted runs; and JSON/CSV consistency. The existing actual-process crash/restart test also passed.
- **2 frontend unit tests passed**; **5 Chromium workflows passed**, including the original three workflows and two new desktop/mobile simulation workflows. Checks cover running and reopening simulations, three sample sizes, histogram and explorer display, keyboard diagram interaction, JSON/CSV downloads, frozen assumptions, cancellation, reduced-motion mode and no document overflow at 390×844. The original revision test now starts a new study explicitly so its expected revision number does not depend on studies created by other tests.
- Dependency compatibility, TypeScript/Vite production build, frontend ESLint and Prettier passed. Ruff lint/format checks passed for all simulation-owned Python changes. OpenAPI and generated TypeScript contracts were regenerated and the backend contract consistency test passed.
- Visual browser inspection confirmed the results and branched diagram at the default desktop viewport and vertically stacked diagram at 390×844. Temporary viewport overrides were reset. Screenshots are in `artifacts/monte-carlo-results.png`, `artifacts/monte-carlo-diagram.png` and `artifacts/monte-carlo-mobile-diagram.png`.
- A preview run completed **1,500 simulated studies**, 500 each at 25, 100 and 400 participants per condition, with c=0.7, b=0.1, a=0.3 and seed=42. At the primary N=100 size, the mean peer-selection difference was **24.74 pp**, with **95% simulation interval 13.00–37.00 pp**. This is a procedure demonstration under fixed assumptions, not an empirical finding.

Validation caveats: concurrent Practice-mode backend files appeared during this task and were preserved. Their four files failed the broad Python formatting check at the time it ran; that unrelated work was not reformatted. Their added API routes also made the shared contract stale; regeneration resolved the contract failure before the final 68-test pass. The existing non-failing Windows pytest cache-permission warning remained. A blanket all-repository check-script pass is therefore not claimed for this extension.

The original port-8100 server could not be restarted because automatic approval review rejected that action without a specific reason. The verified preview runs on **http://127.0.0.1:8101/** against a SQLite backup in `.runtime/monte-carlo-preview`, leaving the original notebook untouched. Restart the original server to use the new backend with its normal `data/workbench.sqlite3` notebook. Preview runs are stored only in the preview copy. No live model calls were made.


## Evidence and measurement extension — 4 October 2026

See [implementation report](EVIDENCE_IMPLEMENTATION_REPORT.md) for the full 97-test backend pass, subsequent 26-test affected-suite pass including a new provenance regression, two frontend unit checks, nine desktop/mobile browser workflows, numerical results, and review limits. Lint, format, production build, dependency compatibility and contracts passed. Preview port 8103 uses a separate demo notebook. No live model calls or human professional ratings were made.
