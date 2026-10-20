"""Index UX4 evidence without starting services or reading credentials."""
from __future__ import annotations

import ast
import hashlib
import json
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "artifacts/ux4"
OUT.mkdir(parents=True, exist_ok=True)
FILES = [
    "services/agent-runtime/app/agent_v2/presentation.py",
    "services/agent-runtime/app/agent_v2/runtime.py",
    "services/agent-runtime/app/agent_v2/planner.py",
    "services/agent-runtime/app/agent_v2/completeness.py",
    "services/agent-runtime/app/agent_v2/bill_analysis.py",
    "services/agent-runtime/app/agent_v2/service_catalog.py",
    "services/agent-runtime/app/agui_adapter.py",
    "services/agent-runtime/acceptance/test_ux4_acceptance.py",
    "services/agent-runtime/tests/test_r1_postgres_recovery.py",
    "apps/web/src/features/agent/rich-presentation.tsx",
    "apps/web/src/features/agent/presentation-schema.ts",
    "apps/web/src/features/agent/service-catalog.ts",
    "apps/web/src/features/agent/copilot-workspace.tsx",
    "apps/web/src/features/agent/rich-presentation.test.tsx",
    "apps/web/vitest.config.ts",
    "playwright.s1-low-memory.config.ts",
    "scripts/ux4-chromium-smoke.mjs",
]
manifest = {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
            for name in FILES if (ROOT / name).is_file()}
tree = ast.parse((ROOT / "services/agent-runtime/tests/test_r1_postgres_recovery.py").read_text(encoding="utf-8"))
skips = [{"test_name": node.name, "skip_reason": "requires isolated PostgreSQL",
          "required_environment": "R1_TEST_DATABASE_URL to disposable PostgreSQL; psycopg installed",
          "security_critical": True, "can_run_locally": "conditional on isolated DB and commit headroom",
          "current_status": "TEST_ENVIRONMENT_BLOCKED", "line": node.lineno,
          "scope": "real PostgreSQL TaskStore, fake banking adapter; not Spring financial DB evidence"}
         for node in ast.walk(tree) if isinstance(node, ast.AsyncFunctionDef) and node.name.startswith("test_")]
for name, content in [
    ("source-manifest.json", {"recorded_at": datetime.now(timezone.utc).isoformat(), "sha256": manifest}),
    ("postgres-skips.json", skips),
]:
    (OUT / name).write_text(json.dumps(content, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
print(f"Indexed {len(manifest)} source files and {len(skips)} PostgreSQL cases; no services started.")
