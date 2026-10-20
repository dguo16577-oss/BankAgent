"""Supplemental real-provider turn interpretation, not deployed E2E evidence.

Runs current source in /tmp using the existing container/approved network and
secret mount. No bank tools, customer data, network override or confirmations.
"""
import base64
import io
import subprocess
import tarfile
from pathlib import Path

root = Path(__file__).resolve().parents[1]
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
    for path in sorted((root / 'services/agent-runtime/app').rglob('*.py')):
        tar.add(path, arcname=path.relative_to(root / 'services/agent-runtime'), recursive=False)
payload = base64.b64encode(buffer.getvalue()).decode()
program = '''import asyncio, base64, io, json, sys, tarfile, tempfile, time
async def run():
    from app.deepseek import DeepSeekClassifier
    from app.agent_v2.planner import DeepSeekPlanner
    planner = DeepSeekPlanner(DeepSeekClassifier())
    cases = [
        ('仅把展示方式换成表格，金额与收款人都不变', 'PRESENTATION_CHANGE'),
        ('把待确认转账的金额改为1000元', 'FINANCIAL_ACTION_MODIFICATION'),
        ('另外查询我的银行卡，不修改正在等待确认的转账', 'TASK_MODIFICATION'),
        ('取消刚才待确认的银行操作', 'USER_CANCELLATION')]
    output = []
    for goal, expected in cases:
        started = time.monotonic()
        try:
            decision = await planner.interpret_follow_up(goal)
            output.append({'user_turn': goal, 'expected': expected, 'decision': decision,
                           'pass': decision['kind'] == expected, 'latency_seconds': round(time.monotonic()-started, 3)})
        except Exception as error:
            output.append({'user_turn': goal, 'error_type': type(error).__name__, 'pass': False})
            break
    print(json.dumps({'scope': 'provider-only, no Banking Core/tool/browser execution', 'model': planner.classifier.model, 'cases': output}, ensure_ascii=False, indent=2))
    return len(output) == len(cases) and all(row['pass'] for row in output)
with tempfile.TemporaryDirectory(prefix='ux45-model-') as directory:
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)), mode='r:gz') as archive:
        archive.extractall(directory, filter='data')
    sys.path.insert(0, directory)
    success = asyncio.run(run())
sys.exit(0 if success else 1)
'''.replace('PAYLOAD', repr(payload))
result = subprocess.run(['docker', 'exec', '-i', 'aster-acceptance-20261012-agent-runtime-1', 'python', '-'],
                        input=program, text=True, encoding='utf-8', capture_output=True)
(root / 'artifacts/ux45/model-turn-smoke.json').write_text(result.stdout or '{"status":"ENVIRONMENT_BLOCKED"}', encoding='utf-8')
print(result.stdout.encode('ascii', errors='backslashreplace').decode())
if result.stderr:
    print('Container stderr received; not dumping potentially sensitive provider details.')
raise SystemExit(result.returncode)
