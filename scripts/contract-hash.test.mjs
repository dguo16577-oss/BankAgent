import { test } from "node:test";
import assert from "node:assert/strict";
import { hash } from "./contract-hash.mjs";
test("freeze hash ignores formatting, object key order and editorial prose", () => {
  assert.equal(
    hash({
      type: "object",
      description: "old",
      required: ["id", "name"],
      properties: { id: { type: "string" }, name: { type: "string" } },
    }),
    hash({
      properties: { name: { type: "string" }, id: { type: "string" } },
      required: ["name", "id"],
      description: "new",
      type: "object",
    }),
  );
});
test("freeze hash detects required fields, enums and paths", () => {
  assert.notEqual(
    hash({ properties: { summary: { type: "string" } } }),
    hash({ properties: { summary: { type: "integer" } } }),
  );
  assert.notEqual(
    hash({ schemas: { description: { type: "string" } } }),
    hash({ schemas: { description: { type: "integer" } } }),
  );
  const baseline = {
    paths: { "/customer/accounts": {} },
    schemas: { status: { enum: ["ACTIVE"] }, account: { required: ["id"] } },
  };
  for (const changed of [
    { ...baseline, paths: { "/customer/account": {} } },
    {
      ...baseline,
      schemas: { ...baseline.schemas, status: { enum: ["ACTIVE", "CLOSED"] } },
    },
    {
      ...baseline,
      schemas: {
        ...baseline.schemas,
        account: { required: ["id", "balance"] },
      },
    },
  ])
    assert.notEqual(hash(baseline), hash(changed));
});
test("freeze hash includes authentication and idempotency requirements", () => {
  assert.notEqual(
    hash({ "x-session-required": true }),
    hash({ "x-session-required": false }),
  );
  assert.notEqual(
    hash({ parameters: [{ name: "Idempotency-Key", required: true }] }),
    hash({ parameters: [{ name: "Idempotency-Key", required: false }] }),
  );
});
