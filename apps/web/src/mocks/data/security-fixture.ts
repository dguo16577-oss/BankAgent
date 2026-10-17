// Local simulator values only. Never serialize these into API responses or logs.
export const securityFixture = {
  email: "alex@aster.local",
  password: "demo-password",
} as const;

// Temporary manual-test alias for the same demo customer; remove after testing.
export const temporaryTestCredential = {
  email: "admin@aster.local",
  password: "admin",
} as const;
