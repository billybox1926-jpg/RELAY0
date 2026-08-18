#!/usr/bin/env python3
"""Deterministic tests for RELAY-0 save sanitisation and migration.

Mirrors the validation logic in components/MainScene.brs (loadGame,
migrateSave, safeInt/safeFloat, loadRules/loadLogs/loadUpgradeCounts).
BrightScript cannot run off-device, so this asserts the documented
schema contract instead.

Run:
    python3 scripts/test_save_schema.py
"""

from __future__ import annotations

import os
import re
import sys

MAIN_SCENE = os.path.join("components", "MainScene.brs")

DEFAULTS = {
    "credits": 100, "power": 80, "heat": 25, "throughput": 40,
    "nodes": 1, "upgrade": 0, "health": 100, "remainder": 0.0,
    "lastTime": None,
}

# (lo, hi) ranges mirroring loadGame()
RANGES = {
    "credits": (0, 2000000000), "power": (0, 100), "heat": (0, 100),
    "throughput": (0, 100), "nodes": (1, 5), "upgrade": (0, 999),
    "health": (0, 100),
}


def schema_version() -> int:
    """Read SAVE_SCHEMA_VERSION() out of MainScene.brs."""
    src = open(MAIN_SCENE, encoding="utf-8").read()
    m = re.search(r"function SAVE_SCHEMA_VERSION\(\) as integer\s*return\s*(\d+)", src)
    if not m:
        raise SystemExit("could not find SAVE_SCHEMA_VERSION() in " + MAIN_SCENE)
    return int(m.group(1))


def is_numeric_string(s: str) -> bool:
    if not s:
        return False
    body = s[1:] if s[0] in "+-" else s
    return bool(body) and all(c.isdigit() for c in body)


def is_float_string(s: str) -> bool:
    if not s:
        return False
    body = s[1:] if s[0] in "+-" else s
    if body.count(".") > 1:
        return False
    return any(c.isdigit() for c in body) and all(
        c.isdigit() or c == "." for c in body
    )


def safe_int(raw, lo: int, hi: int, fallback: int) -> int:
    """Mirror of safeInt()."""
    if raw is None:
        return fallback
    if isinstance(raw, bool):
        return fallback
    if isinstance(raw, str):
        s = raw.strip()
        if not s or not is_numeric_string(s):
            return fallback
        v = int(s)
    elif isinstance(raw, (int, float)):
        v = int(raw)
    else:
        return fallback
    return max(lo, min(hi, v))


def safe_float(raw, lo: float, hi: float, fallback: float) -> float:
    """Mirror of safeFloat(). Upper bound is exclusive."""
    if raw is None or isinstance(raw, bool):
        return fallback
    if isinstance(raw, str):
        s = raw.strip()
        if not s:
            return fallback
        if not is_float_string(s):
            return fallback
        v = float(s)
    elif isinstance(raw, (int, float)):
        v = float(raw)
    else:
        return fallback
    if v < lo:
        return lo
    if v >= hi:
        return lo
    return v


def load_rules(parsed) -> list:
    """Mirror of loadRules(): keep only well-formed rules, cap at 10."""
    if not isinstance(parsed, list):
        return []
    clean = []
    for r in parsed:
        if not isinstance(r, dict):
            continue
        cond, act = r.get("condition"), r.get("action")
        if isinstance(cond, str) and isinstance(act, str) and cond and act:
            target = r.get("target")
            if not (isinstance(target, str) and target):
                target = "self"
            clean.append({"condition": cond, "action": act, "target": target})
        if len(clean) >= 10:
            break
    return clean


def load_logs(parsed) -> list:
    """Mirror of loadLogs(): non-empty strings only, cap at 100."""
    if not isinstance(parsed, list):
        return []
    clean = []
    for e in parsed:
        if isinstance(e, str) and e:
            clean.append(e)
        elif isinstance(e, int) and not isinstance(e, bool):
            clean.append(str(e))
        if len(clean) >= 100:
            break
    return clean


def load_upgrade_counts(parsed) -> dict:
    """Mirror of loadUpgradeCounts(): string -> non-negative int."""
    if not isinstance(parsed, dict):
        return {}
    clean = {}
    for k, v in parsed.items():
        n = safe_int(v, 0, 999, -1)
        if n >= 0:
            clean[k] = n
    return clean


