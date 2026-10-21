"""Serial, resumable per-file Web regression using the existing Vitest config.

One worker, bounded subprocess lifetime, resource preflight between files.
Never run concurrently with a build, Spring verification or browser suite.
"""
import hashlib
import json
import os
import re
from pathlib import Path
import subprocess
import time

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web"
NODE = Path(os.environ["USERPROFILE"]) / ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe"
OUT = ROOT / "artifacts/final-sprint/web-batches"
OUT.mkdir(parents=True, exist_ok=True)
files = sorted(path.relative_to(WEB).as_posix() for path in (WEB / "src").rglob("*")
               if path.name.endswith((".test.ts", ".test.tsx")))
tracked = subprocess.check_output(["git", "ls-files", "apps/web"], cwd=ROOT, text=True).splitlines()
fingerprint = hashlib.sha256("\n".join(
    name + ":" + hashlib.sha256((ROOT / name).read_bytes()).hexdigest()
    for name in tracked if (ROOT / name).is_file()).encode()).hexdigest()
records = []
for name in files:
    label = name.replace("/", "__")
    record_path = OUT / (label + ".json")
    if record_path.exists():
        previous = json.loads(record_path.read_text(encoding="utf-8"))
        if previous.get("source_fingerprint") == fingerprint and previous.get("status") == "PASS":
            records.append(previous)
            continue
    headroom = int(subprocess.check_output(["powershell", "-NoProfile", "-Command",
        "$m=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory; [math]::Floor(($m.CommitLimit-$m.CommittedBytes)/1MB)"], text=True).strip())
    if headroom < 2048:
        print("RESOURCE_BLOCKED before next file; completed records retained", flush=True)
        break
    command = [str(NODE), "--max-old-space-size=512", "node_modules/vitest/vitest.mjs", "run", name,
               "--maxWorkers=1", "--no-file-parallelism"]
    started = time.monotonic()
    log = OUT / (label + ".log")
    with log.open("w", encoding="utf-8") as stream:
        process = subprocess.Popen(command, cwd=WEB, stdout=stream, stderr=subprocess.STDOUT)
        try:
            code = process.wait(timeout=45)
            status = "PASS" if code == 0 else "FAIL"
        except subprocess.TimeoutExpired:
            # PID belongs to the subprocess just created by this runner.
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"], capture_output=True)
            process.wait(timeout=10)
            code, status = None, "HARNESS_TIMEOUT"
    plain = re.sub(r"\x1b\[[0-9;]*m", "", log.read_text(encoding="utf-8", errors="replace"))
    result = re.search(r"Tests\s+(\d+) passed", plain)
    passed = int(result[1]) if result else 0
    if status == "PASS" and passed == 0:
        status = "NO_ASSERTION_EVIDENCE"
    record = {"file": name, "status": status, "tests_passed": passed, "exit_code": code, "elapsed_seconds": round(time.monotonic()-started, 2),
              "source_fingerprint": fingerprint, "workers": 1, "log_sha256": hashlib.sha256(log.read_bytes()).hexdigest()}
    record_path.write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")
    records.append(record)
    print(name + ": " + status, flush=True)
summary = {"expected_files": len(files), "records": records, "source_fingerprint": fingerprint,
           "note": "Serial per-file execution, not one continuous suite. No assertion changes."}
(OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
raise SystemExit(0 if len(records) == len(files) and all(r["status"] == "PASS" for r in records) else 1)
