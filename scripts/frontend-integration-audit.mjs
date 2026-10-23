import assert from "node:assert/strict";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import YAML from "yaml";
import { format, resolveConfig } from "prettier";
const require = createRequire(import.meta.url);
const ts = require("../apps/web/node_modules/typescript");
const directory = "apps/web/src/lib/api";
const found = new Map();
for (const name of readdirSync(directory).filter(
  (n) => n.endsWith(".ts") && !n.includes(".test."),
)) {
  const file = `${directory}/${name}`;
  const source = ts.createSourceFile(
    file,
    readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  function visit(node) {
    if (
      ts.isCallExpression(node) &&
      ["apiGet", "apiPost"].includes(node.expression.getText(source))
    ) {
      const paths = (arg) => {
        if (ts.isStringLiteral(arg)) return [arg.text];
        if (ts.isTemplateExpression(arg)) {
          let path = arg.head.text;
          for (const span of arg.templateSpans)
            path +=
              (span.expression.getText(source).startsWith("encodeURIComponent(")
                ? "{id}"
                : "") + span.literal.text;
          return [path];
        }
        if (ts.isConditionalExpression(arg))
          return [...paths(arg.whenTrue), ...paths(arg.whenFalse)];
        return [];
      };
      const resolvedPaths = paths(node.arguments[0]);
      assert.ok(resolvedPaths.length, `Unresolved API call: ${file}`);
      const method =
        node.expression.getText(source) === "apiGet" ? "GET" : "POST";
      for (const path of resolvedPaths)
        found.set(`${method} ${path.split("?")[0]}`, file);
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const rows = [];
const notUsedByWeb = [];
for (const scope of ["customer", "public"]) {
  const contract = YAML.parse(
    readFileSync(`contracts/openapi/${scope}.yaml`, "utf8"),
  );
  for (const [path, verbs] of Object.entries(contract.paths))
    for (const method of ["get", "post"]) {
      if (!verbs[method]) continue;
      const key = `${method.toUpperCase()} ${path.replace(/\{[^}]+\}/g, "{id}")}`;
      if (!found.has(key)) {
        notUsedByWeb.push([
          method.toUpperCase(),
          path,
          verbs[method].operationId,
        ]);
        continue;
      }
      rows.push([
        method.toUpperCase(),
        path,
        verbs[method].operationId,
        found.get(key),
      ]);
    }
}
assert.equal(
  found.size,
  rows.length,
  "Unexpected client endpoint outside frozen contract",
);
function files(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(`${dir}/${e.name}`) : [`${dir}/${e.name}`],
  );
}
for (const file of files("apps/web/src").filter(
  (f) =>
    /\.(ts|tsx)$/.test(f) &&
    !/\/(mocks|test|generated)\//.test(f) &&
    !f.includes(".test."),
)) {
  const source = readFileSync(file, "utf8");
  if (file !== "apps/web/src/lib/api/bootstrap.ts")
    assert.ok(
      !/from\s+["'][^"']*mocks|import\(["'][^"']*mocks/.test(source),
      `Production fixture import: ${file}`,
    );
  if (file === "apps/web/src/lib/api/receipt-navigation.ts") {
    assert.match(source, /const prefix = "aster-receipt:"/);
    assert.doesNotMatch(source, /localStorage|indexedDB|persistQueryClient/);
  } else if (file === "apps/web/src/lib/i18n/locale.tsx") {
    assert.match(source, /localeStorageKey = "aster\.locale"/);
    assert.doesNotMatch(source, /sessionStorage|indexedDB|persistQueryClient/);
  } else if (file === "apps/web/src/lib/api/thread-recovery-hint.ts") {
    assert.match(source, /aster-agui-inflight-/);
    assert.match(source, /hintSchema\.parse\(value\)/);
    assert.match(source, /JSON\.stringify\(hint\)/);
    assert.match(source, /\.strict\(\)/);
    assert.doesNotMatch(source, /localStorage|indexedDB|persistQueryClient/);
    const ast = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let fields;
    function inspectHint(node) {
      if (
        ts.isVariableDeclaration(node) &&
        node.name.getText(ast) === "hintSchema"
      ) {
        const strict = node.initializer;
        assert.ok(
          strict &&
            ts.isCallExpression(strict) &&
            ts.isPropertyAccessExpression(strict.expression),
        );
        assert.equal(strict.expression.name.text, "strict");
        const objectCall = strict.expression.expression;
        assert.ok(ts.isCallExpression(objectCall));
        assert.ok(ts.isPropertyAccessExpression(objectCall.expression));
        assert.equal(objectCall.expression.name.text, "object");
        assert.equal(objectCall.expression.expression.getText(ast), "z");
        const shape = objectCall.arguments[0];
        assert.ok(shape && ts.isObjectLiteralExpression(shape));
        fields = shape.properties
          .map((property) => {
            assert.ok(ts.isPropertyAssignment(property));
            return property.name.getText(ast);
          })
          .sort();
      }
      ts.forEachChild(node, inspectHint);
    }
    inspectHint(ast);
    assert.deepEqual(fields, ["assistantCount", "status", "taskId"]);
  } else {
    assert.ok(
      !/(?:localStorage|sessionStorage)\.setItem|indexedDB\.open|persistQueryClient/.test(
        source,
      ),
      `Persistent browser state: ${file}`,
    );
  }
}
const customerCount = rows.filter((r) => r[1].startsWith("/customer/")).length;
const publicCount = rows.filter((r) => r[1].startsWith("/public/")).length;
const doc = `# Typed frontend client audit\n\nGenerated by \`pnpm integration:check\` from frozen contracts and TypeScript call expressions. Web calls cover ${customerCount} Customer and ${publicCount} Public operations. ${notUsedByWeb.length} contract operations have no direct Web client call. Every Web call maps to the contract and uses the shared transport. Production fixture imports and financial browser persistence are rejected; conditional mock bootstrap is the sole allowed import boundary. Receipt navigation stores only an internal path under the aster-receipt: session key. The strict thread-recovery hint permits only taskId, status and assistantCount; messages, amounts, receipts and authorization are not persisted. Backend authorization remains required; browser hints never prove bank state. Runtime/network evidence remains a separate browser test.\n\n## Called by Web\n\n| Method | Frozen path | Operation | Client |\n| --- | --- | --- | --- |\n${rows.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n\n## No direct Web call\n\n| Method | Frozen path | Operation |\n| --- | --- | --- |\n${notUsedByWeb.map((r) => `| ${r.join(" | ")} |`).join("\n")}\n`;
writeFileSync(
  "docs/frontend/client-integration-audit.md",
  await format(doc, {
    ...(await resolveConfig("docs/frontend/client-integration-audit.md")),
    parser: "markdown",
  }),
);
console.log(
  `Frontend integration audit: ${rows.length} Web calls match the contract; ${notUsedByWeb.length} operations have no direct Web call; no production fixture imports or persistent financial browser cache (receipt navigation hint excepted).`,
);
