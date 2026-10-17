# Scheduled Payments Web workflow

Payments links to `/app/payments/scheduled` and `/app/payments/scheduled/new`. Details live at `/app/payments/scheduled/{id}`, edits at its `/edit` child. No operation redirects to Personal Center.

Create: select ACTIVE CNY source, explicit recipient ID, decimal amount, time labeled Asia/Shanghai UTC+08:00 and optional note → server review → confirm → scheduled detail. The receipt explains that no funds were debited or reserved. Date/time conversion appends +08:00 explicitly; browser timezone never determines execution day.

Modify: detail → change amount/time/recipient/note → new server review bound to current version → confirm. Source account is fixed. Cancel: detail → review cancellation → confirm. Terminal items remain visible with failure information or a link to the executed Transfer receipt. Failed items do not silently retry. Backend is authoritative for the due-time cutoff and stale state.

All reads and writes use feature hooks → generated OpenAPI types/API client → backend (or explicit MSW test runtime). Stable per-review idempotency keys support safe network retry. Errors and loading/empty states are visible. English/Chinese translation uses the existing locale system. Cards/Buttons reuse shadcn primitives; 320/390/1440 viewport checks cover overflow.

Manual create/modify/cancel correspond exactly to future API-callable customer primitives. The internal operator is banking infrastructure; it is neither a hidden Agent action nor a user-page control. Demo copy says local processing is required and does not promise automatic arrival.
