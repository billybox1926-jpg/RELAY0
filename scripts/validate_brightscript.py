#!/usr/bin/env python3
"""Validate BrightScript and SceneGraph sources for a Roku channel.

Pure standard library, no proprietary tooling required. Every check here
corresponds to a defect class that actually reached device testing in this
project, so a clean run means the channel at least boots and renders.

Usage:
    python3 scripts/validate_brightscript.py [project_root]

Exit codes:
    0  all checks passed
    1  one or more errors found
"""

from __future__ import annotations

import os
import re
import sys
import xml.etree.ElementTree as ET

# Roku's built-in font names. Anything else silently renders nothing, which
# looks like a blank screen rather than an error.
VALID_FONTS = {
    "font:SmallestSystemFont", "font:SmallestBoldSystemFont",
    "font:SmallSystemFont", "font:SmallBoldSystemFont",
    "font:MediumSystemFont", "font:MediumBoldSystemFont",
    "font:LargeSystemFont", "font:LargeBoldSystemFont",
    "font:SmallestSystemFontEx", "font:SmallSystemFontEx",
    "font:MediumSystemFontEx", "font:LargeSystemFontEx",
}

# roDateTime / ifDateTime methods that do not exist but are easy to invent.
BAD_DATETIME_CALLS = {
    "ToTimeString": 'no such method; use GetHours()/GetMinutes()/GetSeconds()',
    "GetTimeString": 'no such method; use GetHours()/GetMinutes()/GetSeconds()',
    "AsTimeString": 'no such method; use asTimeStringLoc(format) or the Get* accessors',
}

BLOCK_OPENERS = re.compile(r'^\s*(sub|function)\s+([A-Za-z_]\w*)', re.I)
BLOCK_CLOSERS = re.compile(r'^\s*end\s+(sub|function)\b', re.I)


class Findings:
    def __init__(self) -> None:
        self.errors: list[str] = []
        self.warnings: list[str] = []

    def error(self, path: str, line: int | None, msg: str) -> None:
        loc = f"{path}:{line}" if line else path
        self.errors.append(f"{loc}: error: {msg}")

    def warn(self, path: str, line: int | None, msg: str) -> None:
        loc = f"{path}:{line}" if line else path
        self.warnings.append(f"{loc}: warning: {msg}")


def read_lines(path: str) -> list[str]:
    with open(path, encoding="utf-8", errors="replace") as fh:
        return fh.read().splitlines()


def strip_comment(line: str) -> str:
    """Remove a trailing BrightScript comment, respecting string literals."""
    out, in_str = [], False
    for ch in line:
        if ch == '"':
            in_str = not in_str
        if ch == "'" and not in_str:
            break
        out.append(ch)
    return "".join(out)


def check_bom(path: str, rel: str, f: Findings) -> None:
    with open(path, "rb") as fh:
        if fh.read(3) == b"\xef\xbb\xbf":
            f.error(rel, 1, "file starts with a UTF-8 BOM; Roku's compiler rejects it")


def check_brs(path: str, rel: str, f: Findings) -> dict[str, set[str]]:
    """Syntax-ish checks for one .brs file. Returns declared function names."""
    check_bom(path, rel, f)
    lines = read_lines(path)
    declared: set[str] = set()
    depth = 0
    open_stack: list[tuple[int, str]] = []

    for idx, raw in enumerate(lines, start=1):
        code = strip_comment(raw)
        if not code.strip():
            continue

        m = BLOCK_OPENERS.match(code)
        if m:
            declared.add(m.group(2).lower())
            depth += 1
            open_stack.append((idx, m.group(2)))
        elif BLOCK_CLOSERS.match(code):
            depth -= 1
            if depth < 0:
                f.error(rel, idx, "'end sub/function' without a matching opener")
                depth = 0
            elif open_stack:
                open_stack.pop()

        # Unbalanced double quotes make the compiler swallow the next lines.
        if code.count('"') % 2 == 1:
            f.error(rel, idx, "odd number of double quotes (unterminated string)")

        # roDateTime methods that do not exist.
        for bad, why in BAD_DATETIME_CALLS.items():
            if re.search(rf"\.\s*{bad}\s*\(", code, re.I):
                f.error(rel, idx, f"{bad}(): {why}")

        # AsDateString requires a format argument.
        if re.search(r"\.\s*AsDateString\s*\(\s*\)", code, re.I):
            f.error(rel, idx, 'AsDateString() requires a format argument, e.g. AsDateString("short-date")')

        # callFunc must always be given at least one argument.
        for cm in re.finditer(r'\.callFunc\(\s*"([^"]+)"\s*(\)|,)', code):
            if cm.group(2) == ")":
                f.error(rel, idx, f'callFunc("{cm.group(1)}") passes no argument; callFunc requires at least one')

        # m.top.<childId> is a common confusion with findNode().
        for am in re.finditer(r"m\.top\.(\w+)\s*\.\s*(appendChild|removeChild|getChild)\s*\(", code):
            f.error(rel, idx,
                    f"m.top.{am.group(1)} looks like a child node id, not an interface field; "
                    f'use m.top.findNode("{am.group(1)}")')

    if depth != 0:
        where = open_stack[0][0] if open_stack else None
        name = open_stack[0][1] if open_stack else "?"
        f.error(rel, where, f"unclosed sub/function '{name}' (block depth {depth} at end of file)")

    return {"declared": declared}


