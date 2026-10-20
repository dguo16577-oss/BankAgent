"""Summarize metadata-only SDK spans; no inferred cost or task-success numbers."""
import json
import math
import subprocess
from collections import defaultdict
from pathlib import Path

root=Path(__file__).resolve().parents[1]
r=subprocess.run(['docker','logs','--since','30m','aster-acceptance-20261012-agent-runtime-1'],capture_output=True,text=True,encoding='utf-8',errors='replace',timeout=30)
spans=[]
for line in (r.stdout+'\n'+r.stderr).splitlines():
    try: value=json.loads(line)
    except ValueError: continue
    if isinstance(value,dict) and value.get('event')=='span': spans.append(value)
groups=defaultdict(list)
for span in spans: groups[span['name']].append(span)
summary={}
for name,rows in groups.items():
    durations=sorted(row['duration_ms'] for row in rows)
    summary[name]={'count':len(rows),'p50_ms':durations[math.ceil(.5*len(rows))-1],
                   'p95_ms':durations[math.ceil(.95*len(rows))-1],
                   'errors':sum(row['status']=='ERROR' for row in rows)}
models=groups.get('model.completion',[])
usage=[row['attributes'] for row in models if 'model.total_tokens' in row['attributes']]
result={'scope':'current container, last 30 minutes, includes health requests; small non-production sample',
        'operations':summary,'model_usage_coverage':{'with_usage':len(usage),'model_spans':len(models)},
        'prompt_tokens':sum(row.get('model.prompt_tokens',0) for row in usage) if usage else None,
        'completion_tokens':sum(row.get('model.completion_tokens',0) for row in usage) if usage else None,
        'cost':None,'cost_reason':'No current approved tariff/billing capture; not inferred',
        'task_success_rate':None,'task_success_reason':'span OK is not a task or bank-state oracle'}
(root/'artifacts/integrated/otel-spans.json').write_text(json.dumps(spans,indent=2),encoding='utf-8')
(root/'artifacts/integrated/otel-metrics.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
print(json.dumps(result,indent=2))
