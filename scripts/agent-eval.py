"""Run the offline Agent baseline from the repository root."""

from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from evals.run import main  # noqa: E402


if __name__ == "__main__":
    sys.argv.extend(["--output", str(ROOT / "artifacts" / "agent-eval" / "baseline-v1.json")])
    raise SystemExit(main())
