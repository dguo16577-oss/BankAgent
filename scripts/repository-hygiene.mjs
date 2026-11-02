import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// Inspect only Git's tracked working tree. Never delete or scan ignored secrets.
const root = fileURLToPath(new URL("../", import.meta.url));
const files = execFileSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})
  .split("\0")
  .filter((name) => name && fs.existsSync(path.join(root, name)));
const tracked = new Set(files);
const failures = [];
const hashes = new Map();
let bytes = 0;
let links = 0;
let localEvidence = 0;
const localOnly =
  /^(?:artifacts|test-results|backups|deliverables|output|docs\/screenshots)\//;
const forbiddenDirectory =
  /(?:^|\/)(?:node_modules|\.next|\.venv(?:-mcp)?|__pycache__|\.pytest_cache|\.mypy_cache|dist|out|target(?:-[^/]+)?|coverage|playwright-report|\.local-backups|\.publish)(?:\/|$)/;
const obsolete = new Set([
  "CURRENT-VERSION.md",
  "HANDOFF-README.md",
  "RELEASE.md",
  "docs.zip",
  "apps/web/src/components/placeholder-page.tsx",
  "docs/architecture/web-system.md",
  "docs/plans/agent-web-improvement-plan.md",
]);

for (const name of files) {
  if (
    localOnly.test(name) ||
    forbiddenDirectory.test(name) ||
    /\.(?:zip|jar|dump|bak|tmp|pyc|class|log|sqlite|db|tsbuildinfo|pem|pfx|p12|key)$/i.test(
      name,
    ) ||
    (/(?:^|\/)\.env/.test(name) &&
      !/\.env(?:\.production)?\.example$/.test(name)) ||
    name.endsWith("README.HANDOFF.md") ||
    obsolete.has(name)
  ) {
    failures.push(`Local artifact or retired file tracked: ${name}`);
  }
  const data = fs.readFileSync(path.join(root, name));
  bytes += data.length;
  if (data.length > 10 * 1024 * 1024) {
    failures.push(`File exceeds 10 MiB; review distribution: ${name}`);
  }
  if (data.length) {
    const hash = crypto.createHash("sha256").update(data).digest("hex");
    hashes.set(hash, [...(hashes.get(hash) ?? []), name]);
  }
  if (!name.endsWith(".md")) continue;
  for (const match of data
    .toString("utf8")
    .matchAll(/!?\[[^\]\n]*\]\(([^)\n]+)\)/g)) {
    const target = match[1].split("#")[0].replace(/^<|>$/g, "");
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target)) continue;
    const resolved = path.posix.normalize(
      path.posix.join(path.posix.dirname(name), target),
    );
    if (localOnly.test(resolved)) {
      localEvidence += 1;
      continue;
    }
    links += 1;
    if (
      !tracked.has(resolved) &&
      !files.some((file) => file.startsWith(`${resolved}/`))
    ) {
      failures.push(`Missing tracked Markdown target: ${name} -> ${target}`);
    }
  }
}

let frozenDuplicateGroups = 0;
for (const group of hashes.values()) {
  if (group.length < 2) continue;
  // Immutable release snapshots must remain independently verifiable.
  if (
    group.every((name) =>
      /^contracts\/openapi\/(?:releases\/[^/]+\/)?public\.yaml$/.test(name),
    )
  ) {
    frozenDuplicateGroups += 1;
  } else {
    failures.push(`Exact duplicate files require review: ${group.join(", ")}`);
  }
}

console.log(
  JSON.stringify(
    {
      trackedFiles: files.length,
      bytes,
      checkedMarkdownLinks: links,
      localEvidenceReferences: localEvidence,
      preservedFrozenDuplicateGroups: frozenDuplicateGroups,
      failures,
    },
    null,
    2,
  ),
);
if (failures.length) process.exitCode = 1;
