# Provenance and reuse

Implementation date: **4 October 2026**, Manila. This repository continues the MindLab psychology sandbox concept and controlled conformity slice. It is a fresh application implementation, not an independently invented concept. No hackathon eligibility, scientific novelty or human predictive validity is claimed.

## Preserved prior work

Reference project: `prior-project/Mindlab_PsychPlayhround`. Read its README, architecture, provenance, verification report, dependency manifests, participant/procedure code and tests. Its working-tree state was an uncommitted repository with untracked application files. No files in that workspace were changed, cleaned, moved or reset; its running service on port 8000 was left in place.

The reference informed the authorized-field boundary, independent paired sessions, fixture-based procedure checks, capture-before-validation, explicit retries, and safe CSV patterns. The new implementation was authored deliberately: new Pydantic contracts, JSON stimulus renderer, SHA-256 scheduling, transactional run-document storage with frozen-field guards, controller and API, new React dashboard and styling, setup scripts and independent tests. The participant wrapper follows the earlier boundary-capture approach; that is an adapted design, not a claim of original invention. The prior application's source tree was not transplanted.

The previous project's uv executable was initially used as a read-only installer. The verified setup script subsequently installed this project's own uv 0.12.22 in `.tools`; normal operation does not depend on the reference workspace.

Research root: `research-reference/MindLab-foundation-pack`. The handoff, context, compatibility notes, relevant catalog records and selected foundation/reuse assessments informed the boundaries. Catalog populations overlap; no summed unique-repository count is claimed. Research summaries are not installed software, validated results or permission to redistribute human data.

Hashes and paths of inspected source files are retained in `source-record.json`. These identify the reference state consulted, not authorship dates or evidence of event eligibility.

## Installed libraries

The application uses FastAPI, Uvicorn, Pydantic, SQLite (Python standard library), and **pydantic-ai-slim[openai] 2.54.0**. `FunctionModel` executes the authored offline behaviors; `OpenAIChatModel` implements the optional server-side provider adapter. OpenAI's SDK is installed as the provider extra. The dashboard uses React, React DOM and Lucide icons, with TypeScript and Vite build tooling. Working versions are pinned in `pyproject.toml`, `uv.lock`, `frontend/package.json` and `frontend/package-lock.json`.

Installed package license metadata and retained license texts are inventoried in `dependency-licenses.json` and `licenses/`. Dependency licenses apply to their respective components. No blanket license is inferred for study materials or the user's application.

PydanticAI source: https://github.com/pydantic/pydantic-ai (MIT). The earlier research inspected commit `66951321b89587235f432281eba909a30a585ffd`; the runtime here is the published 2.54.0 distribution, a distinct source/version reference. Its license is retained from that installed distribution.

Official references checked for this implementation:

- https://pydantic.dev/docs/ai/overview/install/
- https://pydantic.dev/docs/ai/guides/testing/
- https://vite.dev/guide/

## Shachi interface reference

Repository: https://github.com/SakanaAI/shachi

Inspected commit: `cdca203330b8ddac72975909d12c607cfaf62f3f`.

Read `src/shachi/base.py` from the preserved pinned reference checkout, including `Observation`, `Agent.step` and `Environment`. Its explicit observation and controller separation informed the design. No Shachi implementation was copied into the application and its full runtime was not installed. Its Apache-2.0 license is retained as reference-license evidence. Shachi's framework license is not permission for unrelated benchmark/data assets.

TinyTroupe, Concordia, EDSL, SweetBean, jsPsych, LangGraph, Inspect AI and LiteLLM were not installed. None is required for this slice.

## Study materials and results

The notebook-counting question, answer options, peer statements, and fixture behaviors were authored for this implementation. No published questionnaire, human participant dataset, research-paper stimuli, model weights, or third-party behavioral dataset were copied.

Offline outputs are labeled `scripted_fixture`. They are software fixtures, not model-generated evidence. The optional provider path would label fresh responses `model_output`, with provider/model settings retained. It has only been exercised using mock HTTP responses; no paid/live invocation, human pilot, clinical validation, deployment or publication occurred.

The experimental workspace implements fresh execution and inspection of saved records; experimental replay, live peers and model-based scoring remain unsupported. The later practitioner workspace adds its own authored fictional scenario, offline response tree, isolated model text adapter, rule-based educational reviewer, notebook and immutable conversation branches. These materials were newly authored for generic assessment preparation; no restricted tests or proprietary scoring manuals were reproduced. Professional review has not occurred. See `PRACTICE.md` for implementation and validation limits. The verification report concerns this repository's checks, not a rerun of the prior project's historical test claims.

## Public-copy path normalization

This distribution uses portable reference labels in place of personal absolute filesystem paths. Referenced private source trees are not bundled. Original reference SHA-256 hashes and the prior-work disclosure remain intact; this packaging step does not establish new authorship or hackathon eligibility.
