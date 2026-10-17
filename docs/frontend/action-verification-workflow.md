# Inline action verification

`ActionVerification` is shared by transfer, recipient, scheduled payment, card, investment, recurring and product application review screens. It uses the generated Customer API through the API client; pages do not import fixtures.

Review → create bound challenge → render required factors → verify → execute with ActionAuthorization → original receipt/detail.

- PASSWORD renders an empty password input using the existing login password.
- SMS_OTP renders a six-character string input with numeric keyboard, paste support and masked phone.
- PASSWORD_AND_SMS_OTP renders both; both are submitted for one challenge.
- Card freeze retains ordinary confirmation.
- Demo profile exposes “View simulated SMS” inside this flow. Production availability hides it.
- The review terms remain visible. Verification does not navigate to Personal Center, Settings or a generic security route.
- Password/code inputs clear after submission. Passwords, codes and SMS contents are ephemeral component state, not URL parameters or persisted query caches.
- Busy locking prevents duplicate clicks. Failed factors show remaining attempts; expired/terminal challenges offer verification again. A business retry reuses its grant/idempotency key where allowed, and expired authorization can be replaced.

The backend is the authority: hiding or skipping this component never bypasses verification. Investment suitability is checked before verification and again by existing execution rules. Stopping recurring payments still does not cancel the merchant contract. Product applications remain persisted intake submissions, not card issuance or loan approval.

Testing covers factor-specific rendering, masked phone, unavailable demo inbox, invalid/expired verification, retry, leading-zero paste, same-route continuation and narrow layouts. Mock, real Spring and packaged journeys use the same browser helper to read each generated demo SMS; no fixed runtime security code is used.

Completed-review recovery remembers only the authenticated receipt's navigation path in browser session storage and clears it on login/logout/session cache reset. Receipt reads still enforce backend ownership. No authorization is persisted for a new execution. If that browser hint is absent, the completed review reports completion instead of asking to verify an already-executed action. Login return paths with a fragment use one document navigation to preserve the exact original fragment.
