# MindLab — a place to practice

> [!WARNING]
> **EDUCATIONAL PROTOTYPE · FICTIONAL SCENARIOS ONLY**
> No professional review or clinical validation has occurred. Do not use outputs for diagnosis, treatment, real-client assessment, or emergency support. Do not enter real client data or confidential information. Model replies may be incorrect; automated feedback is provisional. Read [intended use and limitations](USAGE.md).

**License:** [MIT](LICENSE) · **Status:** Educational prototype · [Security](SECURITY.md) · [Contributing](CONTRIBUTING.md)

See [GitHub distribution notes](GITHUB-READY.md) for included files, private-data exclusions, verification and publishing instructions.

A local educational practice environment for psychologists and psychometricians. Meet a fictional adult, choose learning objectives, rehearse an assessment-preparation conversation, keep private observations, reflect on a transcript, and replay an exchange. The existing experiment and Monte Carlo tools remain in **Research & rehearsal**.

**Educational prototype requiring review by qualified psychologists and psychometricians. No professional review or clinical validation is claimed.** The default client is an offline authored response tree, not an AI model or a psychological measurement. Optional model-generated fiction is labeled separately and requires explicit authorization. Neither predicts a real person's behavior.

This implementation was written on **4 October 2026** in a new directory and Git repository. It continues the existing MindLab concept and draws on the earlier implementation and research. A new implementation or repository does not establish hackathon eligibility or conceptual originality. See [provenance](docs/PROVENANCE.md).

## Start on Windows

Requirements: **Python 3.12**, **Node.js 22.12+** (Node 24 recommended), and npm. Tested with Python 3.12.14 and Node 24.15.0. Run these from this repository:

```powershell
.\scripts\setup.ps1
.\scripts\start.ps1
```

If Python is not on your PATH:

```powershell
.\scripts\setup.ps1 -PythonPath 'C:\path\to\python.exe'
```

If PowerShell blocks local scripts, run `powershell -ExecutionPolicy Bypass -File .\scripts\setup.ps1` and the corresponding start/check command. This does not change your system execution policy.

Setup installs uv 0.12.22 in `.tools`, resolves the retained `uv.lock` into `.venv`, runs `npm ci` from `frontend/package-lock.json`, checks Chromium availability, and builds the dashboard. It needs internet access. Normal offline rehearsals require no API key or internet connection. No fonts, analytics, or images are fetched by the dashboard.

The app starts at **http://127.0.0.1:8100** if available. The start script checks ports 8100–8120 and prints the selected URL; it also records the port in `.runtime/last-port.txt`. Use `-Port 8200` to select a different starting port. Run one server worker. A database lease prevents two controllers from using the same records simultaneously.

## Your first practitioner rehearsal

1. Open **Practitioner practice → Scenario library**. Meet Alex Morgan, a fictional adult anxious about an upcoming assessment. Only the practitioner-facing introduction is shown.
2. Select learning objectives appropriate to your role and local scope. Keep **Offline scripted demonstration** selected for a no-cost, no-network first run.
3. Choose **Begin practice**. Explain the general purpose, invite Alex's questions, and acknowledge details that need checking. The demo has limited language coverage and may repeat itself; it is not a general conversational model.
4. Use the **Private notebook** for observations or quotations, interpretations, and follow-up questions. Notes can reference a specific message. Save them explicitly; sending a response, leaving through workspace navigation, or ending also saves drafted notes. An unsaved response draft is not a recorded message.
5. Choose whether to include private notes in the debrief, then **End session & reflect**. Completed sessions are immutable. Review transcript-linked wording cues, alternative phrasing and authored fictional context not explored. The reviewer is an offline rule-based component in both conversation modes, not a model judge.
6. Select **Choose an exchange → Replay from here** on a practitioner message. The new branch copies the conversation before that message and lets you try a replacement. **Compare branches** displays both records. Differences are simulated possibilities, not causal evidence about a real client.
7. Reopen records from **History & replays**. The JSON download is labeled a fictional simulation record and includes private notes, even when excluded from the debrief. Treat it accordingly.

