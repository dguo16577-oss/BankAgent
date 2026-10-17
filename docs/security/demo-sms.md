# Demo SMS delivery

`SmsSender` separates delivery from verification. `DatabaseDemoSmsSender` writes an outbox row with customer, challenge, E.164 destination, message body and timestamp. The body contains the generated code because it simulates an external SMS channel. This table is confidential demo delivery data, not verification evidence. Only successful challenge verification issues authority.

The challenge stores a BCrypt OTP hash, never its plaintext verification value. Normal challenge/profile/business APIs and security events do not return the code. The explicit demo inbox returns a masked phone and message to the authenticated owner of that challenge in the same session. Foreign customers/sessions cannot read it.

| Runtime                          | Delivery                    | Customer inbox |
| -------------------------------- | --------------------------- | -------------- |
| `demo` (including packaged demo) | Database outbox             | Enabled        |
| `local` / `test` without `demo`  | Database outbox             | Disabled       |
| Default / production-oriented    | No real provider configured | Disabled       |

Without an enabled SMS adapter, SMS-required challenge creation fails closed with `VERIFICATION_UNAVAILABLE` (503). Demo retrieval is unavailable (404); authentication still runs first for anonymous calls. Production does not silently skip SMS. The UI reads the backend availability flag and hides the simulated-SMS button outside demo. Explicit MSW mode is a simulated demo runtime.

For a manual B4 backend demo, use the existing local configuration with profiles `demo,local`; do not enable this combination in production. Start against a backed-up development database, allowing Flyway to apply V10. No real SMS is sent. The original account password is entered by the tester; it is never prefilled by the verification component.

No universal runtime OTP exists. Java uses SecureRandom; MSW uses Web Crypto. Tests may inject `012345` to prove leading-zero handling. Real browser tests retrieve each freshly generated message from the demo endpoint. Repeated clicks reuse a pending challenge; there is no resend facility in B4. Real provider integration, delivery retention/cleanup, resend cooldown, phone lifecycle and broader anti-abuse controls remain future work.
