"""Inventory and run the 98 mock browser cases in memory-bounded resumable batches."""

from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "artifacts" / "s1-1-playwright"
CONFIG = ROOT / "playwright.s1-low-memory.config.ts"
RESULTS = ARTIFACTS / "results.json"


class MemoryStatus(ctypes.Structure):
    _fields_ = [("length", ctypes.c_ulong), ("memory_load", ctypes.c_ulong),
                ("total_physical", ctypes.c_ulonglong),
                ("available_physical", ctypes.c_ulonglong),
                ("total_page_file", ctypes.c_ulonglong),
                ("available_page_file", ctypes.c_ulonglong),
                ("total_virtual", ctypes.c_ulonglong),
                ("available_virtual", ctypes.c_ulonglong),
                ("available_extended_virtual", ctypes.c_ulonglong)]


def available_mb() -> int:
    if os.name != "nt":
        return 1_000_000
    state = MemoryStatus()
    state.length = ctypes.sizeof(state)
    if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(state)):
        raise OSError("GlobalMemoryStatusEx failed")
    return state.available_physical // (1024 * 1024)


def pnpm() -> str:
    found = shutil.which("pnpm")
    if found:
        return found
    fallback = (Path.home() / ".cache/codex-runtimes/codex-primary-runtime"
                "/dependencies/bin/fallback/pnpm.cmd")
    if fallback.exists():
        return str(fallback)
    raise RuntimeError("pnpm is unavailable; install it or use the Codex bundled runtime")


def fingerprint() -> str:
    digest = hashlib.sha256()
    roots = [ROOT / "apps/web/src", ROOT / "apps/web/e2e"]
    files = [file for directory in roots for file in directory.rglob("*") if file.is_file()]
    files += [ROOT / "apps/web/playwright.config.ts", ROOT / "playwright.config.ts",
              CONFIG, ROOT / "pnpm-lock.yaml", ROOT / "package.json"]
    for file in sorted(files):
        digest.update(str(file.relative_to(ROOT)).encode())
        digest.update(hashlib.sha256(file.read_bytes()).digest())
    return digest.hexdigest()


