# Legacy Zod compatibility

Private adapter for SDKs that still require the Zod 3 root API. This package is
named `@aster/zod-v3-compat`, version 1.0.0; it does not claim to be an upstream
Zod release. The workspace override routes only Zod 3 requests here. Application
Zod 4 consumers retain their modern root API.

The root and `/v3` forward to official Zod 4.6.7's legacy API. Explicit modern
subpaths forward to their matching upstream entry. The dependency is pinned and
patched using [the maintained source patch](../../patches/zod@4.6.7.patch).

## Security maintenance

GHSA-mrhx-c7xc-m3w5 is fixed in the modern Zod implementation from 4.6.6.
Upstream 4.6.7 still ships a legacy v3 implementation that walks array/set children
after recording an exceeded upper bound. The patch backports early rejection to
legacy array `max`/`length` and set `max`/`size`, in ESM, CommonJS and TypeScript
source. Legacy maps have no size-bound API. Valid parsing and lower-bound errors
retain their existing behavior. Unbounded schemas still require request limits.

Reference: [upstream fix](https://github.com/colinhacks/zod/commit/a0ebf97).

On every Zod or SDK upgrade, reassess this adapter, regenerate the patch against
the exact upstream source and run `node --test scripts/dependency-security.test.mjs`
from the repository root, frozen installation, production audit, Web tests,
typecheck and production build. Check the standalone output as well. Never remove
the patch merely because the advisory scanner considers the package version safe.
Remove the adapter when all SDKs support the modern root API, after equivalent
compatibility and vulnerability tests pass. No advisory exclusions are used.
