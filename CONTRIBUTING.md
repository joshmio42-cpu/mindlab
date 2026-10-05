# Contributing

Read [the README](README.md), [architecture](docs/ARCHITECTURE.md), [intended use](USAGE.md), and [provenance](docs/PROVENANCE.md) first.

1. Install the documented Python and Node versions, then run `scripts/setup.ps1` on Windows.
2. Keep changes focused, preserve original records and source labels, and use fictional data in examples and tests.
3. Run `scripts/check.ps1` before proposing a change. This covers backend, contracts, frontend and Chromium workflows without paid model calls.
4. When API schemas change, follow the README's contract-generation instructions and include the generated files.
5. Describe what changed, why, how you verified it, and remaining limitations in your pull request.

Do not commit credentials, local data, private transcripts, installed dependencies or generated test artifacts. New third-party content needs its provenance and applicable license recorded. Do not present scripted or synthetic outputs as human evidence, or describe unreviewed content as professionally validated.

Contributions to original project material are submitted under the repository's MIT License; third-party notices must be retained.
