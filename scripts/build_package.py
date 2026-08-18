#!/usr/bin/env python3
"""Build the RELAY-0 sideload package deterministically (#12).

The same commit must always produce a byte-identical zip, whether built on a
developer machine or in a clean CI checkout. A naive zipfile.write() embeds
each file's mtime, so a fresh `git clone` produces a different archive than
an in-place build at the same commit.

This script:
  * packages an explicit ALLOWLIST, so repository files (tests, docs, CI
    config, scratch zips) can never leak into a channel package
  * normalises every entry's timestamp and permission bits
  * writes entries in sorted order
  * emits a manifest of SHA-256 hashes so CI and a release can be compared

Usage:
    python3 scripts/build_package.py [--out RELAY0.zip] [--verify]

    --verify   build twice and confirm the archives are byte-identical
"""

from __future__ import annotations

import argparse
import hashlib
import io
import os
import re
import sys
import zipfile

# Fixed timestamp for every entry: 1980-01-01, the zip epoch floor.
# Any constant works; the point is that it does not vary by checkout.
FIXED_DATE = (1980, 1, 1, 0, 0, 0)

# Only these files ship. Anything not matched here is excluded by
# construction rather than by a blocklist that has to chase new additions.
REQUIRED_FILES = [
    "manifest",
    "source/main.brs",
]

COMPONENT_EXTS = (".brs", ".xml")

# Directories that may contribute files, with the extensions allowed in each.
ALLOWED_TREES = {
    "components": COMPONENT_EXTS,
    "source": (".brs",),
    "images": (".png", ".jpg", ".jpeg"),
    "fonts": (".ttf", ".otf"),
    "locale": (".xml", ".ts"),
}

# Explicitly rejected even if they somehow land in an allowed tree.
DENY_PATTERNS = [
    re.compile(r"(^|/)\."),            # dotfiles
    re.compile(r"\.zip$"),
    re.compile(r"\.pkg$"),
    re.compile(r"(^|/)__pycache__/"),
    re.compile(r"\.py$"),
    re.compile(r"\.md$"),
    re.compile(r"\.sh$"),
    re.compile(r"(^|/)buildstamp\.txt$"),
]


def denied(rel: str) -> bool:
    return any(p.search(rel) for p in DENY_PATTERNS)


def collect() -> list[str]:
    """Return the sorted list of files that belong in the package."""
    out: list[str] = []

    for req in REQUIRED_FILES:
        if not os.path.isfile(req):
            raise SystemExit(f"error: required file missing: {req}")
        out.append(req)

    for tree, exts in ALLOWED_TREES.items():
        if not os.path.isdir(tree):
            continue
        for root, _dirs, names in os.walk(tree):
            for n in sorted(names):
                rel = os.path.join(root, n).replace(os.sep, "/")
                if rel in out:
                    continue
                if not rel.endswith(exts):
                    continue
                if denied(rel):
                    continue
                out.append(rel)

    return sorted(set(out))


def validate(files: list[str]) -> list[str]:
    """Structural checks on the file list. Returns a list of problems."""
    problems = []

    # Every component needs both halves or the channel fails to load.
    stems: dict[str, set[str]] = {}
    for f in files:
        if f.startswith("components/"):
            stem, ext = os.path.splitext(os.path.basename(f))
            stems.setdefault(stem, set()).add(ext)
    for stem, exts in sorted(stems.items()):
        if exts != {".brs", ".xml"}:
            problems.append(f"component '{stem}' incomplete: has {sorted(exts)}")

    # Nothing that looks like repo tooling may be present.
    for f in files:
        if denied(f):
            problems.append(f"denied file present in package list: {f}")

    # manifest must carry the keys Roku requires.
    manifest = open("manifest", encoding="utf-8", errors="replace").read()
    for key in ("title", "major_version", "minor_version", "build_version"):
        if not re.search(rf"^{key}=", manifest, re.M):
            problems.append(f"manifest missing required key: {key}")

    return problems


def build(files: list[str]) -> bytes:
    """Produce the package bytes deterministically."""
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as z:
        for rel in files:
            data = open(rel, "rb").read()
            # Normalise BOTH the timestamp and the external attributes, so a
            # different umask or filesystem cannot change the archive.
            info = zipfile.ZipInfo(rel, date_time=FIXED_DATE)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o644 << 16
            info.create_system = 0  # report as MS-DOS, not host-dependent
            z.writestr(info, data)
    return buf.getvalue()


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default="RELAY0.zip")
    ap.add_argument("--verify", action="store_true",
                    help="build twice and confirm byte-identical output")
    ap.add_argument("--hashes", action="store_true",
                    help="print a per-file SHA-256 manifest")
    args = ap.parse_args()

    if not os.path.isfile("manifest"):
        print("error: run from the repository root", file=sys.stderr)
        return 1

    files = collect()
    problems = validate(files)
    if problems:
        print("PACKAGE VALIDATION FAILED:", file=sys.stderr)
        for p in problems:
            print(f"  - {p}", file=sys.stderr)
        return 1

    data = build(files)

    if args.verify:
        again = build(files)
        if data != again:
            print("error: package is NOT deterministic within a single run",
                  file=sys.stderr)
            return 1
        print("determinism check: two builds byte-identical")

    with open(args.out, "wb") as fh:
        fh.write(data)

    digest = hashlib.sha256(data).hexdigest()
    print(f"packaged {len(files)} file(s) -> {args.out} ({len(data)} bytes)")
    print(f"sha256: {digest}")

    if args.hashes:
        print("\nper-file sha256:")
        for rel in files:
            h = hashlib.sha256(open(rel, "rb").read()).hexdigest()
            print(f"  {h[:16]}  {rel}")

    print("\nfiles:")
    for rel in files:
        print(f"  {rel}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
