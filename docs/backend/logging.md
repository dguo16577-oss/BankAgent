# Banking Core logging — M12

Console logs contain an ISO timestamp with UTC offset, level, logger, `correlationId` and message. Local development uses the same human-readable format. No external logging stack is required.

`X-Correlation-Id` is accepted only if it matches `[A-Za-z0-9][A-Za-z0-9._-]{0,63}`. Missing, empty, overlong or unsafe values are replaced with a UUID. Responses include the selected ID. IDs are diagnostic labels, never identities or authorization credentials.

The highest-precedence servlet filter sets MDC before security and handling, then removes `correlationId` in `finally`, including exceptional paths. Tests inspect MDC inside the chain and after consecutive/failed requests. M12 uses synchronous servlet handling; future async executors must explicitly propagate and clear diagnostic context.

Never log request bodies, passwords, verification codes, authorization values, full PANs, full account identifiers or arbitrary exception messages. Unexpected-error advice logs a constant message with correlation ID, without the stack trace. Responses contain safe generated errors. Richer production diagnostics will require explicit redaction.

No request-body logger is installed. Startup diagnostics remain; default UserDetailsService auto-configuration is excluded, so no generated password is created or logged.
