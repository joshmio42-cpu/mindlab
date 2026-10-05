# Evidence foundation and data use

Implementation review: 2026-10-04. Starting point: the adjacent `MindLab-Professional-Research-2026-10-04` package, including README, RESEARCH, BUILD-PLAN, REPOSITORIES and source-catalog. The expanded runtime catalog is `backend/workbench/knowledge/sources.json`, exposed at `/api/practice/sources` and in the scenario library. Unknown bibliographic fields remain explicitly unknown; a missing date is not a claimed publication date.

## Initial gap assessment

The active app already had the research workbench, probability-based conformity Monte Carlo, and one assessment-preparation practice case with notebook, rule-based debrief, persistence and replay. It did not have a usable source registry, objective-scoped learning references, disclosure-filtered model context, pre-feedback written reflection, correction/review workflow, multiple complete cases or measurement exercise. The research package was bibliographic/audit material, not runtime training data. Those were the gaps addressed by this slice; no older MindLab implementation was assumed.

## Four separate purposes

| Boundary | Contents | Runtime use |
|---|---|---|
| A: professional references | Source metadata and short original MindLab learning notes in `knowledge.py` | Objective-keyed retrieval for learner debrief; links and an explicit insufficient-evidence result; never sent to client |
| B: fictional cases | Original versioned case files validated by `cases.py` | Controller chooses initial facts and triggered disclosures; only permitted context and this conversation go to the client |
| C: measurement | Original 41-item parameter bank and NumPy-generated responses in `measurement.py` | Known-truth simulation; no copyrighted items, real scores or clinical records |
| D: review/evaluation | Original provisional rubric; independent-rating sidecars; separate candidate held-out transcripts | Debrief and diagnostics only; no rubric, key or held-out transcript enters the client prompt |

The app retrieves **our original explanatory notes with citations**, not full copyrighted manuals. These are fallible educational interpretations, not official guidance extracts or source-authored ratings. Source text is never executed or used as prompt instructions. Cases, config, reference notes and rubric freeze into a session record. Private notes and reflection remain local and excluded from client calls; note inclusion in debrief requires a separate explicit choice. Model calls require existing per-session authorization and send the permitted scenario/transcript to the configured provider. Model output can still hallucinate; withholding hidden facts is not a semantic guarantee.

## Permission decisions

All registry entries separately track code, publication, dataset and case-material permissions. No third-party repository code, case, test item, dataset, manual/tool text or training corpus was imported into the application. Bibliographic metadata from the supplied research catalog was retained with its original audit depth, dates, limitations and reuse notes. The table below records focused checks, not a blanket legal clearance.

| Priority reference | Evidence checked | Current use and decision |
|---|---|---|
| [WHO/UNICEF manual](https://www.who.int/publications/i/item/9789240105935) | Official 10 July 2025 metadata/overview available; manual download could not be inspected in this review | Foundational helping-skills reference only. No training tools or rubric copied; full reuse terms unresolved |
| [ITC Guidelines on Test Use](https://www.intestcom.org/page/15) and [copyright policy](https://www.intestcom.org/page/28) | Official indexed guidance and copyright information; direct page extraction was inconsistent | Assessment context/reasoning reference. No guideline text reproduced; redistribution/translation needs separate terms review |
| [Testing Standards](https://www.testingstandards.net/open-access-files.html) | Official open-access page and 2014 PDF available | Measurement concepts reference. Free access is not a blanket republication grant; no tables/tools copied |
| [ASPE](https://pmc.ncbi.nlm.nih.gov/articles/PMC5806371/) | Article copyright statement specifies CC BY 4.0 | Case-development process reference with attribution; no human-SP standard is claimed to validate AI |
| [Patient-Ψ](https://aclanthology.org/2024.emnlp-main.711/) | Primary paper metadata and repository available; research audit recorded MIT file/Apache badge discrepancy | Conceptual architecture reference only. Code, paper, requested dataset and third-party cases remain separate permission questions |
| [Consistent Client Simulation](https://aclanthology.org/2025.acl-long.1021/) | Primary paper metadata and repository available; prior audit found no code license | Conceptual separation of facts/state/dialogue only; original controller, no code or cases copied |
| [AnnoMI](https://github.com/uccollab/AnnoMI) | Author repository available; prior audit did not establish downstream reuse terms | Evaluation reference only; no transcripts imported |
| [CounselBench-Eval](https://huggingface.co/datasets/izi-ano/CounselBench-Eval) | Dataset card explicitly lists CC BY-NC-ND 4.0 | Citation only. No adaptation, commercial or training permission inferred |
| [CBT-Bench](https://aclanthology.org/2025.naacl-long.196/) | Primary paper and author repository available; dataset terms unresolved | Evaluation reference only; no benchmark cases imported |
| [IPIP permission](https://ipip.ori.org/newPermission.htm) | Owner explicitly places items/scales/inventories in the public domain | Eligible candidate for a later justified exercise; no items used here. Public domain does not establish local norms or validity |
| [catsim](https://github.com/douglasrizzo/catsim) | Repository available; supplied audit inspected BSD 3-Clause license/manifest | Candidate dependency, not installed. Existing NumPy suffices for the small original 1PL exercise |

Other catalog entries retain their **prior research audit** status and were not freshly cleared. An author/organization listed as not yet catalogued is not a claim that the source has no author. No fine-tuning was started. Original fiction and software produced for this project should not be treated as professionally reviewed or as licensed third-party test content.

## Scope and promotion limits

Students, psychometricians, psychologists and other professionals can record their intended role, setting and local scope. These fields provide rehearsal context; the app does not determine legal scope or credentials. The three adult cases currently support English only. International accessibility is a goal, not a claim of cultural equivalence or reviewed translations.

Professional source references do not validate our dialogue, rubric, simulations or learning benefit. The reviewer uses literal wording cues and can miss a problem or misread negation. It cites exact turns, distinguishes observation/interpretation, and permits correction rather than generating empathy, trust, diagnosis or competence scores. See `../evaluation/README.md` for independent review, candidate hold-outs, and promotion requirements.
