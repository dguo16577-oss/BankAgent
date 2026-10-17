// Explicit development-time snapshot export only. Java runtime never loads TypeScript.
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const root = path.resolve(__dirname, "..");
const ts = require(path.join(root, "apps/web/node_modules/typescript"));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (name, parent, ...rest) {
  if (name.startsWith("@/"))
    name = path.join(root, "apps/web/src", name.slice(2));
  return resolve.call(this, name, parent, ...rest);
};
require.extensions[".ts"] = (module, filename) => {
  const result = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(result.outputText, filename);
};
const fixture = require(
  path.join(root, "apps/web/src/mocks/data/demo-profile.ts"),
);
const data = {
  customerId: fixture.demoProfile.user.id,
  displayName: fixture.demoProfile.user.displayName,
  asOf: fixture.demoProfile.asOf,
  accounts: fixture.getDemoAccounts().accounts.map((a) => ({
    ...a,
    openedAt: fixture.getDemoAccount(a.id).openedAt,
  })),
  transactions: fixture.demoTransactions,
};
const output = path.join(
  root,
  "services/banking-core/src/main/resources/demo/alex-initial.json",
);
if (process.argv.includes("--check")) {
  require("node:assert/strict").deepEqual(
    JSON.parse(fs.readFileSync(output, "utf8")),
    data,
  );
  console.log(
    `Fixture parity: ${data.accounts.length} accounts, ${data.transactions.length} transactions`,
  );
} else {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, JSON.stringify(data, null, 2) + "\n");
  console.log(
    `Exported ${data.accounts.length} accounts, ${data.transactions.length} transactions`,
  );
}
