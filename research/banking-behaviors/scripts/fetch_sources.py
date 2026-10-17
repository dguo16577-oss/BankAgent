"""Fetch immutable, checksum-verified B0 artifacts without running source code.

Normal usage: python fetch_sources.py. --lock is discovery for a NEW audit;
the checked-in sources.yaml is authoritative for reproducing this audit.
Raw artifacts live outside the project at ~/.cache/aster-b0 (B0_CACHE override).
The manifest uses JSON syntax, a valid YAML subset, to need only stdlib.
"""
import argparse
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import time
import urllib.parse
from discover_sources import CACHE, get

ROOT = Path(__file__).resolve().parents[1]
VERSION = "b0.1"

def selected(sid, p):
    if p in ("README.md", "LICENSE", "LICENSE.md", "CITATION.cff", "DISCLAIMER.md"):
        return True
    if sid == "tau_indian":
        return p.startswith(("src/tau2/domains/indian_banking/", "src/tau2/evaluator/")) or p == "scripts/fetch_data.py"
    if sid == "indic":
        return p.startswith("indicbankbench/harness/") or p in ("indicbankbench/tools.json", "indicbankbench/harness_tool_spec.json", "indicbankbench/prompts/base_system_prompt.txt")
    if sid == "agentdojo":
        return p.startswith("src/") and ("banking/" in p or p in ("src/agentdojo/default_suites/v1/tools/banking_client.py", "src/agentdojo/task_suite/task_suite.py"))
    if sid == "tau_knowledge":
        return ("banking_knowledge/" in p and "/documents/" not in p and "voice" not in p) or p.startswith("src/tau2/evaluator/") and p.endswith(".py")
    if sid == "banking77":
        return p.startswith("banking_data/")
    if sid == "tau_original":
        return p in ("tau_bench/envs/__init__.py", "tau_bench/envs/retail/tasks_test.py", "tau_bench/envs/airline/tasks_test.py")
    if sid == "openbanking":
        return p.startswith("dist/openapi/") and p.endswith(".yaml")
    if sid == "fintoolbench":
        return p.startswith("data/question/") or "eval" in p.lower() and p.endswith(".py") or p == "tools/tools_all_annotated.jsonl"
    if sid == "finagent":
        return p.endswith((".json", ".jsonl", ".yaml", ".py")) and not p.startswith(("results/", ".github/"))
    return False

def digest(b):
    return hashlib.sha256(b).hexdigest()

def fetch_one(sid, item, locking=False):
    target = CACHE / sid / "files" / item["path"]
    if not target.resolve().is_relative_to((CACHE / sid / "files").resolve()):
        raise ValueError("Unsafe artifact path")
    if target.exists():
        content = target.read_bytes()
    else:
        for attempt in range(3):
            try:
                content = get(item["url"])
                break
            except Exception as error:
                if attempt == 2:
                    raise RuntimeError(f"Unavailable {item['url']}: {error}") from error
                time.sleep(attempt + 1)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(content)
    actual = digest(content)
    if not locking and actual != item["sha256"]:
        raise RuntimeError(f"Checksum mismatch {sid}/{item['path']}; cache is not the locked input")
    return dict(item, sha256=actual, bytes=len(content))

def lock():
    sources = []
    for folder in sorted(CACHE.iterdir()):
        discovery = folder / "discovery.json"
        if not discovery.exists():
            continue
        d = json.loads(discovery.read_text(encoding="utf-8"))
        sid = folder.name
        paths = [e["path"] for e in d["tree"]["tree"] if e["type"] == "blob" and selected(sid, e["path"])]
        if sid == "tau_knowledge":
            paths += [e["path"] for e in d["tree"]["tree"] if "/documents/" in e["path"] and e["type"] == "blob"][:3]
            # Every required document of the actual runtime tasks, not only marketing samples.
            required = set()
            for p in (CACHE / sid / "files/data/tau2/domains/banking_knowledge/tasks").glob("task_*.json"):
                required.update(json.loads(p.read_text(encoding="utf-8")).get("required_documents", []))
            paths += [e["path"] for e in d["tree"]["tree"] if "/documents/" in e["path"] and Path(e["path"]).stem in required]
            paths = list(set(paths))
        files = [{"path": p, "url": f"https://raw.githubusercontent.com/{d['repo']}/{d['commit']}/{urllib.parse.quote(p)}"} for p in sorted(paths)]
        sources.append({"id": sid, "repository_url": f"https://github.com/{d['repo']}", "version": d["commit"], "version_date": d["commit_date"], "release_date": None, "release_date_note": "Pinned commit date; not represented as release date", "license_api": d["license"], "acquisition": "pinned-github-raw", "files": files})
    for sid, name in [("tau_indian_data", "NPCI/tau-indian-banking"), ("indic_data", "NPCI/IndicBankBench")]:
        metadata_path = CACHE / ("tau-hf.json" if sid == "tau_indian_data" else "indic-hf.json")
        if not metadata_path.exists():
            metadata_path.write_bytes(get("https://huggingface.co/api/datasets/" + name))
        metadata = json.loads(metadata_path.read_text(encoding="utf-8"))
        files = [{"path": e["rfilename"], "url": f"https://huggingface.co/datasets/{name}/resolve/{metadata['sha']}/{urllib.parse.quote(e['rfilename'])}"} for e in metadata["siblings"] if not e["rfilename"].startswith(".")]
        sources.append({"id": sid, "dataset_url": "https://huggingface.co/datasets/" + name, "version": metadata["sha"], "version_date": metadata.get("lastModified"), "release_date": metadata.get("createdAt"), "release_date_note": "HF repository creation, not verified paper release", "license_api": metadata.get("cardData", {}).get("license"), "acquisition": "pinned-huggingface-raw", "files": files})
    for source in sources:
        with ThreadPoolExecutor(max_workers=5) as pool:
            source["files"] = list(pool.map(lambda item: fetch_one(source["id"], item, True), source["files"]))
        print(source["id"], len(source["files"]), sum(f["bytes"] for f in source["files"]), flush=True)
    manifest = {"retrieval_date": "2026-09-29", "script_version": VERSION, "sources": sources}
    ROOT.mkdir(parents=True, exist_ok=True)
    (ROOT / "sources.yaml").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", action="store_true")
    args = parser.parse_args()
    if args.lock:
        lock()
        return
    manifest = json.loads((ROOT / "sources.yaml").read_text(encoding="utf-8"))
    for source in manifest["sources"]:
        with ThreadPoolExecutor(max_workers=5) as pool:
            list(pool.map(lambda f: fetch_one(source["id"], f), source["files"]))
        print(source["id"], "verified", len(source["files"]))

if __name__ == "__main__":
    main()
