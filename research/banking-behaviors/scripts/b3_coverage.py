"""Observed B3 capability mapping, preserving pinned B0/B1 and B2 evidence."""
import json,hashlib
from pathlib import Path
from collections import Counter
ROOT=Path(__file__).resolve().parents[1]
PROJECT=ROOT.parents[1]
def digest(p):return hashlib.sha256((PROJECT/p).read_bytes()).hexdigest()
def main():
    prior=[json.loads(x) for x in (ROOT/'b2-family-capability-map.jsonl').read_text(encoding='utf-8').splitlines() if x]
    evidence=['services/banking-core/src/main/java/com/asterbank/banking/customer/payment/application/ScheduledPaymentService.java','services/banking-core/src/test/java/com/asterbank/banking/ScheduledPaymentPostgreSqlIT.java','apps/web/src/features/payments/scheduled-payments.tsx','apps/web/src/features/payments/scheduled-payments.test.tsx','apps/web/e2e-backend/schedules.spec.ts','apps/web/e2e-shared/schedule-journey.ts']
    rows=[]
    for old in prior:
      before=old['after'];after=before;reason='B2 status retained; unaffected capabilities are unchanged.'
      if old['family_id']=='SCHEDULED_TRANSFER':after='SUPPORTED';reason='One-time future CNY create and deterministic atomic due settlement implemented; specification-derived family.'
      elif old['family_id']=='BUDGET_TO_SCHEDULE':after='SUPPORTED';reason='Existing Spending/account reads compose with manually available one-time schedule creation; no Agent orchestration claimed.'
      elif old['family_id']=='SCHEDULE_CHANGE':after='PARTIALLY_SUPPORTED';reason='One-time amendment implemented; referenced standing-order/recurring source tasks are not fully supported.'
      rows.append({**old,'before':before,'after':after,'reason':reason,'new_evidence':evidence if after!=before else []})
    report={'basis':'Observed B2 map plus B3 code/UI/test traceability; B1 projections are not observations.','before':dict(Counter(r['before'] for r in rows)),'after':dict(Counter(r['after'] for r in rows)),'changed':[r for r in rows if r['before']!=r['after']],'input_hashes':{'research/banking-behaviors/b2-family-capability-map.jsonl':digest('research/banking-behaviors/b2-family-capability-map.jsonl')},'evidence_hashes':{p:digest(p) for p in evidence}}
    (ROOT/'b3-family-capability-map.jsonl').write_text(''.join(json.dumps(r,ensure_ascii=False)+'\n' for r in rows),encoding='utf-8')
    (ROOT/'reports/b3-coverage-statistics.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:report[k] for k in ['before','after']}))
if __name__=='__main__':main()