def inventory() -> dict:
    command = [pnpm(), "exec", "playwright", "test", "--list", "--config", str(CONFIG)]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True, check=True,
                            encoding="utf-8", errors="replace")
    labels = [line.strip() for line in result.stdout.splitlines()
              if re.match(r"^\s+\[chromium\] › ", line)]
    if len(labels) != 98 or len(set(labels)) != len(labels):
        raise RuntimeError(f"Expected 98 unique Chromium cases, discovered {len(labels)}")
    cases = [{"id": f"PW{index:03d}", "label": label, "batch": (index - 1) // 8 + 1}
             for index, label in enumerate(labels, 1)]
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    manifest = {"fingerprint": fingerprint(), "config": str(CONFIG.relative_to(ROOT)),
                "batch_size": 8, "cases": cases}
    (ARTIFACTS / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
                                                encoding="utf-8")
    return manifest


def load_results(manifest: dict) -> dict:
    if RESULTS.exists():
        data = json.loads(RESULTS.read_text(encoding="utf-8"))
        if data.get("fingerprint") != manifest["fingerprint"]:
            raise RuntimeError("Code/config changed; archive results.json and start a new run")
        return data
    return {"fingerprint": manifest["fingerprint"], "cases": {
        case["id"]: {"status": "UNVERIFIED", "batch": case["batch"]}
        for case in manifest["cases"]}, "batches": {}}


def save_results(data: dict) -> None:
    RESULTS.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    manifest = json.loads((ARTIFACTS / "manifest.json").read_text(encoding="utf-8"))
    lines = ["# S1.1 Playwright case results", "",
             f"Fingerprint: `{data['fingerprint']}`. All cases use one worker and non-parallel mode.",
             "Each batch is a separate Playwright/Web process; this is not one continuous run.", "",
             "| Batch | Cases | Status | Passed | Failed | Unverified |", "| ---: | ---: | --- | ---: | ---: | ---: |"]
    for number in range(1, 14):
        batch_cases = [case for case in manifest["cases"] if case["batch"] == number]
        state = data["batches"].get(str(number), {})
        lines.append(f"| {number} | {len(batch_cases)} | {state.get('status', 'UNVERIFIED')} | "
                     f"{state.get('passed', 0)} | {state.get('failed', 0)} | "
                     f"{state.get('unverified', len(batch_cases))} |")
    lines += ["", "| ID | Batch | Test | Status | Report |",
              "| --- | ---: | --- | --- | --- |"]
    for case in manifest["cases"]:
        result = data["cases"][case["id"]]
        label = case["label"].replace("|", "\\|")
        report = result.get("report", "")
        report_link = (f"[{Path(report).name}](../../{report.replace(os.sep, '/')})"
                       if report else "—")
        lines.append(f"| {case['id']} | {case['batch']} | {label} | "
                     f"{result['status']} | {report_link} |")
    report_path = ROOT / "docs" / "testing" / "s1-playwright-case-results.md"
    report_path.parent.mkdir(parents=True, exist_ok=True)
    report_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def walk_specs(suites: list[dict]):
    for suite in suites:
        for spec in suite.get("specs", []):
            yield spec
        yield from walk_specs(suite.get("suites", []))


def record_json_result(data: dict, selected: list[dict], report_path: Path) -> None:
    report = json.loads(report_path.read_text(encoding="utf-8"))
    by_label = {case["label"]: case["id"] for case in selected}
    found = set()
    for spec in walk_specs(report.get("suites", [])):
        file = Path(spec.get("file", "")).name
        location = f"{file}:{spec.get('line')}:{spec.get('column')}"
        label = f"[chromium] › {location} › {spec.get('title')}"
        case_id = by_label.get(label)
        if case_id is None:
            continue
        tests = [test for test in spec.get("tests", []) if test.get("projectName") == "chromium"]
        statuses = [result.get("status") for test in tests for result in test.get("results", [])]
        status = "PASS" if tests and all(test.get("status") == "expected" for test in tests) else "FAIL"
        data["cases"][case_id].update(status=status, observed_results=statuses,
                                       report=str(report_path.relative_to(ROOT)))
        found.add(case_id)
    for case in selected:
        if case["id"] not in found:
            data["cases"][case["id"]].update(status="UNVERIFIED", reason="NO_REPORT_ENTRY")


def stop_own_tree(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       capture_output=True, check=False)
    else:
        process.terminate()


def run_batch(manifest: dict, data: dict, batch: int, minimum_mb: int) -> bool:
    selected = [case for case in manifest["cases"] if case["batch"] == batch]
    if not selected:
        raise ValueError(f"Unknown batch {batch}")
    if all(data["cases"][case["id"]]["status"] == "PASS" for case in selected):
        print(f"Batch {batch}: already PASS for this code/config fingerprint")
        return True
    free = available_mb()
    if free < minimum_mb:
        print(f"Batch {batch}: BLOCKED_LOW_MEMORY; available {free} MiB < {minimum_mb} MiB")
        data["batches"][str(batch)] = {"status": "BLOCKED_LOW_MEMORY", "available_mb": free}
        save_results(data)
        return False
    test_list = ARTIFACTS / f"batch-{batch:02d}.list"
    test_list.write_text("\n".join(case["label"] for case in selected) + "\n", encoding="utf-8")
    report_path = ARTIFACTS / f"batch-{batch:02d}.json"
    error_path = ARTIFACTS / f"batch-{batch:02d}.stderr.log"
    command = [pnpm(), "exec", "playwright", "test", "--config", str(CONFIG),
               "--test-list", str(test_list), "--workers=1", "--reporter=json"]
    print(f"Batch {batch}: {len(selected)} cases; available memory {free} MiB", flush=True)
    low_memory = False
    with report_path.open("w", encoding="utf-8") as stdout, error_path.open("w", encoding="utf-8") as stderr:
        process = subprocess.Popen(command, cwd=ROOT, stdout=stdout, stderr=stderr)
        while process.poll() is None:
            time.sleep(2)
            if available_mb() < 1800:
                low_memory = True
                stop_own_tree(process)
                break
        try:
            code = process.wait(timeout=15)
        except subprocess.TimeoutExpired:
            stop_own_tree(process)
            code = process.wait(timeout=15)
    if low_memory:
        data["batches"][str(batch)] = {"status": "BLOCKED_LOW_MEMORY", "exit_code": code}
    else:
        try:
            record_json_result(data, selected, report_path)
        except (json.JSONDecodeError, OSError) as exc:
            data["batches"][str(batch)] = {"status": "ENVIRONMENT_ERROR", "error": type(exc).__name__}
        else:
            statuses = [data["cases"][case["id"]]["status"] for case in selected]
            data["batches"][str(batch)] = {"status": "PASS" if code == 0 and all(
                status == "PASS" for status in statuses) else "FAIL", "exit_code": code,
                "passed": statuses.count("PASS"), "failed": statuses.count("FAIL"),
                "unverified": statuses.count("UNVERIFIED")}
    save_results(data)
    print(f"Batch {batch}: {data['batches'][str(batch)]}", flush=True)
    return data["batches"][str(batch)]["status"] == "PASS"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--inventory", action="store_true")
    parser.add_argument("--batch", type=int)
    parser.add_argument("--all", action="store_true")
    parser.add_argument("--min-start-memory-mb", type=int, default=3500)
    args = parser.parse_args()
    manifest = inventory()
    data = load_results(manifest)
    save_results(data)
    if args.inventory:
        print(f"Inventoried {len(manifest['cases'])} cases; fingerprint {manifest['fingerprint'][:12]}")
        return
    batches = ([args.batch] if args.batch else
               list(range(1, max(case["batch"] for case in manifest["cases"]) + 1)) if args.all else [])
    if not batches:
        parser.error("Use --inventory, --batch N or --all")
    for batch in batches:
        if not run_batch(manifest, data, batch, args.min_start_memory_mb):
            sys.exit(1)


if __name__ == "__main__":
    main()
