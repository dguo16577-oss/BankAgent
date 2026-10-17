# ADR 0005: Investment suitability and immutable order intent

Status: Accepted · M7

## Decision

Suitability is determined by Banking Core (currently the Wealth domain service in the MSW simulator), never by React or a future Agent. The initial deterministic rule permits product risk <= user risk. Alex Chen has demo risk R2. This eligibility rule does not constitute an investment recommendation.

An investment order requires valid suitability evidence for the same user/product and current product/risk-profile versions. NOT_SUITABLE, missing, expired or stale evidence cannot authorize intent preparation or execution.

InvestmentOrderIntent is immutable. It records exact product/account/suitability snapshots, principal, fees, total debit, projected available balance, hash and expiry. The user reviews and explicitly confirms that exact intent. Execute accepts only the intent reference/hash and an idempotency key, then revalidates every prerequisite and relevant snapshot before one atomic commit.

A future Agent cannot bypass suitability or execute directly against the database. It must call the same Banking APIs and preserve the user's review/confirmation boundary.

## Consequences

Successful demo purchases debit cash and add principal to the portfolio. They are investment contributions, not spending or performance gains. The Transaction Domain adds INVESTMENT_PURCHASE / INVESTMENT. Overview reads the authoritative portfolio and account projections. Historical spending and pending holds remain unchanged.

The simulator uses decimal strings and BigInt minor units, zero initial fees, immediate completion and cost-based value additions. It has no real market execution, live pricing/NAV, KYC, authentication, redemption or personalized advice. Future backend work must retain atomicity, idempotency, stale-state rejection and suitability enforcement while defining real execution/settlement semantics separately.
