# Product application intake — Customer revision 1.17.0

Product application intake was introduced after the M24 feature freeze and later expanded to savings and insurance. Revision 1.17.0 also accepts distinct mortgage and overdraft review requests without adding operations; Public remains at revision 1.2.0. Historical milestone reports describe their original revisions.

## Endpoints

- `GET /customer/applications`: owned applications, ordered by submittedAt descending, then opaque ID descending.
- `POST /customer/applications`: authenticated, CSRF-protected intake; requires `Idempotency-Key`. Returns 201, including exact replay.
- `GET /customer/applications/{applicationId}`: owned detail; unknown and other-customer IDs both return 404 `APPLICATION_NOT_FOUND`.

The request contains productId, accountId, contactEmail and true consent. The customer identity comes exclusively from the authenticated session. Requests cannot inject customerId or status. Product title/type and masked account information are read on the server and snapshotted at submission.

Every supported request includes `applicationDetails`, validated against its selected product. Debit and credit cards collect intended use; credit cards and borrowing requests collect employment status. Personal loans require monthlyIncome, requestedAmount, termMonths and purpose (CNY 1,000–200,000; 6/12/24/36 months). Mortgage requests require income, requested amount, property type and HOME_PURCHASE purpose (CNY 100,000–5,000,000; 120/240/360 months). Overdraft requests require income and a requested CNY 1,000–100,000 limit linked to an active owned current account, with no term or purpose. Income range is CNY 1–10,000,000. Flexible Savings collects a savings goal and planned monthly contribution. Life insurance collects requested coverage and beneficiary relationship; health insurance collects requested coverage and household size; travel insurance collects trip dates; home insurance collects requested coverage and property type. These are non-binding demo intake details, not eligibility or underwriting decisions. Unrelated fields are rejected, including fields added by a modified client. Every supported form retains the active owned CNY account and contact email. Money uses exact decimal strings. Investment products use suitability and order APIs instead of application intake.

## Persistence and safety

Flyway V7 owns product_applications; V13 adds the JSONB `application_details` column, with historical rows defaulting to an empty object; V17 extends product and amount constraints for mortgage and overdraft. Customer and account ownership have a composite FK; products reference public_catalog. PostgreSQL locks the owner row during submission. Customer/key and customer/product unique constraints prevent concurrent duplicates. Replaying the same canonical request returns the saved application; another body with the same key is 409 IDEMPOTENCY_KEY_REUSED. A new key for the same pending product is 409 APPLICATION_ALREADY_SUBMITTED. Keys are retained with the record. No automatic mutation retries occur in the UI.

Responses contain only server-masked account identifiers. Contact email and income are customer-private data and never included in public responses. No passwords, PANs, PINs, CVVs or identity-document scans are collected. The UI requires explicit review before submission. The API saves consent and timestamp.

## Deliberate processing boundary

SUBMITTED means received and awaiting review. There is no automated approval, reviewer console, account opening, card issuance, insurance underwriting/policy activation, shipping, credit bureau check, loan agreement, APR quote or disbursement. Submission does not mutate balances, transactions or cards. These later workflows need their own policies and contracts. No UI promises an approval or a review date. Savings and insurance intake uses a short-lived application intent and password verification, bound to the current session; card and loan verification policies are unchanged.

## Runtime

The same generated contract drives Spring, frontend and explicit MSW mode. Spring stores applications in PostgreSQL and survives restarts; MSW stores them in the existing demo snapshot and is not evidence of backend persistence. The UI reads the session on public pages to show the customer's name and routes to personal banking. Application links survive login through a restricted internal return path.
