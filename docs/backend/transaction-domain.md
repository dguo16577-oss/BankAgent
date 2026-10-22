# Transaction read domain — M13

M14 adds TransactionMutationPort. Transfer execution appends one transaction to the existing repository and advances its revision atomically with the debit/receipt. Query selection and revision acquisition share a consistent read scope; rollback restores the revision and idempotent replay leaves it unchanged. See [Transfer domain](transfer-domain.md).

Implemented: `GET /customer/transactions`, `GET /customer/transactions/{transactionId}`. The generated API interfaces define HTTP bindings. Web adapters convert parameters to `TransactionFilter`; repository/application code performs filtering, sorting and keyset continuation. Controllers do not filter collections or calculate money.

## Models and ports

Domain: Transaction, TransactionId, status/direction/type/category enums, Merchant and Counterparty. Amount is non-negative domain Money; CREDIT/DEBIT carries direction. Merchant and Counterparty are distinct optional objects, never one ambiguous party field. Card attribution uses CardId and already-masked display information. Types/categories include the frozen INVESTMENT_PURCHASE / INVESTMENT enums, without implementing investment operations.

All business timestamps use `OffsetDateTime`; ordering/filtering compares instants. `occurredAt` is event time and `bookedAt` is posting time; pending bookedAt is null. HTTP mapping formats offset timestamps as strings to match the frozen contract. No business code calls no-argument now().

`TransactionQueryService` depends on TransactionRepository and TransactionAccountPort. InMemoryTransactionRepository scopes by CustomerId before applying TransactionFilter and sorting. Account application uses TransactionReadPort for recent activity. TransactionAccountPort returns the owning Account domain value without importing Account application; configuration wires it to AccountRepository. No circular query-service dependency exists.

## Filters

All frozen parameters are supported: accountId, cardId, from, to, status, direction, type, category, search, cursor, limit. Filters combine with AND across the complete customer-scoped collection before pagination. Foreign/unknown account or card filters return an empty list; they do not reveal another customer's resources.

- `from`: inclusive occurredAt instant; `to`: exclusive instant, strictly after from.
- Timestamps require offset and valid calendar/time values.
- Enums are case-sensitive uppercase.
- Search: trim, lowercase with Locale.ROOT, literal substring of title, merchant name or counterparty name.
- The frozen contract does **not** include reference search or a separate description field. Tests deliberately verify a reference-only term does not match. No fuzzy/semantic search is introduced.
- Limit defaults to 10; integers 1–50 only. Unsupported/duplicate parameters, invalid dates/enums/limits and searches over the contract limit return 400 `INVALID_QUERY`.

Framework argument/constraint failures also map to the existing ApiError envelope rather than 500s or implementation diagnostics.

## Stable cursor pagination

Order is occurredAt instant DESC, then opaque ID ASC by Unicode code-point comparison. Cursor payload uses a version byte, a query-scope digest, the last instant and last transaction ID; it is encoded as unpadded Base64 URL-safe text. There is no offset or page number.

The scope digest includes CustomerId, repository snapshot revision, normalized filters and limit. A supplied anchor must exist in the same scoped filtered snapshot with the exact timestamp. Continuation selects rows with an earlier instant, or the same instant and a greater ID. The service takes limit+1 to determine hasMore; nextCursor is null at the end.

Malformed/noncanonical Base64, missing fields, invalid timestamps/IDs, oversized input (>2048 characters), trailing payload, changed filters/limit/customer/snapshot and absent anchors return 400 `INVALID_CURSOR`. Cursor IDs have a defensive 256-character payload bound. The cursor is neither signed nor encrypted and does not grant authority: repository ownership checks always apply. Future mutation adapters must advance snapshot revision; durable snapshot, signature and expiry policies remain deferred.

Blocking regression compares every ID and its order from full filtered results with multi-page traversal: limits 1/2/7/10/50 across five filter sets, including timestamp ties. Tests require no omissions or duplicates. An authenticated HTTP traversal also covers all 61 Alex records.

## Security and detail

Unknown/foreign transaction details both return 404 `TRANSACTION_NOT_FOUND`. Account lookup for detail is scoped to the same customer. API exposes only masked identifiers; domain seed has no full PAN/account number, CVV, PIN or authentication secret. Controllers implement only the four intended generated operations; all other banking/Public APIs remain absent.

See [demo data](demo-data.md) for the independent backend fixture and [M13 report（历史资料）](../release-status.md#历史资料) for test results.
