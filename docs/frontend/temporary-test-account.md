# Temporary manual test account

For the explicit MSW preview (`pnpm dev:mock`) only:

- Login username: `admin`
- Password: `admin`
- Step-up demo code: `246810`

The login form maps the mock-only username to `admin@aster.local` to preserve the frozen email request format. This is an alias for the existing Alex demo profile, with ordinary AAL1 access and unchanged step-up requirements. It has no administrator privileges. The Spring backend and its credentials are unchanged.

To remove after manual testing, delete `temporaryTestCredential` and its acceptance in the mock security service, remove the mock username mapping/hint from the login form, and remove the related tests and translation. Existing Alex credentials remain available.
