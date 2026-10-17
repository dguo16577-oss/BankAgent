# Product-specific application forms (2026-10-02)

The public product detail page retains the application flow on the same page after sign-in. The shared account and contact-email fields remain, followed by fields relevant to the selected product. All applications are saved for review only; no account, card, policy or loan is automatically created.

| Product             | Additional intake fields                                           |
| ------------------- | ------------------------------------------------------------------ |
| Everyday debit card | Intended card use                                                  |
| Travel credit card  | Intended card use, employment status, monthly income               |
| Personal loan       | Employment status, monthly income, requested amount, term, purpose |
| Flexible Savings    | Savings goal, planned monthly contribution                         |
| Life Insurance      | Requested coverage, beneficiary relationship                       |
| Health Insurance    | Requested coverage, people to cover                                |
| Travel Insurance    | Trip start and end dates                                           |
| Home Insurance      | Requested coverage, property type                                  |

The frontend sends these fields through the generated Customer contract as `applicationDetails`. The mock API and Spring backend reject missing or unrelated fields. The Spring application binds the reviewed body to its intent hash, stores the details as JSONB through Flyway V13, and returns them on the owned application detail API. The form does not ask for identity documents, full account or card numbers, health diagnoses, a physical address, or a password. Existing account information is server-masked.

The fields are a competition-demo intake, not a regulated application checklist. An eventual operational flow needs verified identity and contact data, product-specific disclosures and consent, underwriting or eligibility decisions, reviewer tooling and retention controls. Those are not implied by the `SUBMITTED` status.

## Manual check

Open each product URL under `/products/{slug}` and choose **Apply now**. After signing in, the form remains on that product page. Check the relevant fields in the table, enter an email, review the exact details, complete the existing verification, and confirm that **My applications** shows the same values after a reload. An existing application for that customer and product will show its submitted detail instead of a second form. Try a 320 px viewport to check horizontal fit. Do not use real personal, medical or payment-card data in this demo.

Live read-only browser check on 2026-10-02: signed in as Lin against the local Spring backend, opened all eight product forms, confirmed their distinguishing fields, and checked no horizontal overflow at 320 px. Screenshots: `docs/screenshots/product-form-savings-320.png` and `docs/screenshots/product-form-travel-1440.png`. This check did not submit applications or change customer data.
