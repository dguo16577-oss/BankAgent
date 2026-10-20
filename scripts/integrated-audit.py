"""Read-only report/source inventory and current registry export."""
import hashlib
import json
import sys
from pathlib import Path

root = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(root / 'services/agent-runtime'))
from app.agent_v2.tools import ToolRegistry

reports = ['docs/milestones/'+name+'.md' for name in (
    'ux4-6-deployment-e2e-acceptance','ux4-5-final-acceptance','ux4-e2e-acceptance',
    's1-security-acceptance','r1-reliability-acceptance','p1-p2-mcp-acceptance','k1-k2-rag-acceptance')]
reports += ['docs/security/agent-security-benchmark.md','START-README.md']
inventory = []
for name in reports:
    content = (root/name).read_bytes()
    text = content.decode('utf-8-sig')
    inventory.append({'path':name,'sha256':hashlib.sha256(content).hexdigest(),
                      'headings':[line for line in text.splitlines() if line.startswith('#')],
                      'bytes':len(content)})
tools = ToolRegistry(None).visible()
out = root/'artifacts/integrated'
out.mkdir(parents=True,exist_ok=True)
(out/'report-inventory.json').write_text(json.dumps(inventory,indent=2),encoding='utf-8')
(out/'registry.json').write_text(json.dumps(tools,indent=2),encoding='utf-8')
rows = ['# Current tool permission inventory', '',
        'Generated from actual Registry definitions. Customer/object authorization remains in Runtime/Spring. '
        'Provider is MCP only for the approved three tools when enabled. No model-facing execution tool.', '',
        '| Tool | Capability | Class | Risk | Provider | Confirmation |',
        '| --- | --- | --- | --- | --- | --- |']
for tool in tools:
    rows.append('| '+ ' | '.join([tool['name'], ', '.join(tool['required_capabilities']) or 'read-only',
        tool['category'], tool['risk_class'],
        'MCP when enabled; native otherwise' if tool['name'] in {'list_accounts','list_cards','search_bank_knowledge'} else 'native',
        'required before trusted execution' if tool['category']=='PREPARE' else 'none (read/analyze)'])+' |')
(root/'docs/security/integrated-tool-permissions.md').write_text('\n'.join(rows)+'\n',encoding='utf-8')
print(f'Read {len(inventory)} complete reports; exported {len(tools)} actual tool definitions.')
