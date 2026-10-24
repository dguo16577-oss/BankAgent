import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, unlinkSync, rmdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const directory = mkdtempSync(join(tmpdir(), "aster-generated-api-"));
const outputs = [];
try {
  for (const name of ["customer", "public"]) {
    const generated = join(directory, `${name}.d.ts`);
    outputs.push(generated);
    execFileSync(
      process.execPath,
      [
        resolve(root, "node_modules/openapi-typescript/bin/cli.js"),
        resolve(root, `contracts/openapi/${name}.yaml`),
        "-o",
        generated,
      ],
      { cwd: root, stdio: "inherit" },
    );
    const expected = readFileSync(generated, "utf8").replace(/\r\n/g, "\n");
    const actual = readFileSync(
      resolve(root, `apps/web/src/generated/${name}-api.d.ts`),
      "utf8",
    ).replace(/\r\n/g, "\n");
    if (actual !== expected)
      throw new Error(`${name} API types are stale. Run pnpm api:generate.`);
  }
  console.log(
    "Generated API types match (LF/CRLF normalized; no files rewritten).",
  );
} finally {
  for (const output of outputs) {
    try {
      unlinkSync(output);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  rmdirSync(directory);
}
