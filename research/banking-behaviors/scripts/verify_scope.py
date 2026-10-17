"""Hash protected product inputs before/after the research-only audit."""
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / "research/banking-behaviors/reports/protected-files.json"
SCOPES = ["apps/web/src", "services/banking-core/src", "contracts", "infra", "docs/backend", "apps/web/e2e", "scripts"]

def snapshot():
    files = [p for directory in SCOPES for p in (ROOT / directory).rglob("*") if p.is_file()]
    files += [ROOT / name for name in ("package.json", "pnpm-lock.yaml", "services/banking-core/pom.xml")]
    return {p.relative_to(ROOT).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}

if __name__ == "__main__":
    current = snapshot()
    if "--record" in sys.argv:
        if OUT.exists():
            raise SystemExit("Baseline exists; refusing to overwrite")
        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(json.dumps(current, indent=2) + "\n", encoding="utf-8")
        print("Baseline", len(current))
    else:
        assert current == json.loads(OUT.read_text(encoding="utf-8")), "Protected application inputs changed"
        print("UNCHANGED", len(current), "protected files")
