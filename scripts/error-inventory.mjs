import fs from "node:fs";
import YAML from "yaml";
const c = YAML.parse(
    fs.readFileSync("contracts/openapi/customer.yaml", "utf8"),
  ),
  p = YAML.parse(fs.readFileSync("contracts/openapi/public.yaml", "utf8"));
const sourceFiles = fs
  .readdirSync("apps/web/src/mocks/bank")
  .filter((n) => n.endsWith(".ts") && !n.includes(".test."));
const source = sourceFiles
  .map((n) => fs.readFileSync("apps/web/src/mocks/bank/" + n, "utf8"))
  .join("\n");
const codes = c.components.schemas.ApiError.properties.code.enum;
const family = (code) =>
  /^(SESSION|UNAUTHENTICATED|INVALID_CREDENTIALS)/.test(code)
    ? "AUTH"
    : /^(STEP_UP|ACTION_AUTHORIZATION|INSUFFICIENT_AUTH|INVALID_STEP_UP)/.test(
          code,
        )
      ? "SECURITY"
      : code.startsWith("ACCOUNT")
        ? "ACCOUNT"
        : code.startsWith("TRANSACTION") || code === "INVALID_CURSOR"
          ? "TRANSACTION"
          : code.startsWith("CARD") || code === "NO_CARD_CHANGES"
            ? "CARD"
            : code.startsWith("RECURRING")
              ? "RECURRING"
              : /^(INVESTMENT|SUITABILITY|PRODUCT_NOT|RISK_PROFILE)/.test(code)
                ? "WEALTH"
                : /^(TRANSFER|RECIPIENT|CURRENCY|INSUFFICIENT_FUNDS|INVALID_AMOUNT)/.test(
                      code,
                    )
                  ? "TRANSFER"
                  : "SHARED";
const fallback = {
  TRANSACTION_NOT_FOUND: [404],
  INTERNAL_ERROR: [500],
  INVALID_QUERY: [400],
  INVALID_CURSOR: [400],
  UNAUTHENTICATED: [401],
  STEP_UP_CHALLENGE_FAILED: [409, 422],
  INVALID_STEP_UP_CODE: [422],
};
let doc =
  "# Machine-readable error codes — M11\n\nCustomer has 66 codes in one `{code, message}` envelope; optional details are not currently defined. Public has three separate reference-content codes. Domain grouping below is documentation, not a second DTO. Status sets are from service/handler implementations.\n\n| Domain | Code | HTTP status |\n| --- | --- | --- |\n";
for (const code of codes) {
  const re = new RegExp('fail\\(\\s*"' + code + '"\\s*,\\s*(\\d+)', "g");
  const statuses = [
    ...new Set([
      ...(fallback[code] ?? []),
      ...[...source.matchAll(re)].map((m) => Number(m[1])),
    ]),
  ].sort();
  doc += `| ${family(code)} | \`${code}\` | ${statuses.join(" / ") || "See handler (shared envelope)"} |\n`;
}
doc +=
  "\n## Interpretation\n\n400 is malformed/unsupported input; 401 is missing, expired or revoked session; 403 is insufficient or incorrectly bound authorization; 404 is unavailable resource (including another session’s challenge); 409 is lifecycle/hash/state/idempotency conflict; 422 is a validly shaped request rejected by a domain rule; 500 is persistence/service failure.\n\n`STEP_UP_CHALLENGE_FAILED` uses 422 on the attempt that exhausts the retry budget and 409 when attempting to verify an already terminal challenge. `ACTION_AUTHORIZATION_MISMATCH` uses 409 for a challenge request referencing different immutable terms and 403 for an execution grant bound to another session/intent/hash. These are intentional context differences. The four executors share `IDEMPOTENCY_KEY_REUSED` (409). No generic replacement codes were introduced.\n\nPublic: `PUBLIC_CONTENT_NOT_FOUND` (404), `INVALID_PUBLIC_QUERY` (400), `PUBLIC_CONTENT_UNAVAILABLE` (500). The shared client now retains Public codes instead of replacing them with an unclassified HTTP error.\n";
fs.writeFileSync("docs/audit/error-codes.md", doc);
const comparable = (x) =>
  JSON.stringify(x, (k, v) =>
    ["description", "example", "examples"].includes(k) ? undefined : v,
  );
const seen = new Map(),
  dupes = [];
for (const [name, s] of Object.entries(c.components.schemas)) {
  const sig = comparable(s);
  if (seen.has(sig)) dupes.push([seen.get(sig), name]);
  else seen.set(sig, name);
}
fs.writeFileSync(
  "docs/audit/schema-equivalence.json",
  JSON.stringify(
    {
      customer: dupes,
      retainedReason:
        "Separate domain lifecycles and execution request names are intentionally retained; no GenericIntent is introduced.",
      unreachableButUsed: [
        "SecurityEvent: store audit events and security tests; internal-model marker",
      ],
    },
    null,
    2,
  ) + "\n",
);
