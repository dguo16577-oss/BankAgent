"""B0 metadata discovery only; never execute upstream code. Python 3 stdlib."""
import hashlib
import json
import os
from pathlib import Path
import urllib.request
import subprocess

CACHE = Path(os.environ.get("B0_CACHE", str(Path.home() / ".cache/aster-b0")))
REPOS = {
    "tau_indian": "npci/TauIndianBankBench",
    "indic": "npci/IndicBankBench",
    "agentdojo": "ethz-spylab/agentdojo",
    "tau_knowledge": "sierra-research/tau2-bench",
    "banking77": "PolyAI-LDN/task-specific-datasets",
    "tau_original": "sierra-research/tau-bench",
    "openbanking": "OpenBankingUK/read-write-api-specs",
    "fintoolbench": "Double-wk/FinToolBench",
    "finagent": "t54-labs/FinAgent-Bench",
}

def get(url):
    # curl respects this Windows host's networking; no shell interpolation.
    return subprocess.run(["curl.exe" if os.name == "nt" else "curl", "--fail", "--silent", "--show-error", "--location", "--max-time", "45", "--retry", "2", url], check=True, capture_output=True).stdout

def main():
    CACHE.mkdir(parents=True, exist_ok=True)
    for sid, repo in REPOS.items():
        path = CACHE / sid / "discovery.json"
        if path.exists():
            metadata = json.loads(path.read_text(encoding="utf-8"))
        else:
            base = "https://api.github.com/repos/" + repo
            info = json.loads(get(base))
            commit = json.loads(get(base + "/commits/" + info["default_branch"]))
            tree = json.loads(get(base + "/git/trees/" + commit["sha"] + "?recursive=1"))
            metadata = {"repo": repo, "commit": commit["sha"],
                        "commit_date": commit["commit"]["committer"]["date"],
                        "created_at": info["created_at"], "license": info.get("license"),
                        "tree": tree}
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(metadata, indent=2), encoding="utf-8")
        print(sid, metadata["commit"], metadata["commit_date"], metadata["license"])
        for entry in metadata["tree"]["tree"]:
            p = entry["path"]
            if entry["type"] == "blob" and (sid in ("tau_indian", "indic") or
                    "banking" in p.lower() or p.lower() in ("readme.md", "license", "license.md")):
                print(" ", p, entry.get("size"))

if __name__ == "__main__":
    main()
