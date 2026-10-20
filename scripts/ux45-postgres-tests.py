"""Run current recovery tests in the existing isolated Agent container.

Uses its existing internal PostgreSQL connection, no host port, new network,
provider request, secret output, bank balance modification or image deployment.
Current app/tests are unpacked only into the container's disposable /tmp.
"""
import base64
import io
from pathlib import Path
import subprocess
import tarfile

root = Path(__file__).resolve().parents[1]
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode='w:gz') as tar:
    for directory in ('app', 'tests'):
        for path in sorted((root / 'services/agent-runtime' / directory).rglob('*.py')):
            tar.add(path, arcname=path.relative_to(root / 'services/agent-runtime'), recursive=False)
payload = base64.b64encode(buffer.getvalue()).decode()
program = '''import base64, io, os, sys, tarfile, tempfile, unittest
from psycopg.conninfo import make_conninfo
with tempfile.TemporaryDirectory(prefix='ux45-') as directory:
    with tarfile.open(fileobj=io.BytesIO(base64.b64decode(PAYLOAD)), mode='r:gz') as archive:
        archive.extractall(directory, filter='data')
    sys.path[:0] = [directory, directory+'/tests']
    os.environ['R1_TEST_DATABASE_URL'] = make_conninfo(host=os.environ['PGHOST'], port=os.environ['PGPORT'], dbname=os.environ['PGDATABASE'], user=os.environ['PGUSER'], password=os.environ['PGPASSWORD'])
    suite = unittest.defaultTestLoader.discover(directory+'/tests', pattern='test_r1_postgres_recovery.py')
    result = unittest.TextTestRunner(verbosity=2).run(suite)
    success = result.wasSuccessful() and not result.skipped
sys.exit(0 if success else 1)
'''.replace('PAYLOAD', repr(payload))
result = subprocess.run(['docker', 'exec', '-i', 'aster-acceptance-20261012-agent-runtime-1', 'python', '-'],
                        input=program, text=True, capture_output=True)
output = root / 'artifacts/ux45/postgres-recovery.log'
output.write_text(result.stdout + result.stderr, encoding='utf-8')
print(result.stdout + result.stderr)
raise SystemExit(result.returncode)
