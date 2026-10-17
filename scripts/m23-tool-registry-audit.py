"""Export the exact model-visible Agent v2 registry without credentials or bank data."""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "services" / "agent-runtime"))

from app.agent_v2.tools import ToolRegistry  # noqa: E402


def main() -> None:
    tools = ToolRegistry(None).visible()
    names = [tool["name"] for tool in tools]
    assert len(names) == len(set(names))
    assert not any(name.startswith("execute_") for name in names)
    destination = ROOT / "artifacts" / "m23-tool-registry-audit.json"
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(
        json.dumps({"count": len(tools), "tools": tools}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"{len(tools)} model-visible tools -> {destination}")


if __name__ == "__main__":
    main()
