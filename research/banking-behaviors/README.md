# B0 research artifacts

Start with [B0 report](../../docs/milestones/b0-report.md). This directory contains metadata and Aster-authored mappings, not vendored datasets or an Agent implementation.

## Reproduce

Python 3.10+, curl, and `scripts/requirements.txt` are required. From the project root:

```powershell
python research/banking-behaviors/scripts/fetch_sources.py
python research/banking-behaviors/scripts/inspect_sources.py
python research/banking-behaviors/scripts/normalize_sources.py
python research/banking-behaviors/scripts/build_coverage.py
python research/banking-behaviors/scripts/validate_audit.py
python research/banking-behaviors/scripts/verify_scope.py
```

Raw content is cached outside Git at `%USERPROFILE%/.cache/aster-b0`; override `B0_CACHE` if needed. Each manifest file has an immutable URL and SHA-256. Cache mismatch stops acquisition. Upstream code is parsed, never imported or executed. No keys or paid APIs are required.

`sources.yaml` intentionally uses JSON syntax, a YAML subset. Normal reproduction uses its frozen entries; `discover_sources.py` and `fetch_sources.py --lock` are authoring tools for a *new* source snapshot, not normal reproduction. Do not overwrite the B0 baseline when testing scope integrity.

`audit_config.py` and `normalize_sources.py` contain explicit reviewable semantic decisions. Generated family descriptions are paraphrases; source IDs, paths and URLs retain attribution. Banking77 IDs are one-based CSV data-row positions (`train:1` excludes the header). Language rows do not become executable behavior cases. Knowledge tasks can evidence multiple families; cross-domain source counts are therefore non-additive.

Candidate variants are clusters requiring future authored state/tool/assertion adapters. No count is a final benchmark freeze. Unknown-license raw data is never copied here.
