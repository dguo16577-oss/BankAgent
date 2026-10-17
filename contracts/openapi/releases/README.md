# Release contract preservation

The `v1.0.0-demo/` files are the exact M24 contract files recovered from the existing source archive `artifacts/AsterBank-M22-source-20260929-094526.zip`. Despite that archive's filename, its embedded Customer version is 1.9.0 and its freeze matches the M24 report. B2 did not relabel the later working-tree contract as M24.

`pre-b2-working-tree/` preserves the actual input working tree: Customer 1.10.0, including the previously added Applications operations. B2 evolves that version additively to 1.11.0.

Canonical SHA-256 (repository contract-hash algorithm):

| Snapshot | Customer | Public |
| --- | --- | --- |
| M24 v1.0.0-demo | `602ddcc2ca1b3903034bab2979516220fbf3fb78c0212fa4158a4f0c7ac5f3e5` | `460387a9a26548941a692bcd7e7036e21d136b4d6a9cb570faa0a4fc1ac106ef` |
| Pre-B2 working tree | `95045d4aec5a80b1b677536a89b64f1cdb816caea205256dfd7789647045d94c` | same |
| B2 v1.1-dev | `9c57a2a135e1e3ac42f490b58c9b2bd9d183708b305c909db18076a843fcfead` | same |

Verify: `node scripts/verify-release-contracts.mjs`. Current freeze: `pnpm contract:check`.

These archive directories are excluded from formatting. Do not edit their files. The repository had no existing Git commits/tags at B2 start; no historical Git tag was fabricated. Development uses the configured `codex/` branch prefix. B2 does not declare a final release version or resolve the M24.1 vulnerability backlog.

## B3 development history

`b2-v1.1-dev` preserves the exact B2 Customer 1.11.0 / 47 operations, Public 1.2.0 / 9 and freeze manifest before B3. B2 Customer canonical hash: `9c57a2a135e1e3ac42f490b58c9b2bd9d183708b305c909db18076a843fcfead`. Current B3 Customer 1.12.0 / 52 is additive; Public and M24 snapshots stay unchanged. `scripts/verify-release-contracts.mjs` verifies all three historical snapshots.
