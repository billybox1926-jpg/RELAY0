#!/usr/bin/env python3
"""Tests for deterministic release packaging (#12).

Asserts the guarantees scripts/build_package.py is supposed to provide:
reproducibility across checkouts, an enforced allowlist, and structural
completeness of the archive.

Run:
    python3 scripts/test_package.py
"""

from __future__ import annotations

import hashlib
import io
import os
import shutil
import subprocess
import sys
import tempfile
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import build_package as bp  # noqa: E402

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}" + (f" -- {detail}" if detail else ""))
        FAILURES.append(name)


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def main() -> int:
    if not os.path.isfile("manifest"):
        print("error: run from the repository root", file=sys.stderr)
        return 1

    print("Deterministic packaging tests")

    print("\nFile collection and validation:")
    files = bp.collect()
    check("collect() returns files", bool(files), str(len(files)))
    check("manifest is included", "manifest" in files)
    check("entry point is included", "source/main.brs" in files)
    check("validation passes on the current tree", not bp.validate(files),
          str(bp.validate(files)))

    print("\nAllowlist excludes repository tooling:")
    for bad in ("scripts/build_package.py", "README.md", "RELAY0.zip",
                ".gitignore", "docs/TIMER_AUDIT.md"):
        check(f"{bad} is not packaged", bad not in files)
    check("no .py files at all", not any(f.endswith(".py") for f in files))
    check("no .md files at all", not any(f.endswith(".md") for f in files))
    check("no dotfiles", not any("/." in f or f.startswith(".") for f in files))

    print("\nDeterminism within a run:")
    a, b = bp.build(files), bp.build(files)
    check("two builds are byte-identical", a == b)
    check("hash is stable", sha(a) == sha(b), f"{sha(a)[:16]} vs {sha(b)[:16]}")

    print("\nDeterminism across checkouts (the original defect):")
    # A fresh checkout has different mtimes. Copy sources without preserving
    # them, which is what broke the naive zipfile.write() approach.
    tmp = tempfile.mkdtemp(prefix="relay0_repro_")
    try:
        for rel in files:
            dst = os.path.join(tmp, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(rel, dst)  # does NOT copy mtime
        cwd = os.getcwd()
        os.chdir(tmp)
        try:
            fresh = bp.build(bp.collect())
        finally:
            os.chdir(cwd)
        check("fresh-checkout build matches in-place build", a == fresh,
              f"{sha(a)[:16]} vs {sha(fresh)[:16]}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)

    print("\nArchive entry normalisation:")
    zf = zipfile.ZipFile(io.BytesIO(a))
    infos = zf.infolist()
    check("every entry uses the fixed timestamp",
          all(i.date_time == bp.FIXED_DATE for i in infos),
          str({i.filename: i.date_time for i in infos[:2]}))
    check("every entry uses normalised permissions",
          all(i.external_attr == (0o644 << 16) for i in infos))
    check("entries are written in sorted order",
          [i.filename for i in infos] == sorted(i.filename for i in infos))
    check("no directory entries", not any(i.filename.endswith("/") for i in infos))

    print("\nArchive structure Roku requires:")
    names = zf.namelist()
    check("manifest at the archive root", "manifest" in names)
    check("no nested wrapper directory",
          not any(n.startswith("RELAY0/") for n in names), str(names[:3]))
    stems: dict[str, set[str]] = {}
    for n in names:
        if n.startswith("components/"):
            stem, ext = os.path.splitext(os.path.basename(n))
            stems.setdefault(stem, set()).add(ext)
    check("every component has both .brs and .xml",
          all(v == {".brs", ".xml"} for v in stems.values()),
          str({k: sorted(v) for k, v in stems.items() if v != {".brs", ".xml"}}))
    check("archive is a plausible size", len(a) > 5000, str(len(a)))

    print("\nValidation rejects a broken tree:")
    tmp2 = tempfile.mkdtemp(prefix="relay0_broken_")
    try:
        for rel in files:
            dst = os.path.join(tmp2, rel)
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            shutil.copyfile(rel, dst)
        # Remove one half of a component pair.
        os.remove(os.path.join(tmp2, "components", "LogsTab.xml"))
        cwd = os.getcwd()
        os.chdir(tmp2)
        try:
            problems = bp.validate(bp.collect())
        finally:
            os.chdir(cwd)
        check("an orphaned .brs is reported", bool(problems), str(problems))
        check("the failure names the component",
              any("LogsTab" in p for p in problems), str(problems))
    finally:
        shutil.rmtree(tmp2, ignore_errors=True)

    print()
    if FAILURES:
        print(f"PACKAGING TESTS FAILED: {len(FAILURES)} failure(s):",
              file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("All packaging tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