def parse_save_data(data) -> dict:
    """Mirror of the saveData 'k=v,k=v' scalar parser."""
    raw = {}
    if not isinstance(data, str) or not data:
        return raw
    for part in data.split(","):
        kv = part.split("=")
        if len(kv) == 2:
            key = kv[0].strip()
            if key:
                raw[key] = kv[1].strip()
    return raw


def migrate(state: dict, from_ver: int, current: int) -> dict:
    """Mirror of migrateSave(). Must be idempotent."""
    if from_ver >= current:
        return state
    if from_ver < 3:
        if state["power"] < 30:
            state["power"] = 60
        if state["heat"] > 70:
            state["heat"] = 30
        if state["throughput"] < 30:
            state["throughput"] = 45
        if state["health"] < 50:
            state["health"] = 80
    return state


def load_game(reg: dict, current: int) -> dict:
    """Mirror of loadGame(): sanitise, migrate, then commit."""
    stored_ver = safe_int(reg.get("saveVersion"), 1, 9999, 1)
    raw = parse_save_data(reg.get("saveData"))

    state = {}
    for key, (lo, hi) in RANGES.items():
        state[key] = safe_int(raw.get(key), lo, hi, DEFAULTS[key])
    state["remainder"] = safe_float(raw.get("remainder"), 0.0, 1.0, 0.0)

    last = safe_int(raw.get("lastTime"), 0, 2147483647, 0) if "lastTime" in raw else 0
    state["lastTime"] = last if last > 0 else None

    migrate(state, stored_ver, current)

    state["rules"] = load_rules(reg.get("rules"))
    state["logs"] = load_logs(reg.get("logs"))
    state["upgradeCounts"] = load_upgrade_counts(reg.get("upgradeCounts"))
    state["storedVersion"] = stored_ver
    state["writtenVersion"] = current
    return state


# --------------------------------------------------------------------------
# Tests
# --------------------------------------------------------------------------

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}" + (f" -- {detail}" if detail else ""))
        FAILURES.append(name)


def in_bounds(st: dict) -> bool:
    return (0 <= st["power"] <= 100 and 0 <= st["heat"] <= 100
            and 0 <= st["throughput"] <= 100 and 0 <= st["health"] <= 100
            and st["credits"] >= 0 and 1 <= st["nodes"] <= 5
            and 0.0 <= st["remainder"] < 1.0)


def good_save(ver: int) -> dict:
    return {
        "saveVersion": str(ver),
        "saveData": ("credits=1500,power=72,heat=31,throughput=48,"
                     "nodes=3,lastTime=1700000000,upgrade=4,health=90,"
                     "remainder=0.45"),
        "rules": [{"condition": "heat > 70", "action": "reduce_heat",
                   "target": "self"}],
        "logs": ["08/18 12:00:00: booted"],
        "upgradeCounts": {"cooling": 2, "income": 1},
    }


def test_current_and_older(cur: int) -> None:
    print("\nCurrent save loads unchanged:")
    st = load_game(good_save(cur), cur)
    check("credits preserved", st["credits"] == 1500, str(st["credits"]))
    check("power preserved", st["power"] == 72, str(st["power"]))
    check("heat preserved", st["heat"] == 31, str(st["heat"]))
    check("nodes preserved", st["nodes"] == 3, str(st["nodes"]))
    check("remainder preserved", abs(st["remainder"] - 0.45) < 1e-6)
    check("rules preserved", len(st["rules"]) == 1)
    check("upgradeCounts preserved", st["upgradeCounts"] == {"cooling": 2, "income": 1})
    check("no migration applied at current version",
          st["storedVersion"] == cur)

    print("\nOlder saves migrate automatically:")
    wedged = {
        "saveVersion": "2",
        "saveData": "credits=200,power=0,heat=100,throughput=0,health=10,nodes=1",
    }
    st = load_game(wedged, cur)
    check("v2 wedged power rescued", st["power"] == 60, str(st["power"]))
    check("v2 wedged heat rescued", st["heat"] == 30, str(st["heat"]))
    check("v2 wedged throughput rescued", st["throughput"] == 45)
    check("v2 wedged health rescued", st["health"] == 80)
    check("migrated save is written forward", st["writtenVersion"] == cur)
    check("migrated state in bounds", in_bounds(st))

    print("\nMigrations are idempotent:")
    once = load_game(wedged, cur)
    # Feed the migrated result back in as if it were saved at the new version.
    resaved = {
        "saveVersion": str(cur),
        "saveData": (f"credits={once['credits']},power={once['power']},"
                     f"heat={once['heat']},throughput={once['throughput']},"
                     f"health={once['health']},nodes={once['nodes']}"),
    }
    twice = load_game(resaved, cur)
    same = all(twice[k] == once[k] for k in
               ("credits", "power", "heat", "throughput", "health", "nodes"))
    check("re-loading a migrated save changes nothing", same,
          f"{once} vs {twice}")

    print("\nPre-versioning save (no saveVersion key):")
    st = load_game({"saveData": "credits=50,power=10,heat=95"}, cur)
    check("treated as v1 and migrated", st["power"] == 60 and st["heat"] == 30)
    check("in bounds", in_bounds(st))

    print("\nFuture/unknown version is not discarded:")
    future = dict(good_save(cur))
    future["saveVersion"] = "9999"
    st = load_game(future, cur)
    check("future save keeps its values", st["credits"] == 1500)
    check("future save skips migrations", st["power"] == 72)


