"""Re-evaluate B0/B1 family dependencies against B2 implemented capability evidence.
Does not rewrite pinned B0/B1 inputs or use B1 projected statuses.
"""
import json
import hashlib
from collections import Counter
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
PROJECT = ROOT.parents[1]
def read(path): return json.loads((ROOT/path).read_text(encoding="utf-8"))
def lines(path): return [json.loads(x) for x in (ROOT/path).read_text(encoding="utf-8").splitlines() if x]
def digest(path): return hashlib.sha256((PROJECT/path).read_bytes()).hexdigest()
def main():
    caps = {c['capability_id']: c for c in read('aster-capabilities.json')['capabilities']}
    families = lines('normalized/behavior-families.jsonl')
    mapping = {r['family_id']:r for r in lines('b1-family-capability-map.jsonl')}
    evidence = [
      'services/banking-core/src/main/java/com/asterbank/banking/customer/payment/application/RecipientManagementService.java',
      'services/banking-core/src/main/java/com/asterbank/banking/customer/payment/application/TransferExecutionService.java',
      'services/banking-core/src/test/java/com/asterbank/banking/RecipientPostgreSqlIT.java',
      'apps/web/src/features/payments/recipient-management.tsx',
      'apps/web/src/features/payments/recipient-management.test.tsx',
      'apps/web/e2e-shared/recipient-journey.ts',
    ]
    for path in evidence: assert (PROJECT/path).is_file(), path
    records=[]
    for f in families:
      required=f['required_capabilities']
      # Recompute only the newly implemented primitive. All other audited primitive
      # decisions retain their pinned B0 limitations (including BILL_DOCUMENT / PAYMENT_RISK).
      before=f['current_aster_support']
      after=before
      if 'RECIPIENT_CREATE' in required:
        missing=[c for c in required if c!='RECIPIENT_CREATE' and caps.get(c,{}).get('current_status')!='SUPPORTED']
        if not missing: after='SUPPORTED'
      records.append({'family_id':f['family_id'],'before':before,'after':after,'required_capabilities':required,
        'origin':f['origin'],'source_refs':mapping[f['family_id']]['source_refs'],
        'candidate_variant_ids':mapping[f['family_id']]['candidate_variant_ids'],
        'new_evidence':evidence if 'RECIPIENT_CREATE' in required else []})
    out=ROOT/'reports/b2-coverage-statistics.json'
    result={'basis':'B0 frozen family dependencies + B2 code/UI/test evidence; no projected statuses',
      'validation':'Implementation mapping; test run results are recorded separately in docs/milestones/b2-report.md',
      'input_hashes':{str(p):digest(p) for p in ['research/banking-behaviors/normalized/behavior-families.jsonl','research/banking-behaviors/b1-family-capability-map.jsonl']},
      'evidence_hashes':{p:digest(p) for p in evidence},
      'before':dict(Counter(r['before'] for r in records)), 'after':dict(Counter(r['after'] for r in records)),
      'changed':[r for r in records if r['before']!=r['after']]}
    out.write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (ROOT/'b2-family-capability-map.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in records),encoding='utf-8')
    print(json.dumps({k:result[k] for k in ['before','after']},ensure_ascii=False))
if __name__=='__main__':main()

