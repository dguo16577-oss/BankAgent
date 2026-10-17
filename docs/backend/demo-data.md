# Backend Demo data provenance — M13 / M14

M15: local PostgreSQL initializes these fixtures once using a transactional customer seed_version marker. Restart preserves mutations and does not reseed existing customers. Schema migrations contain no demo rows. In-memory fixtures remain for the explicit unit-test profile; see [PostgreSQL persistence](postgresql-persistence.md).

Backend local/test profiles load `services/banking-core/src/main/resources/demo/alex-initial.json`. This checked-in JSON is a backend-owned deterministic seed, mapped directly into Java domain values by DemoSeed. Java does not import or evaluate TypeScript, generated HTTP models or the browser MockBankingStore. Maven builds independently of pnpm and the Web source tree's runtime.

The initial snapshot was captured from the existing M0–M12 frontend fixtures: `demo-profile.ts`, `transaction-fixtures.ts`, and card attribution in `card-fixtures.ts`. The development-only script `node scripts/export-m13-fixture.cjs --check` compares the current initial MSW projection with the backend resource, including all fields, masks, currencies and references. Without --check it explicitly refreshes the snapshot; review any such change before accepting it. This script is not part of Java startup/build or frontend runtime.

## Contents

- Customer ID `usr_aster_alex`, display name Alex Chen.
- Fixed snapshot `2026-09-27T10:30:00+08:00`.
- Current: CNY 23842.31; pending 32.00; available 23810.31.
- Savings: CNY 8200.00.
- USD: 621.32; demo CNY equivalent 4411.37 at rate 7.10, as of `2026-09-27T10:00:00+08:00`.
- Total deposit equivalent: CNY 36453.68.
- All 61 initial transactions: 12 current September rows, 36 selected August rows and 13 historical analytics/recurring-evidence rows. No random generation or current-clock dependency.

Historical entries are a selected sample and their net effects are already included in opening balances. They are not reposted. Account balances are snapshots rather than a reconstruction of a complete historical ledger. Starbucks `txn_coffee` is the only pending debit, CNY 32.00, with null bookedAt. Tests reconcile pending totals, available balance, foreign conversion and cross-response projections.

## Profile boundaries and isolation

Only local/test loads this data. Default profile starts with empty repositories; its asOf comes from the injected Clock. No authenticated identity is created in any runtime profile. In particular, local seed availability does not bypass Spring Security.

M14 adds independent Java recipient fixtures in PaymentDomainConfiguration: Zhang San / Demo Harbour Bank / •••• 6018; Li Si / Demo Maple Bank / •••• 2046; Mom / Demo Harbour Bank / •••• 7732, all CNY. The additional customer_other recipient is test-only. Transfer mutations replace immutable repository state under a shared adapter lock; process restart reloads the initial fixtures and loses all mutations and idempotency records. Runtime never reads TypeScript.

The second customer `customer_other`, with one account and one card-attributed transaction, is constructed exclusively under `src/test` and injected by test configuration. It is not in the main fixture or packaged application. Alex lists never contain this second customer's values.

All stored sensitive display identifiers are already masked. Future PostgreSQL migration will introduce a backend database seed as the backend demo source; the frontend fixture remains a separate simulator until deliberate MSW replacement.
