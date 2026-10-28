import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

// Exercise the actual SDK -> Express dependency, not a second test-only qs.
const webRequire = createRequire(
  new URL("../apps/web/package.json", import.meta.url),
);
const runtimeRequire = createRequire(webRequire.resolve("@copilotkit/runtime"));
const expressRequire = createRequire(runtimeRequire.resolve("express"));
const qs = expressRequire("qs");

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
