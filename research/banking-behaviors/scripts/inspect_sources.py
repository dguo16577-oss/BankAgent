"""Inspect raw files without importing any upstream package or calling an LLM.
Produces a small metadata ledger in reports; raw prompts stay in the external cache.
Requires PyYAML (see requirements.txt) solely for OpenAPI/environment parsing.
"""
import ast
from collections import Counter
import csv
import json
from pathlib import Path
import re
import yaml
from fetch_sources import CACHE, ROOT, VERSION

def read(sid, path):
    return (CACHE / sid / "files" / path).read_text(encoding="utf-8")

def obj(sid, path):
    return json.loads(read(sid, path))

def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

def write_jsonl(path, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(x, ensure_ascii=False, sort_keys=True) + "\n" for x in rows), encoding="utf-8")

def actions(task):
    result = []
    for a in task["evaluation_criteria"].get("actions", []):
        args = a.get("arguments", {})
        name = args.get("agent_tool_name", args.get("discoverable_tool_name", a["name"]))
        if a["name"] in ("unlock_discoverable_agent_tool", "give_discoverable_user_tool"):
            continue
        result.append({"name": name, "arguments": args, "requestor": a.get("requestor", "assistant")})
    return result

def extract():
    rows = []
    stats = {}
    tau = obj("tau_indian_data", "tau2/domains/indian_banking/tasks.json")
    for t in tau:
        fam = re.search(r"family=([^;]+)", t["description"]["notes"])[1]
        rows.append(dict(dataset="tau_indian", source_task_id=t["id"], source_family=fam,
                         path="tau2/domains/indian_banking/tasks.json", tools=[a["name"] for a in actions(t)],
                         description=t["description"]["purpose"], axis="edge" if fam.startswith("edg") else "normal",
                         raw=t, kind="BEHAVIOR_DATA"))
    stats["tau_indian"] = {"tasks":len(tau), "native_families":len({r["source_family"] for r in rows}), "unit":"conversation", "reward_bases":dict(Counter("+".join(t["evaluation_criteria"]["reward_basis"]) for t in tau))}
    indic = []
    for p in sorted((CACHE / "indic_data/files/case_bank").rglob("*.json")):
        t = json.loads(p.read_text(encoding="utf-8")); indic.append(t)
        calls = t.get("gold", {}).get("tool_calls", [])
        tools = [a["tool"] for a in calls] or str(t.get("tool", "")).split("+")
        rows.append(dict(dataset="indic", source_task_id=t["case_id"], source_family=t["tool"], path=p.relative_to(CACHE / "indic_data/files").as_posix(), tools=tools, description=t.get("_variant_note", ""), axis=t["axis"], raw=t, kind="BEHAVIOR_DATA"))
    stats["indic"] = {"tasks":len(indic), "native_families":None, "native_tool_signatures":len({t["tool"] for t in indic}), "unit":"scripted case", "domains":dict(Counter(t["domain"] for t in indic)), "axes":dict(Counter(t["axis"] for t in indic)), "behaviors":dict(Counter(t["target_behavior"] for t in indic)), "mock_kinds":dict(Counter(m.get("kind", "unknown") for t in indic for m in t.get("mock", {}).values() if isinstance(m, dict)))}
    knowledge = []
    for p in sorted((CACHE / "tau_knowledge/files/data/tau2/domains/banking_knowledge/tasks").glob("task_*.json")):
        t = json.loads(p.read_text(encoding="utf-8")); knowledge.append(t)
        tools = [a["name"] for a in actions(t)]
        rows.append(dict(dataset="tau_knowledge", source_task_id=t["id"], source_family="+".join(sorted(set(tools))), path=p.relative_to(CACHE / "tau_knowledge/files").as_posix(), tools=tools, description=t["description"]["purpose"], axis="knowledge", raw=t, kind="BEHAVIOR_DATA"))
    aggregate = obj("tau_knowledge", "data/tau2/domains/banking_knowledge/tasks.json")
    aggregate_by_id = {t["id"]:t for t in aggregate}
    different = [t["id"] for t in knowledge if t != aggregate_by_id.get(t["id"])]
    stats["tau_knowledge"] = {"tasks":len(knowledge), "unit":"dual-control conversation", "native_families":None, "action_signatures":len({r["source_family"] for r in rows if r["dataset"]=="tau_knowledge"}), "aggregate_tasks":len(aggregate), "aggregate_different_ids":different, "has_initial_override":sum(t.get("initial_state") is not None for t in knowledge), "requires_documents":sum(bool(t.get("required_documents")) for t in knowledge), "reward_bases":dict(Counter("+".join(t["evaluation_criteria"]["reward_basis"]) for t in knowledge)), "unique_required_documents":len({d for t in knowledge for d in t.get("required_documents",[])})}
    # AST only; apply version overrides by class name without running attacker code.
    for kind, prefix in [("user_tasks","UserTask"), ("injection_tasks","InjectionTask")]:
        latest = {}
        for p in sorted((CACHE / "agentdojo/files/src/agentdojo/default_suites").glob("*/banking/" + kind + ".py")):
            text = p.read_text(encoding="utf-8")
            for node in ast.parse(text).body:
                if not isinstance(node, ast.ClassDef) or not node.name.startswith(prefix): continue
                block = ast.get_source_segment(text, node)
                tools = re.findall(r'function=["\']([^"\']+)', block)
                latest[node.name] = dict(dataset="agentdojo", source_task_id=node.name, source_family=node.name, path=p.relative_to(CACHE / "agentdojo/files").as_posix(), tools=tools, description="", axis="injection" if kind=="injection_tasks" else "normal", raw={"code":block}, kind="SECURITY_ADVERSARIAL" if kind=="injection_tasks" else "BEHAVIOR_DATA")
        rows.extend(latest.values())
        stats.setdefault("agentdojo", {})[kind] = len(latest)
    for split in ["train", "test"]:
        path = CACHE / "banking77/files/banking_data" / (split + ".csv")
        with path.open(encoding="utf-8", newline="") as file:
            utterances = list(csv.DictReader(file))
        for i, t in enumerate(utterances):
            rows.append(dict(dataset="banking77", source_task_id=f"{split}:{i+1}", source_family=t["category"], path=f"banking_data/{split}.csv", tools=[], description="", axis="language", raw=t, kind="LANGUAGE_DATA"))
        stats.setdefault("banking77", {})[split] = len(utterances)
    stats["banking77"].update(unit="utterance, NOT executable task", native_families=77)
    for p in sorted((CACHE / "fintoolbench/files/data/question").glob("*.jsonl")):
        data = [json.loads(x) for x in p.read_text(encoding="utf-8").splitlines() if x.strip()]
        stats["fintoolbench"] = {"tasks":len(data), "unit":"financial research query", "keys":sorted({k for x in data for k in x}), "native_families":None}
        for i,t in enumerate(data):
            rows.append(dict(dataset="fintoolbench", source_task_id=str(t.get("id",f"line:{i+1}")), source_family="financial_research", path=p.relative_to(CACHE / "fintoolbench/files").as_posix(), tools=[], description="", axis="research", raw=t, kind="TOOL_RESEARCH_DATA"))
    specs = {}
    for p in sorted((CACHE / "openbanking/files/dist/openapi").glob("*.yaml")):
        d = yaml.safe_load(p.read_text(encoding="utf-8"))
        specs[p.name] = {"version":d["info"]["version"], "license":d["info"].get("license"), "operations":sum(m.lower() in ["get","post","put","delete","patch"] for item in d.get("paths",{}).values() for m in item)}
    stats["openbanking"] = {"unit":"specification operations, NOT tasks", "tasks":0, "specs":specs}
    stats["tau_original"] = {"tasks":0, "unit":"banking subset", "note":"Inspected original airline/retail task files; no banking domain in this source tree. Do not duplicate tau_knowledge under a new tau3 label."}
    return rows, stats

def main():
    rows, stats = extract()
    write_json(ROOT / "reports/source-inventory.json", {"retrieval_date":"2026-09-29", "script_version":VERSION, "sources":stats})
    # Store no verbatim utterances, identities, or attacker instructions in project.
    write_jsonl(ROOT / "reports/raw-record-index.jsonl", [{k:v for k,v in r.items() if k not in ("raw","description")} for r in rows])
    print(json.dumps(stats, indent=2))

if __name__ == "__main__": main()
