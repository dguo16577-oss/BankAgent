import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";
import { readFileSync } from "node:fs";

// Exercise the actual SDK -> Express dependency, not a second test-only qs.
const webRequire = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const runtimeRequire = createRequire(webRequire.resolve("@copilotkit/runtime"));
const expressRequire = createRequire(runtimeRequire.resolve("express"));
const qs = expressRequire("qs");
const validators = {
  sdk: runtimeRequire("zod"),
  modern: webRequire("zod"),
  legacy: webRequire("zod/v3"),
};

for (const [entry, z] of Object.entries(validators)) {
  for (const kind of ["max", "length", "set"]) {
    test(`${entry}: oversized ${kind} fails before child parsing`, () => {
      let visited = 0;
      const element = z.preprocess((value) => {
        visited++;
        return value;
      }, z.string());
      const schema =
        kind === "set"
          ? z.set(element).max(2)
          : kind === "length"
            ? z.array(element).length(2)
            : z.array(element).max(2);
      const result = schema.safeParse(
        kind === "set" ? new Set([1, 2, 3]) : [1, 2, 3],
      );
      assert.equal(result.success, false);
      assert.equal(visited, 0);
      assert.equal(result.error.issues.length, 1);
      assert.equal(result.error.issues[0].code, "too_big");
    });
  }
  test(`${entry}: oversized async arrays do not schedule children`, async () => {
    let visited = 0;
    const element = z.preprocess(async (value) => {
      visited++;
      return value;
    }, z.string());
    const result = await z.array(element).max(1).safeParseAsync([1, 2, 3]);
    assert.equal(result.success, false);
    assert.equal(visited, 0);
    assert.equal(result.error.issues.length, 1);
  });
  test(`${entry}: normal transforms and field errors are preserved`, () => {
    assert.deepEqual(
      z
        .array(z.string().transform((s) => s.trim()))
        .min(1)
        .max(2)
        .parse([" a ", "b"]),
      ["a", "b"],
    );
    assert.equal(
      z.object({ amount: z.string() }).safeParse({ amount: 10 }).success,
      false,
    );
  });
}

test("SDK legacy records remain compatible with JSON Schema conversion", () => {
  const z = validators.sdk;
  const schema = z
    .object({ amount: z.string(), tags: z.record(z.string()) })
    .strict();
  assert.deepEqual(
    schema.parse({ amount: "10.00", tags: { note: "项目聚餐" } }),
    { amount: "10.00", tags: { note: "项目聚餐" } },
  );
  const { zodToJsonSchema } = runtimeRequire("zod-to-json-schema");
  const result = zodToJsonSchema(schema);
  assert.equal(result.properties.amount.type, "string");
  assert.equal(result.additionalProperties, false);
});

test("ESM legacy entry rejects excessive children before preprocessing", async () => {
  const { z } = await import(
    pathToFileURL(webRequire.resolve("zod/v3").replace(/\.cjs$/, ".js")).href
  );
  let visited = 0;
  const result = z
    .array(
      z.preprocess((v) => {
        visited++;
        return v;
      }, z.string()),
    )
    .max(1)
    .safeParse([1, 2]);
  assert.equal(result.success, false);
  assert.equal(visited, 0);
});

test("legacy upper-bound failures cannot run outer refinements", () => {
  const z = validators.sdk;
  let visited = 0;
  const result = z
    .array(z.string())
    .max(1)
    .superRefine(() => {
      visited++;
    })
    .safeParse(["a", "b"]);
  assert.equal(result.success, false);
  assert.equal(visited, 0);
  assert.equal(z.array(z.string()).length(2).safeParse(["a"]).success, false);
  assert.deepEqual(
    z
      .set(z.string())
      .size(2)
      .parse(new Set(["a", "b"])),
    new Set(["a", "b"]),
  );
});

test("SDK facade preserves shared legacy identity and modern subpaths", () => {
  assert.equal(validators.sdk.ZodObject, validators.legacy.ZodObject);
  assert.equal(runtimeRequire("zod/v4").ZodObject, validators.modern.ZodObject);
  assert.equal(typeof runtimeRequire("zod/v4/core").$ZodType, "function");
  assert.equal(typeof runtimeRequire("zod/v4-mini").string, "function");
});

test("production dependency graph contains no Zod 3 package or ignored advisories", () => {
  const lock = readFileSync(
    new URL("../pnpm-lock.yaml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(lock, /^  zod@3\./m);
  const workspace = readFileSync(
    new URL("../pnpm-workspace.yaml", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(workspace, /ignoreCves|ignoreGhsas|auditConfig/);
  assert.match(workspace, /patchedDependencies:/);
});

test("actual CopilotKit v2 handler initializes and serves agent info", async () => {
  const { HttpAgent } = webRequire("@ag-ui/client");
  const { CopilotRuntime, createCopilotRuntimeHandler } = webRequire(
    "@copilotkit/runtime/v2",
  );
  const runtime = new CopilotRuntime({
    agents: { aster: new HttpAgent({ url: "http://127.0.0.1:1/unused" }) },
  });
  const handler = createCopilotRuntimeHandler({
    runtime,
    basePath: "/api/copilotkit",
  });
  const response = await handler(
    new Request("http://localhost/api/copilotkit/info"),
  );
  assert.equal(response.status, 200);
  const info = await response.json();
  assert.ok(JSON.stringify(info).includes("aster"));
});

for (const encodeValuesOnly of [false, true]) {
  test(`comma serialization handles untrusted own toString (encodeValuesOnly=${encodeValuesOnly})`, () => {
    const input = JSON.parse('{"a":[{"toString":"x"}]}');
    assert.doesNotThrow(() => {
      assert.equal(
        typeof qs.stringify(input, { arrayFormat: "comma", encodeValuesOnly }),
        "string",
      );
    });
  });
}

test("ordinary bank filters survive query-string serialization unchanged", () => {
  const input = {
    currency: "CNY",
    note_query: "项目聚餐",
    limit: "50",
    from: "2026-09-01T00:00:00+08:00",
    to: "2026-10-01T00:00:00+08:00",
  };
  assert.deepEqual(qs.parse(qs.stringify(input)), input);
});