This first scenario covers general assessment preparation only. It uses no restricted tests, proprietary items, scoring manuals, established diagnoses or actual client records. There are no trust scores, empathy percentages or compliance rewards. Review [practice architecture and limits](docs/PRACTICE.md), the [professional review template](docs/SCENARIO_REVIEW_TEMPLATE.md), and [verification](docs/VERIFICATION.md).

## Existing experimental rehearsal

Switch to **Research & rehearsal** for the retained paired experiment workflow:

1. In **Study design**, edit the study title, researcher context, participant instructions, question, answer options, answer key, and scripted peer statements. The example is a newly authored notebook-counting task.
2. **Save & preview** creates an immutable study revision. Inspect the system instruction, neutral answer tokens, response schema, and both revision prompts. Choose an illustrative initial answer to preview history.
3. **Configure rehearsal**. The default procedure suite schedules three matched pairs, giving six separate sessions and up to twelve answers. It cycles hold, follow-displayed-peer, and reconsider-after-either-reask fixtures.
4. **Run rehearsal**. Each session makes its own initial invocation. Only its own exchange enters the scheduled revision. One arm sees scripted peers; the other receives the same re-ask without peers.
5. Compare responses, missing outcomes, descriptive accuracy and answer-change counts. Select a session or attempt to inspect actual framework messages, output-tool schema, raw response, error, and identifiers.
6. Download **Complete JSON**, **Sessions CSV**, and **Attempts CSV**. Saved records remain available after restarting. Editing a study never changes an old run.

Fixture profiles also exercise malformed JSON, unavailable tokens, transport failures, timeouts and cancellation. Those behaviors are deliberate checks, not AI judgments about the question. Invalid initial answers do not produce a second-stage session history. Missing outcomes remain null in JSON and blank in CSV.

The allocation seed controls the realized within-pair order. It does not seed remote models or imply reproducible remote answers. Option order is fixed throughout a run. Peers are scripted; live peer agents are not implemented.

**Study rehearsal** contains the implemented Monte Carlo tools: probability-generated participants, repeat studies, independent sample-size comparisons, process diagrams, distribution charts, cancellation, persisted configurations and JSON/CSV export. These are mathematical simulations, separately labeled from scripted procedure fixtures, scripted fictional clients and model-generated conversations. Human research data is not supported. Repeated model outputs are not a representative human population.

## Monte Carlo Study rehearsal

Open **Study rehearsal** to run offline probability-based participants against a saved study. Set initial correctness, baseline change, peer adoption, participants per condition, repeated studies and seed. Compare sample sizes, inspect the interactive process diagram, and export JSON or per-repetition CSV. All scripted peers must select one common incorrect answer.

The primary result is the treatment-minus-control final peer-answer selection difference, with a histogram and a **95% simulation interval**. These are outcomes under user-defined assumptions, not human evidence, measured AI behavior, significance tests or statistical power. Cancellation retains completed repetitions. Saved simulations appear in **Saved records** alongside the original invocation records.

See [the exact model, metrics, limits and reproduction contract](docs/STUDY_REHEARSAL.md). Defaults are 100 participants per condition and 500 repetitions, using NumPy 2.5.3 with independent seeded streams. Restart the server after updating the backend, and rebuild the dashboard (`npm run build` in `frontend`).

## Real-model adapter

The research server includes an OpenAI adapter using PydanticAI `OpenAIChatModel`. Practitioner conversations use a separate text-only HTTP adapter with no external tools, cross-session memory, retries or fallback. **Both have been verified only with mocked HTTP transport. No live or paid model call was made.** Offline modes remain the defaults.

To configure your own model, set these in the server's PowerShell session before starting:

```powershell
$env:MINDLAB_ENABLE_REMOTE = '1'
$env:MINDLAB_OPENAI_MODEL = '<explicit model identifier supported by your account>'
$env:OPENAI_API_KEY = '<your credential>'
.\scripts\start.ps1
```

Then select **Model-generated fiction** in practitioner practice and check the paid-call authorization box, or select the OpenAI source in experimental Rehearsal and explicitly run it. A model replay requires new authorization. This sends the fictional scenario and that session's conversation to the provider and may incur charges; practitioner private notes and reviewer material are excluded. There is no automatic fallback. Model-specific settings may be rejected by the provider; failures are retained. No actual model name is selected for you. `.env.example` is documentation; environment files are not loaded automatically.

