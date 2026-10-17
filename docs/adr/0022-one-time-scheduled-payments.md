# ADR 0022 — One-time scheduled payments

Status: accepted for B3 / v1.1-dev, 2026-09-30.

A ScheduledPayment is a distinct Payments aggregate, not a Transfer with a future date and not a merchant recurring/direct-debit record. B1 approves CREATE, AMEND and CANCEL with immutable review. Source account is fixed; amount, recipient and due time may change only before due, under expectedVersion and fresh confirmation.

Creation persists a durable mandate without reserving or debiting funds. Due execution revalidates current balance, account/recipient eligibility, exact approved destination/version, fees, integrity and policy. AAL2, when explicitly supplied, is consumed at the customer mutation; session expiry/logout does not cancel a confirmed instruction.

The application processor uses injected Clock. B1 selects explicit local/test operator execution, with no public debug endpoint and no production arrival SLA. A thin startup adapter calls the service and closes its own context. SQL owner coordination preserves existing B2 concurrency, followed by recipient → schedule → source locking. One database transaction includes actual Transfer settlement, Transaction, debit and final schedule/link. Infrastructure failures roll back; expected business failures are terminal FAILED. No JVM global locks or external workflow engine.

The shared Transfer settlement primitive remains authoritative for actual money movement. PostgreSQL Flyway owns schema, constraints and due indexes. UI stays in Payments. No recurring transfer series or arbitrary risk thresholds are introduced.
