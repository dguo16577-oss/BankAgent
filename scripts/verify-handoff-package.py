"""Verify the integrity and file hashes of an Aster handoff ZIP."""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import zipfile
from pathlib import Path


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("zip_path", type=Path)
    args = parser.parse_args()
    path = args.zip_path.resolve()
    if not path.is_file():
        parser.error(f"ZIP does not exist: {path}")
    with zipfile.ZipFile(path) as archive:
        names = archive.namelist()
        if len(names) != len(set(names)):
            raise ValueError("Duplicate ZIP members")
        if any(name.startswith("/") or ".." in Path(name).parts or "\\" in name for name in names):
            raise ValueError("Unsafe ZIP member path")
        manifest = json.loads(archive.read("PACKAGE-MANIFEST.json"))
        if manifest.get("format") != "aster-bank-source-handoff-v1":
            raise ValueError("Unknown manifest format")
        records = manifest["files"]
        expected = {record["path"] for record in records} | {"PACKAGE-MANIFEST.json"}
        if set(names) != expected or len(records) != manifest["file_count"]:
            raise ValueError("ZIP member list does not match manifest")
        for record in records:
            data = archive.read(record["path"])
            if len(data) != record["bytes"] or sha256_bytes(data) != record["sha256"]:
                raise ValueError(f"File hash mismatch: {record['path']}")
    sidecar = path.with_suffix(path.suffix + ".sha256")
    if sidecar.is_file():
        expected_zip_hash = sidecar.read_text(encoding="utf-8").split()[0]
        with path.open("rb") as stream:
            digest = hashlib.sha256()
            for block in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(block)
        if digest.hexdigest() != expected_zip_hash:
            raise ValueError("ZIP hash differs from .sha256 sidecar")
    print(f"PASS: {len(records)} files verified in {path.name}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (KeyError, ValueError, zipfile.BadZipFile) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1) from error
