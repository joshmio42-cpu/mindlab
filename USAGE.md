# Intended use and limitations

> [!WARNING]
> **Educational prototype — fictional scenarios only.** MindLab has not undergone professional review or clinical validation. Do not rely on it for diagnosis, treatment, real-client assessment, crisis response, or decisions about an actual person. Do not enter real client records, identifying information, credentials, or confidential material.

## What this project supports

Local educational rehearsal with original fictional adults; reflection on wording; private learning notes; replaying an exchange; and inspecting synthetic experiments and measurement assumptions. Qualified educators should review the content and its suitability for their setting before using it in instruction.

## What the outputs mean

- Offline client replies are authored rules. They have limited language coverage and can repeat or misinterpret wording.
- Optional model replies are generated fiction and may invent facts, contradict a case, or respond incorrectly. They do not predict a real person's behavior.
- Debrief feedback uses fallible wording rules, even when the conversation uses a model. It is not a clinical opinion, professional competency assessment, validated grade, or proof that a skill was present or absent.
- Synthetic measurement and Monte Carlo results describe programmed assumptions. They are not human research findings, validated norms, diagnoses, or evidence of educational effectiveness.
- Citations and original learning notes do not establish professional endorsement. Candidate evaluation material is not independent validation.

## Data and provider use

Use fictional or non-identifying learning material only. Local SQLite records are not encrypted. Exports can contain private notebook entries, even when those notes were excluded from the debrief. Review exports before sharing them.

Remote model use is optional, requires server configuration and explicit session authorization, sends that fictional scenario and conversation to the provider, and may incur charges. Practitioner private notes and reviewer material are excluded from the client context. Review the provider's terms and your own data requirements before enabling it. Do not publish credentials, databases or local runtime files.

The application is designed for one user on a local machine. Its local host/origin checks are not multi-user authentication. Do not expose the server publicly without a separate security and deployment review.

## License and scope of these notices

Original MindLab code and documentation are provided under the [MIT License](LICENSE), without warranty. Third-party components retain their own licenses, recorded in [the license inventory](docs/dependency-licenses.json) and [license notices](docs/licenses). These intended-use warnings describe the prototype's limitations; they do not add restrictions to or replace the MIT License. Cited external material is not relicensed by this project.

See [provenance](docs/PROVENANCE.md), [verification](docs/VERIFICATION.md), and [the professional review template](docs/SCENARIO_REVIEW_TEMPLATE.md).