def test_malformed(cur: int) -> None:
    print("\nMalformed scalar values fall back to defaults:")
    cases = [
        ("garbage text", "credits=abc,power=xyz,heat=??"),
        ("empty values", "credits=,power=,heat="),
        ("no separators at all", "this is not a save"),
        ("duplicated keys", "power=10,power=90"),
        ("missing values", "credits,power,heat"),
        ("injected junk", "credits=100,,,=,=5,power=50"),
        ("float where int expected", "power=72.9,heat=31.4"),
        ("hex/scientific", "credits=0x10,power=1e3"),
        ("whitespace padding", "  credits = 700 , power = 55 "),
    ]
    for label, data in cases:
        st = load_game({"saveVersion": str(cur), "saveData": data}, cur)
        check(f"{label}: no crash, bounds held", in_bounds(st),
              f"{st}")

    print("\nImpossible ranges are clamped:")
    st = load_game({"saveVersion": str(cur),
                    "saveData": "power=9999,heat=-500,throughput=100000,"
                                "health=-1,nodes=99,credits=-42,upgrade=-7"}, cur)
    check("power clamped to 100", st["power"] == 100, str(st["power"]))
    check("heat clamped to 0", st["heat"] == 0, str(st["heat"]))
    check("throughput clamped to 100", st["throughput"] == 100)
    check("health clamped to 0", st["health"] == 0)
    check("nodes clamped to 5", st["nodes"] == 5, str(st["nodes"]))
    check("negative credits clamped to 0", st["credits"] == 0)
    check("negative upgrade clamped to 0", st["upgrade"] == 0)

    print("\nRemainder is constrained to [0, 1):")
    for raw, expect in (("0.99", 0.99), ("1.5", 1.0 - 1e-9), ("-3", 0.0),
                        ("abc", 0.0), ("", 0.0)):
        st = load_game({"saveData": f"remainder={raw}"}, cur)
        ok = 0.0 <= st["remainder"] < 1.0
        check(f"remainder '{raw}' in [0,1)", ok, str(st["remainder"]))

    print("\nMalformed collections cannot poison live state:")
    bad_collections = [
        ("rules is an object", {"rules": {"not": "an array"}}),
        ("rules is a string", {"rules": "heat > 70"}),
        ("rules has non-dict entries", {"rules": [1, 2, "x", None]}),
        ("rules entries missing keys", {"rules": [{"condition": "heat > 70"}]}),
        ("rules entries wrong types", {"rules": [{"condition": 5, "action": []}]}),
        ("logs is an object", {"logs": {"a": 1}}),
        ("logs has mixed junk", {"logs": ["ok", None, {}, [], 42, ""]}),
        ("upgradeCounts is an array", {"upgradeCounts": [1, 2, 3]}),
        ("upgradeCounts has junk values",
         {"upgradeCounts": {"cooling": "abc", "income": -5, "armor": 3}}),
        ("everything is None",
         {"saveData": None, "rules": None, "logs": None, "upgradeCounts": None}),
    ]
    for label, reg in bad_collections:
        reg = dict(reg)
        reg.setdefault("saveVersion", str(cur))
        st = load_game(reg, cur)
        ok = (isinstance(st["rules"], list) and isinstance(st["logs"], list)
              and isinstance(st["upgradeCounts"], dict) and in_bounds(st))
        check(f"{label}: safe types + bounds", ok, str(st))

    print("\nSurviving entries are kept when only some are bad:")
    st = load_game({
        "saveVersion": str(cur),
        "rules": [
            {"condition": "heat > 70", "action": "reduce_heat"},
            {"condition": 5, "action": "boost_power"},
            "garbage",
            {"condition": "power < 30", "action": "boost_power", "target": "self"},
        ],
        "logs": ["good one", "", None, "another"],
        "upgradeCounts": {"cooling": 2, "bogus": "xx"},
    }, cur)
    check("2 valid rules kept, 2 dropped", len(st["rules"]) == 2,
          str(st["rules"]))
    check("valid rule gets default target",
          st["rules"][0]["target"] == "self")
    check("2 valid logs kept", len(st["logs"]) == 2, str(st["logs"]))
    check("valid upgrade count kept, bad dropped",
          st["upgradeCounts"] == {"cooling": 2}, str(st["upgradeCounts"]))

    print("\nCaps enforced on oversized collections:")
    st = load_game({
        "saveVersion": str(cur),
        "rules": [{"condition": "heat > 70", "action": "reduce_heat"}] * 50,
        "logs": [f"entry {i}" for i in range(500)],
    }, cur)
    check("rules capped at 10", len(st["rules"]) == 10, str(len(st["rules"])))
    check("logs capped at 100", len(st["logs"]) == 100, str(len(st["logs"])))