def check_xml(path: str, rel: str, f: Findings) -> dict:
    check_bom(path, rel, f)
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        f.error(rel, getattr(exc, "position", (None, None))[0], f"XML parse error: {exc}")
        return {}

    root = tree.getroot()
    if root.tag != "component":
        f.error(rel, None, f"root element must be <component>, found <{root.tag}>")
        return {}

    name = root.get("name")
    if not name:
        f.error(rel, None, "<component> is missing the required name attribute")

    # Fonts: an invalid name renders nothing at all.
    for el in root.iter():
        font = el.get("font")
        if font and font.startswith("font:") and font not in VALID_FONTS:
            f.error(rel, None,
                    f'invalid font "{font}" on <{el.tag} id="{el.get("id", "?")}">; '
                    f"labels with an unknown font render nothing. Valid: {', '.join(sorted(VALID_FONTS))}")

    # Colors: Roku is 0xRRGGBBAA, so a trailing 00 is fully transparent.
    for el in root.iter():
        color = (el.get("color") or "").strip()
        if re.fullmatch(r"0x[0-9A-Fa-f]{8}", color) and color[-2:] == "00":
            f.error(rel, None,
                    f'color "{color}" on <{el.tag} id="{el.get("id", "?")}"> has alpha 00 '
                    f"(Roku is 0xRRGGBBAA) so it is invisible")

    iface = root.find("interface")
    functions = {fn.get("name") for fn in iface.findall("function")} if iface is not None else set()
    fields = {fl.get("id") for fl in iface.findall("field")} if iface is not None else set()
    child_ids = {el.get("id") for el in root.iter() if el.get("id")}

    script = root.find("script")
    script_uri = script.get("uri") if script is not None else None

    return {
        "name": name,
        "functions": functions,
        "fields": fields,
        "child_ids": child_ids,
        "script_uri": script_uri,
    }


def main() -> int:
    root_dir = sys.argv[1] if len(sys.argv) > 1 else "."
    os.chdir(root_dir)
    f = Findings()

    comp_dir = "components"
    if not os.path.isdir(comp_dir):
        print(f"error: no components/ directory under {os.path.abspath('.')}", file=sys.stderr)
        return 1

    brs_files = sorted(
        [os.path.join(comp_dir, n) for n in os.listdir(comp_dir) if n.endswith(".brs")]
        + ([os.path.join("source", n) for n in sorted(os.listdir("source"))
            if n.endswith(".brs")] if os.path.isdir("source") else [])
    )
    xml_files = sorted(os.path.join(comp_dir, n) for n in os.listdir(comp_dir) if n.endswith(".xml"))

    brs_info = {p: check_brs(p, p.replace(os.sep, "/"), f) for p in brs_files}
    xml_info = {p: check_xml(p, p.replace(os.sep, "/"), f) for p in xml_files}

    # Index declared functions by normalised forward-slash path so pkg:/ URIs
    # resolve on Windows too (os.listdir joins with os.sep).
    declared_by_path = {
        p.replace(os.sep, "/"): info.get("declared", set())
        for p, info in brs_info.items()
    }

    # Cross-file: every <script uri> must resolve, and functions promised in an
    # <interface> must actually exist in the paired .brs.
    for xml_path, info in xml_info.items():
        rel = xml_path.replace(os.sep, "/")
        uri = info.get("script_uri")
        if not uri:
            f.error(rel, None, "component has no <script uri=...> element")
            continue
        if not uri.startswith("pkg:/"):
            f.error(rel, None, f'script uri "{uri}" must start with pkg:/')
            continue
        target = uri[len("pkg:/"):]
        if not os.path.isfile(target):
            f.error(rel, None, f'script uri "{uri}" does not resolve to a file ({target} missing)')
            continue

        declared = declared_by_path.get(target, set())
        if declared:
            for fn in sorted(x for x in info.get("functions", set()) if x):
                if fn.lower() not in declared:
                    f.error(rel, None,
                            f'<interface> promises function "{fn}" but {target} does not define it')

    # callFunc targets must be published in the callee's <interface>.
    published: dict[str, set[str]] = {}
    for info in xml_info.values():
        if info.get("name"):
            published[info["name"]] = {x for x in info.get("functions", set()) if x}
    all_published = set().union(*published.values()) if published else set()

    for brs_path in brs_files:
        rel = brs_path.replace(os.sep, "/")
        for idx, raw in enumerate(read_lines(brs_path), start=1):
            code = strip_comment(raw)
            for cm in re.finditer(r'\.callFunc\(\s*"([^"]+)"', code):
                target_fn = cm.group(1)
                if all_published and target_fn not in all_published:
                    f.warn(rel, idx,
                           f'callFunc("{target_fn}") — no component publishes that function in its '
                           f"<interface>; the call will return invalid at runtime")

    for line in f.errors:
        print(line, file=sys.stderr)
    for line in f.warnings:
        print(line, file=sys.stderr)

    n_files = len(brs_files) + len(xml_files)
    if f.errors:
        print(f"\nBrightScript validation FAILED: {len(f.errors)} error(s), "
              f"{len(f.warnings)} warning(s) across {n_files} file(s).", file=sys.stderr)
        return 1

    print(f"BrightScript validation passed: {n_files} file(s) checked, "
          f"{len(f.warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
