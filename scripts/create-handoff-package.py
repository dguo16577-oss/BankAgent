"""Create a source/evidence handoff ZIP without local secrets or build caches."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = {
    ".dockerignore",
    ".editorconfig",
    ".env.example",
    ".env.production.example",
    ".gitattributes",
    ".gitignore",
    ".npmrc",
    ".prettierignore",
    ".prettierrc.json",
    "HANDOFF-README.md",
    "README.md",
    "RELEASE.md",
    "package.json",
    "playwright.applications-live.config.ts",
    "playwright.backend.config.ts",
    "playwright.config.ts",
    "playwright.packaged.config.ts",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "redocly.yaml",
}
SOURCE_DIRS = ("apps", "services", "contracts", "docs", "infra", "research", "scripts")
SKIP_DIRS = {
    ".git",
    ".next",
    ".venv",
    "node_modules",
    "__pycache__",
    "coverage",
    "dist",
    "out",
    "playwright-report",
    "test-results",
    "backups",
    ".local-backups",
    ".pytest_cache",
    ".mypy_cache",
}
ARTIFACT_SKIP_DIRS = {
    "m18-verify",
    "m23-core-build",
    "m18-banking-core-build",
    "runtime-logs",
}
ARTIFACT_EXTENSIONS = {".json", ".jsonl", ".csv", ".md", ".txt", ".png", ".log"}
SCAN_EXTENSIONS = {
    ".md", ".txt", ".log", ".json", ".jsonl", ".csv", ".py", ".ps1",
    ".cmd", ".bat", ".mjs", ".cjs", ".js", ".ts", ".tsx", ".css",
    ".html", ".xml", ".java", ".sql", ".yml", ".yaml", ".toml",
    ".properties", ".example", ".conf", ".sh",
}
SECRET_RULES = {
    "DeepSeek/OpenAI-style key": re.compile(rb"\bsk-(?:(?:proj|svcacct)-[A-Za-z0-9_-]{18,}|[A-Za-z0-9]{18,})\b"),
    "private key PEM": re.compile(rb"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "GitHub personal access token": re.compile(rb"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
    "session cookie": re.compile(rb"(?i)(?:SESSION|JSESSIONID)=[A-Za-z0-9_%-]{20,}"),
    "CSRF cookie": re.compile(rb"(?i)XSRF-TOKEN=[A-Za-z0-9_%-]{20,}"),
    "Bearer authorization": re.compile(rb"(?i)Authorization\s*[:=]\s*[^\r\n]{0,3}Bearer\s+[A-Za-z0-9._-]{20,}"),
}
FORBIDDEN_SUFFIXES = {".pem", ".p12", ".pfx", ".key", ".sqlite", ".db", ".dump", ".bak", ".pyc"}


def allowed(path: Path) -> bool:
    relative = path.relative_to(ROOT)
    parts = relative.parts
    name = path.name
    if path.is_symlink() or not path.is_file():
        return False
    if parts[:2] == ("test-results", "m24-1") and len(parts) == 3:
        return name in {
            "backend.sarif.json", "backend.spdx.json", "web.sarif.json",
            "proxy.sarif.json", "postgres.sarif.json", "images.json",
            "web-runtime.txt", "proxy-runtime.txt", "postgres-runtime.txt",
            "inventory.py",
        }
    if any(part in SKIP_DIRS or part == "target" or part.startswith("target-") for part in parts[:-1]):
        return False
    if name.startswith(".env") and name not in {".env.example", ".env.production.example"}:
        return False
    if path.suffix.lower() in FORBIDDEN_SUFFIXES or name.endswith(".tsbuildinfo"):
        return False
    if len(parts) == 1:
        return name in ROOT_FILES
    if parts[0] in SOURCE_DIRS:
        return path.suffix.lower() != ".log"
    if parts[0] == "artifacts":
        return len(parts) > 1 and not any(part in ARTIFACT_SKIP_DIRS for part in parts[1:-1]) and path.suffix.lower() in ARTIFACT_EXTENSIONS
    return False


def collect_files() -> list[Path]:
    files: list[Path] = []
    for name in ROOT_FILES:
        path = ROOT / name
        if allowed(path):
            files.append(path)
    for top in (*SOURCE_DIRS, "artifacts", "test-results/m24-1"):
        directory = ROOT / top
        if not directory.is_dir():
            continue
        for base, dirs, names in os.walk(directory):
            dirs[:] = [
                item for item in dirs
                if item not in SKIP_DIRS
                and item not in ARTIFACT_SKIP_DIRS
                and item != "target"
                and not item.startswith("target-")
            ]
            for name in names:
                path = Path(base) / name
                if allowed(path):
                    files.append(path)
    return sorted(set(files), key=lambda value: value.relative_to(ROOT).as_posix())


def audit_secrets(files: list[Path]) -> list[tuple[str, str]]:
    findings: list[tuple[str, str]] = []
    for path in files:
        if path.suffix.lower() not in SCAN_EXTENSIONS:
            continue
        raw = path.read_bytes()
        for label, rule in SECRET_RULES.items():
            if rule.search(raw):
                findings.append((path.relative_to(ROOT).as_posix(), label))
    return findings


def digest(path: Path) -> str:
    hash_value = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            hash_value.update(block)
    return hash_value.hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="audit and report without writing ZIP")
    parser.add_argument("--output", type=Path, help="new ZIP path; existing files are never overwritten")
    arguments = parser.parse_args()

    files = collect_files()
    findings = audit_secrets(files)
    if findings:
        for relative, label in findings:
            print(f"BLOCKED: {relative}: {label}", file=sys.stderr)
        print("No ZIP was created. Remove the sensitive content or exclude the file.", file=sys.stderr)
        return 2

    categories = Counter(path.relative_to(ROOT).parts[0] for path in files)
    total_bytes = sum(path.stat().st_size for path in files)
    print(f"Audited {len(files)} files, {total_bytes / (1024 * 1024):.1f} MiB; no listed secret pattern found.")
    print("Included by top-level path: " + ", ".join(f"{key}={value}" for key, value in sorted(categories.items())))
    if arguments.dry_run:
        return 0

    stamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    output = arguments.output or ROOT / "deliverables" / f"AsterBank-source-handoff-{stamp}.zip"
    output = output.resolve()
    if output.exists():
        raise FileExistsError(f"Refusing to overwrite {output}")
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest_files = [
        {
            "path": path.relative_to(ROOT).as_posix(),
            "bytes": path.stat().st_size,
            "sha256": digest(path),
        }
        for path in files
    ]
    manifest = {
        "format": "aster-bank-source-handoff-v1",
        "created_utc": datetime.now(timezone.utc).isoformat(),
        "file_count": len(files),
        "total_uncompressed_bytes": total_bytes,
        "exclusions": [
            "credentials and local .env", "database volumes and backups",
            "node_modules/.next/venv/Maven target*", "large generated build evidence",
            "Docker image TAR and scanner executable/cache", "root runtime logs",
        ],
        "files": manifest_files,
    }
    descriptor, temporary_name = tempfile.mkstemp(prefix="aster-handoff-", suffix=".zip", dir=output.parent)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6, allowZip64=True) as archive:
            for path in files:
                archive.write(path, path.relative_to(ROOT).as_posix())
            archive.writestr("PACKAGE-MANIFEST.json", json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        with zipfile.ZipFile(temporary) as archive:
            bad = archive.testzip()
            if bad:
                raise OSError(f"ZIP integrity check failed for {bad}")
            actual = set(archive.namelist())
            expected = {item["path"] for item in manifest_files} | {"PACKAGE-MANIFEST.json"}
            if actual != expected:
                raise OSError("ZIP member list differs from manifest")
        temporary.rename(output)
    finally:
        if temporary.exists():
            temporary.unlink()
    sha_path = output.with_suffix(output.suffix + ".sha256")
    sha_path.write_text(f"{digest(output)}  {output.name}\n", encoding="utf-8")
    print(f"ZIP: {output}")
    print(f"SHA-256: {sha_path}")
    print(f"ZIP bytes: {output.stat().st_size}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