def test_recovery(cur: int) -> None:
    print("\nRecovery path: empty / absent registry yields defaults:")
    for label, reg in (("completely empty", {}),
                       ("only a version", {"saveVersion": str(cur)}),
                       ("empty strings", {"saveVersion": "", "saveData": ""})):
        st = load_game(reg, cur)
        ok = (st["credits"] == DEFAULTS["credits"]
              and st["throughput"] == DEFAULTS["throughput"]
              and st["nodes"] == DEFAULTS["nodes"]
              and st["rules"] == [] and st["logs"] == []
              and st["upgradeCounts"] == {})
        check(f"{label}: known-good defaults", ok, str(st))
        check(f"{label}: bounds held", in_bounds(st))

    print("\nPartially written save still loads what it can:")
    st = load_game({"saveVersion": str(cur),
                    "saveData": "credits=900,power=6"}, cur)
    check("present fields honoured", st["credits"] == 900)
    check("absent fields use defaults",
          st["throughput"] == DEFAULTS["throughput"]
          and st["health"] == DEFAULTS["health"])
    check("bounds held", in_bounds(st))

    print("\nTruncated save (cut mid-write) does not crash:")
    for data in ("credits=123,pow", "credits=123,power", "credits=123,power=",
                 "cre", "=", ",", "credits=1,,power=2"):
        st = load_game({"saveVersion": str(cur), "saveData": data}, cur)
        check(f"truncated '{data}': safe", in_bounds(st), str(st))

    print("\nlastTime handling:")
    st = load_game({"saveData": "lastTime=0"}, cur)
    check("lastTime=0 treated as unknown", st["lastTime"] is None)
    st = load_game({"saveData": "lastTime=-500"}, cur)
    check("negative lastTime treated as unknown", st["lastTime"] is None)
    st = load_game({"saveData": "lastTime=abc"}, cur)
    check("garbage lastTime treated as unknown", st["lastTime"] is None)
    st = load_game({"saveData": "lastTime=1700000000"}, cur)
    check("valid lastTime kept", st["lastTime"] == 1700000000)


def main() -> int:
    if not os.path.isfile(MAIN_SCENE):
        print(f"error: run from the repo root ({MAIN_SCENE} not found)",
              file=sys.stderr)
        return 1
    cur = schema_version()
    print(f"SAVE_SCHEMA_VERSION = {cur} (read from {MAIN_SCENE})")

    test_current_and_older(cur)
    test_malformed(cur)
    test_recovery(cur)

    print()
    if FAILURES:
        print(f"SAVE SCHEMA TESTS FAILED: {len(FAILURES)} failure(s):",
              file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("All save schema tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
