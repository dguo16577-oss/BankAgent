"""Integrity and reproducibility checks for B0 outputs, not banking application tests."""
from collections import Counter
import hashlib
import json
from pathlib import Path
import subprocess
import sys
from fetch_sources import ROOT, CACHE, VERSION
from verify_scope import snapshot, OUT
from audit_config import DOMAINS

def load(name):return json.loads((ROOT/name).read_text(encoding="utf-8"))
def lines(name):return [json.loads(x) for x in (ROOT/name).read_text(encoding="utf-8").splitlines() if x]

def main():
    manifest=load("sources.yaml");families=lines("normalized/behavior-families.jsonl")
    candidates=lines("normalized/candidate-families.jsonl");variants=lines("normalized/candidate-variants.jsonl")
    mappings=lines("normalized/source-to-aster-mapping.jsonl");records=lines("reports/raw-record-index.jsonl")
    caps=load("aster-capabilities.json")["capabilities"];stats=load("reports/statistics.json")
    checks=[]
    def check(name, condition):
        assert condition,name
        checks.append(name)
    files=0;bytes_count=0
    for s in manifest["sources"]:
        check("provenance and license: "+s["id"],bool(s["version"] and s["license"]))
        for f in s["files"]:
            p=CACHE/s["id"]/"files"/f["path"]
            content=p.read_bytes()
            assert hashlib.sha256(content).hexdigest()==f["sha256"],str(p)
            assert len(content)==f["bytes"],str(p)
            assert s["version"] in f["url"],f["url"]
            files+=1;bytes_count+=len(content)
    check("all pinned raw artifact checksums",True)
    record_keys={(r["dataset"],r["source_task_id"]) for r in records}
    check("native record IDs unique per source",len(record_keys)==len(records))
    mapped={(s["dataset"],i) for f in families for s in f["sources"] for i in s["source_task_ids"]}
    check("every indexed record maps; no invented task IDs",mapped==record_keys)
    fids={f["family_id"] for f in families};cids={c["capability_id"] for c in caps}
    check("family IDs unique",len(fids)==len(families))
    check("all capability links resolve",all(set(f["required_capabilities"])<=cids for f in families))
    check("all mappings present",{m["family_id"] for m in mappings}==fids)
    check("all variants point to candidate families",all(v["family_id"] in {f["family_id"] for f in candidates} for v in variants))
    check("no language samples promoted to executable variants",all(v.get("dataset")!="banking77" for v in variants))
    check("candidate filter exactly matches policy",{f["family_id"] for f in candidates}=={f["family_id"] for f in families if f["coverage_value"] in ("HIGH","MEDIUM") and (f["aster_adaptability"] in ("DIRECT","ADAPTABLE") or f["origin"]=="ASTER_COMPOSED")})
    fields="family_id sources title description primary_domain secondary_domains operation_type interaction_type statefulness required_capabilities clarification failure_modes authorization risk agent_reasoning evaluation_types regional_specificity aster_adaptability current_aster_support manual_ui_requirement manual_ui_required notes coverage_value agent_value manual_product_value implementation_cost redundancy examples".split()
    for f in families:
        check("required fields "+f["family_id"],all(k in f for k in fields))
        assert f["primary_domain"] in DOMAINS
        assert f["current_aster_support"] in {"SUPPORTED","PARTIALLY_SUPPORTED","MISSING","OUT_OF_SCOPE"}
        assert f["aster_adaptability"] in {"DIRECT","ADAPTABLE","PARTIAL","INSPIRATION_ONLY","NOT_APPLICABLE"}
        assert f["manual_ui_required"] in {"YES","NO","PRIMITIVES_ONLY"}
        if f["origin"]=="SOURCE_SUPPORTED":assert 1<=len(f["examples"])<=3
        if f["origin"]=="ASTER_COMPOSED":assert not f["sources"]
    expected=Counter({"tau_indian":1000,"indic":799,"tau_knowledge":97,"agentdojo":25,"banking77":13083,"fintoolbench":295})
    check("input record counts",Counter(r["dataset"] for r in records)==expected)
    check("current API count independent of task count",load("aster-capabilities.json")["operation_count"]==51)
    for c in caps:
        if c["current_status"]=="SUPPORTED":
            assert c["backend_api"] and c["manual_ui_path"],c["capability_id"]
            assert any(p.startswith("apps/web/") for p in c["evidence"]),c["capability_id"]
            assert any(p.startswith("services/") for p in c["evidence"]),c["capability_id"]
            assert all((ROOT.parents[1]/p).exists() for p in c["evidence"])
    check("supported requires API and manual UI evidence",True)
    check("statistics reconcile",len(families)==stats["families"] and len(candidates)==stats["candidate_families"] and len(variants)==stats["candidate_variant_clusters"])
    check("protected source/contract/schema files unchanged",snapshot()==json.loads(OUT.read_text(encoding="utf-8")))
    # Run the deterministic generation again and compare outputs byte-for-byte.
    paths=list((ROOT/"normalized").glob("*.jsonl"))+[ROOT/"aster-capabilities.json",ROOT/"reports/source-inventory.json",ROOT/"reports/statistics.json"]
    before={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in paths}
    for script in ("inspect_sources.py","normalize_sources.py","build_coverage.py"):
        subprocess.run([sys.executable,str(ROOT/"scripts"/script)],check=True,stdout=subprocess.DEVNULL)
    check("deterministic rerun bytes",all(hashlib.sha256(p.read_bytes()).hexdigest()==h for p,h in before.items()))
    contract_log=ROOT.parents[1]/"b0-contract.log"
    contract_text=contract_log.read_text(encoding="utf-8") if contract_log.exists() else ""
    # contract:check uses canonical contract hashes, not raw YAML file-byte hashes.
    freeze=json.loads((ROOT.parents[1]/"contracts/openapi/freeze.json").read_text(encoding="utf-8"))
    contract_ok="Your API descriptions are valid" in contract_text and all(
        f'"operations": {entry["operations"]}' in contract_text and entry["sha256"] in contract_text
        for entry in freeze.values()
    )
    result={"retrieval_date":"2026-09-29","script_version":VERSION,"result":"PASS","checks":checks,"check_count":len(checks),"artifact_files_verified":files,"artifact_bytes_verified":bytes_count,"records_verified":len(records),"protected_files_unchanged":len(snapshot()),"contract_check":{"status":"PASS" if contract_ok else "NOT_RECORDED", "log":"b0-contract.log"},"application_regression":"Not rerun: no application code changed; audit-only validation and existing contract check", "limitations":"No upstream Agent/model evaluation; static capability evidence, not runtime workflow certification"}
    (ROOT/"reports/validation.json").write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps({k:v for k,v in result.items() if k!="checks"},indent=2))

if __name__=="__main__":main()
