import fs from "node:fs";
import path from "node:path";
const walk = (d) =>
  fs
    .readdirSync(d, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)],
    );
const files = walk("apps/web/src")
  .filter(
    (f) => /\.(tsx?)$/.test(f) && !f.includes(".test.") && !f.endsWith(".d.ts"),
  )
  .map((f) => path.resolve(f));
const graph = new Map();
for (const f of files) {
  const text = fs.readFileSync(f, "utf8");
  const edges = [];
  for (const m of text.matchAll(
    /(?:from\s*|import\s*\()\s*["']([^"']+)["']/g,
  )) {
    const raw = m[1];
    if (!raw.startsWith(".") && !raw.startsWith("@/")) continue;
    const base = raw.startsWith("@/")
      ? path.resolve("apps/web/src", raw.slice(2))
      : path.resolve(path.dirname(f), raw);
    const target = [
      base,
      base + ".ts",
      base + ".tsx",
      path.join(base, "index.ts"),
      path.join(base, "index.tsx"),
    ].find((p) => files.includes(p));
    if (target) edges.push(target);
  }
  graph.set(f, edges);
}
const reached = new Set();
function visit(f) {
  if (reached.has(f)) return;
  reached.add(f);
  (graph.get(f) ?? []).forEach(visit);
}
files.filter((f) => f.includes(path.join("src", "app"))).forEach(visit);
console.log(
  "Application-unreachable modules (review, not automatic deletion):",
  files
    .filter((f) => !reached.has(f))
    .map((f) => path.relative(process.cwd(), f)),
);