Credentials stay server-side, are ignored by Git, and are excluded from exports. Wire records include request and successful response bodies, never headers; provider error bodies are excluded because they may echo sensitive information. A literal credential echo is redacted from captured bodies.

## Records and limits

SQLite defaults to `data/workbench.sqlite3`; set `MINDLAB_DATA_DIR` to another directory before launch to use a separate notebook. Records use SQLite WAL with full synchronous commits. The local database is not encrypted. Keep exported researcher notes and participant material under your own access controls.

Run snapshots include protocol/settings hashes, template and fixture versions, package versions, option mapping, allocation seed, planned order, actual attempt order, statuses, timestamps, and complete attempts. Every dispatched request is saved before invocation; raw responses are saved before validation. Completed attempts and terminal runs are write protected by the storage interface.

There are no automatic format repairs, persona regenerations, or hidden SDK retries. An optional single transport retry receives its own attempt ID and retry linkage; it may duplicate a call already received remotely. Timeouts are not retried. Cancellation stops future dispatches and attempts to stop the current call; remote delivery or billing cannot be undone.

After a crash, unfinished research work is marked interrupted on startup. Pending practice requests receive an interruption record and their sessions can be continued or ended manually. Saved responses remain available. Interrupted calls never resume or repeat automatically. Immutable branching replay is implemented for completed practitioner conversations; it is not implemented for experimental runs.

The UI is for one user on the local machine. It has local host/origin checks, not multi-user authentication. Multi-user hosting, cloud deployment, autonomous societies, live peers, model-powered reviewers and human-study deployment remain outside this slice. Three original adult cases and a provisional rule-based educational reviewer are implemented. Professional, cultural and language review remains outstanding.

## Development and verification

```powershell
.\scripts\check.ps1
```

This checks dependency compatibility, Python lint/format, backend and real-process recovery tests, OpenAPI/TypeScript contract consistency, frontend lint/unit tests, the production build, and Chromium workflows. Browser tests use a separate temporary database and block non-local browser requests. Backend tests prohibit live model calls, except explicit mocks that cannot reach the network.

For UI development, keep the backend running and run `npm run dev` in `frontend`. Vite uses port 5174 and proxies `/api` to port 8100; adjust `frontend/vite.config.ts` if you choose a different backend port.

After changing API schemas, run `.venv\Scripts\python.exe scripts\export_contract.py`, followed by `npm run contracts` in `frontend`. Retain both generated contract files. Test artifacts live in the ignored `artifacts` and `frontend/test-results` directories.

See [architecture](docs/ARCHITECTURE.md), [provenance and licenses](docs/PROVENANCE.md), and the [verification report](docs/VERIFICATION.md).


## Evidence-informed practice and measurement

The scenario library now includes assessment preparation, an uncertain fictional score report, and mixed motivation about an everyday change. Choose guided or reflective mode, record your intended role and local scope, rehearse, keep private notes, write reflection before feedback, inspect cited learning references, and replay from a preserved turn. Completed debriefs accept learner disagreements and professional corrections. Independent ratings for a case, rubric, transcript or cultural/language target stay concealed in the UI until two different local reviewer identifiers submit; adjudication then becomes available. Credentials and independence need an external coordinator.

**Measurement lab** compares fixed-spread and adaptive selection over an original synthetic 1PL bank at two lengths. Inspect bias, RMSE, empirical interval coverage, item exposure, saved runs and complete JSON exports. It shares the existing Monte Carlo worker, cancellation and persistence. **Conversation simulator checks** report deterministic repeated-run diagnostics by case against an opening-only baseline; no model calls occur.

The source registry records 33 research references plus three original cases, separate component permissions, provenance and feature use. No external dataset, case library, restricted test material or new dependency was imported. These English adult cases and learning notes remain professionally unreviewed. See [evidence/data use](docs/EVIDENCE_AND_DATA_USE.md), [measurement assumptions](docs/MEASUREMENT_LAB.md), [architecture](docs/ARCHITECTURE.md), and [review/held-out workflow](evaluation/README.md).
