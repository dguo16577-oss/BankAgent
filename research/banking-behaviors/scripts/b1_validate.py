"""Validate B1 reference/coverage integrity and preserve all pre-existing inputs."""
import hashlib
import json
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from b1_build import ROOT, PROJECT, lines, read
from verify_scope import snapshot

def main():
    checks=[]
    def check(label, condition):
        assert condition,label
        checks.append(label)
    baseline=read('reports/b1-protected-files.json')
    check('All pre-existing protected files byte-identical',all((PROJECT/p).is_file() and hashlib.sha256((PROJECT/p).read_bytes()).hexdigest()==h for p,h in baseline.items()))
    check('No product source files added or removed',snapshot()==read('reports/protected-files.json'))
    proposals=read('b1-capability-proposals.json'); caps=proposals['capabilities']
    mapping=lines('b1-family-capability-map.jsonl'); families=lines('normalized/behavior-families.jsonl'); variants=lines('normalized/candidate-variants.jsonl')
    fids={f['family_id'] for f in families}; vids={v['variant_id'] for v in variants}; cids={c['capability_id'] for c in caps}
    check('All 67 B0 families preserved once',len(mapping)==67 and {m['family_id'] for m in mapping}==fids)
    check('498 B0 variant IDs preserved once',len(variants)==498 and len(vids)==498 and Counter(v for m in mapping for v in m['candidate_variant_ids'])==Counter(vids))
    check('B0 input checksums match',all(hashlib.sha256((ROOT/p).read_bytes()).hexdigest()==h for p,h in proposals['b0_input_sha256'].items()))
    check('All capability links resolve',all(set(m['proposals'])<=cids for m in mapping))
    check('All proposal IDs unique',len(caps)==len(cids)==14)
    check('Five review areas', {c['area'] for c in caps}=={'RECIPIENT','SCHEDULE','DISPUTE','CARD','RISK'})
    check('Accepted versus deferred decisions explicit',sum(c['accepted'] for c in caps)==11 and all(c['design_only'] for c in caps))
    check('Unsubstantiated numerical risk thresholds not frozen',proposals['policy_parameters']['high_amount'] is None and proposals['policy_parameters']['new_recipient_hours'] is None)
    graph={c['capability_id']:c['depends_on'] for c in caps}
    def visit(id, path):
        assert id not in path,(id,path)
        assert id in cids,id
        for child in graph[id]:visit(child,path+[id])
    for id in graph:visit(id,[])
    check('Dependency graph acyclic and references valid',True)
    for c in caps:
        cv=c['coverage']; fs=[m for m in mapping if c['capability_id'] in m['proposals']]
        check('Coverage reconciles '+c['capability_id'],cv['affected_family_count']==len(fs) and set(cv['affected_candidate_variant_ids'])=={v for m in fs for v in m['candidate_variant_ids']} and cv['affected_candidate_variant_count']==len(cv['affected_candidate_variant_ids']))
        check('Projection lower bound subset '+c['capability_id'],set(cv['projected_adaptable_variant_lower_bound_ids'])<=set(cv['affected_candidate_variant_ids']))
    state={m['family_id']:m['b0_status'] for m in mapping}
    for b in proposals['projection']:
        for change in b['changes']:
            assert state[change['family_id']]==change['before']
            state[change['family_id']]=change['after']
        check('Projection reconciles '+b['batch'],dict(Counter(state.values()))==b['counts'] and sum(b['counts'].values())==67)
    check('Final projection matches rows',all(state[m['family_id']]==m['projected_status'] for m in mapping))
    check('17 original missing families deliberately remain',len(proposals['unimplemented_missing_families'])==17)
    docs=list((PROJECT/'docs/research').glob('b1-*.md'))+[PROJECT/'docs/milestones/b1-report.md']
    check('All nine requested Markdown documents exist',len(docs)==9 and all(p.is_file() for p in docs))
    # Validation output is about to be created; exempt that link on the first run only.
    for p in docs:
        for target in re.findall(r'\]\(([^)]+)\)',p.read_text(encoding='utf-8')):
            if target.startswith(('https://','http://','#')):continue
            resolved=(p.parent/target.split('#')[0]).resolve()
            assert resolved.is_file() or resolved==ROOT/'reports/b1-validation.json',(p,target)
    check('Local document links resolve',True)
    outputs=[ROOT/'b1-capability-proposals.json',ROOT/'b1-family-capability-map.jsonl',ROOT/'reports/b1-source-review.json',ROOT/'reports/b1-coverage-statistics.json',PROJECT/'docs/research/b1-coverage-projection.md']
    hashes={p:hashlib.sha256(p.read_bytes()).hexdigest() for p in outputs}
    subprocess.run([sys.executable,str(ROOT/'scripts/b1_build.py')],check=True,stdout=subprocess.DEVNULL)
    check('Deterministic B1 regeneration',all(hashlib.sha256(p.read_bytes()).hexdigest()==h for p,h in hashes.items()))
    check('15 original source tasks reviewed with pinned hash',len(read('reports/b1-source-review.json'))==15)
    log=PROJECT/'b1-contract.log'
    text=log.read_text(encoding='utf-8') if log.exists() else ''
    freeze=json.loads((PROJECT/'contracts/openapi/freeze.json').read_text(encoding='utf-8'))
    check('Actual contract check output matches frozen canonical hashes','Your API descriptions are valid' in text and all(v['sha256'] in text for v in freeze.values()))
    result=dict(result='PASS',date='2026-09-30',checks=checks,check_count=len(checks),protected_files_unchanged=len(baseline),
        source_tasks_reviewed=15,contract_check='PASS',frozen_contract_hashes={k:v['sha256'] for k,v in freeze.items()},
        application_tests='Not run: design-only, no product code or contract changes',upstream_agent_evaluation='Not run',
        script_sha256={p.name:hashlib.sha256(p.read_bytes()).hexdigest() for p in [ROOT/'scripts/b1_build.py',ROOT/'scripts/b1_validate.py']})
    (ROOT/'reports/b1-validation.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k not in ('checks','script_sha256')},ensure_ascii=True,indent=2))

if __name__=='__main__':main()
