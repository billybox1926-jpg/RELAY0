#!/usr/bin/env python3
"""Extract RELAY-0 game constants directly from the BrightScript sources.

Single source of truth: every number the gameplay tests assert against is
parsed out of components/*.brs at run time. Nothing is duplicated here, so
retuning the game cannot leave the tests validating a stale second copy —
either the tests still pass against the new numbers, or they fail loudly.

Exposes:
    tuning()          -> dict of the tuning() table in MainScene.brs
    upgrade_catalog() -> list of upgrade dicts from UpgradesTab.brs
    rule_actions()    -> {action_key: (dP, dH, dT, dC, dHp)} from processRules
    rule_conditions() -> list of condition strings processRules recognises
    node_costs()      -> {action: credit_cost} from NodesTab.brs
    event_count()     -> number of random event branches
"""

from __future__ import annotations

import os
import re

COMPONENTS = "components"
MAIN_SCENE = os.path.join(COMPONENTS, "MainScene.brs")
UPGRADES = os.path.join(COMPONENTS, "UpgradesTab.brs")
NODES = os.path.join(COMPONENTS, "NodesTab.brs")


def _read(path: str) -> str:
    return open(path, encoding="utf-8").read()


def _num(s: str):
    return float(s) if "." in s else int(s)


def tuning() -> dict:
    """Parse the tuning() table. Fails loudly if it moves or is renamed."""
    src = _read(MAIN_SCENE)
    m = re.search(r"function tuning\(\) as object\s*return\s*\{(.*?)\n    \}",
                  src, re.S)
    if not m:
        raise RuntimeError(f"tuning() table not found in {MAIN_SCENE}")
    out = {}
    for key, val in re.findall(r"(\w+)\s*:\s*([0-9.]+)", m.group(1)):
        out[key] = _num(val)
    if not out:
        raise RuntimeError("tuning() parsed but empty")
    return out


def upgrade_catalog() -> list:
    """Parse buildCatalog() in UpgradesTab.brs."""
    src = _read(UPGRADES)
    m = re.search(r"sub buildCatalog\(\)\s*m\.catalog\s*=\s*\[(.*?)\n    \]",
                  src, re.S)
    if not m:
        raise RuntimeError(f"buildCatalog() not found in {UPGRADES}")
    items = []
    for block in re.findall(r"\{(.*?)\}", m.group(1), re.S):
        item = {}
        km = re.search(r'key:\s*"([^"]+)"', block)
        nm = re.search(r'name:\s*"([^"]+)"', block)
        bc = re.search(r"baseCost:\s*([0-9.]+)", block)
        cm = re.search(r"costMult:\s*([0-9.]+)", block)
        ml = re.search(r"maxLevel:\s*([0-9]+)", block)
        if not (km and bc and cm and ml):
            continue
        item["key"] = km.group(1)
        item["name"] = nm.group(1) if nm else km.group(1)
        item["baseCost"] = _num(bc.group(1))
        item["costMult"] = _num(cm.group(1))
        item["maxLevel"] = int(ml.group(1))
        items.append(item)
    if not items:
        raise RuntimeError("buildCatalog() parsed but no items found")
    return items


def rule_actions() -> dict:
    """Parse the action -> resource delta mapping out of processRules().

    Source lines look like:
        if action = "boost_power" then applyResourceChangesQuiet(12, 0, 0, 0, 0)
    """
    src = _read(MAIN_SCENE)
    pat = (r'if action = "(\w+)" then applyResourceChangesQuiet\('
           r'\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)')
    out = {}
    for m in re.finditer(pat, src):
        out[m.group(1)] = tuple(int(m.group(i)) for i in range(2, 7))
    if not out:
        raise RuntimeError("no rule actions parsed from processRules()")
    return out


def rule_conditions() -> list:
    """Parse the condition strings processRules() evaluates."""
    src = _read(MAIN_SCENE)
    body = re.search(r"sub processRules\(\)(.*?)\nend sub", src, re.S)
    if not body:
        raise RuntimeError("processRules() not found")
    conds = re.findall(r'if condition = "([^"]+)"', body.group(1))
    if not conds:
        raise RuntimeError("no rule conditions parsed")
    return conds


def rule_condition_predicates() -> dict:
    """Map each condition string to (field, op, threshold).

    Derived from the condition text itself (e.g. "heat > 70"), then checked
    against the comparison the BrightScript actually performs so a mismatch
    between label and behaviour is caught rather than assumed.
    """
    src = _read(MAIN_SCENE)
    body = re.search(r"sub processRules\(\)(.*?)\nend sub", src, re.S).group(1)
    field_map = {
        "power": "power", "heat": "heat",
        "throughput": "throughput", "health": "health",
    }
    out = {}
    pat = (r'if condition = "([^"]+)" and current(\w+)\s*([<>])\s*(\d+)\s*'
           r'then satisfied = true')
    for m in re.finditer(pat, body):
        label, var, op, thr = m.groups()
        out[label] = {
            "field": field_map.get(var.lower(), var.lower()),
            "op": op,
            "threshold": int(thr),
            "var": var,
        }
    if not out:
        raise RuntimeError("no condition predicates parsed")
    return out


def node_actions() -> dict:
    """Parse node action costs and effects from NodesTab.brs.

    Each action is a `credits >= N` gate followed by `credits - N` and the
    resource mutations it performs. Parsed rather than duplicated so a
    balance change to any cost is picked up automatically.
    """
    src = _read(NODES)
    body = re.search(r"sub performAction\((.*?)\nend sub", src, re.S)
    if not body:
        # Fall back to the whole file if the sub name differs.
        text = src
    else:
        text = body.group(1)

    out = {}
    # Order in the source: overclock, repair, expand, upgrade, restore health
    names = ["overclock", "repair", "expand", "upgrade", "restore_health"]
    costs = [int(m.group(1))
             for m in re.finditer(r"credits = m\.parentScene\.credits - (\d+)", text)]
    for name, cost in zip(names, costs):
        out[name] = {"cost": cost}

    # Effect magnitudes, matched in the same source order.
    tp = re.search(r"throughput \+ (\d+)", text)
    ht = re.search(r"heat \+ (\d+)", text)
    if "overclock" in out:
        out["overclock"]["throughput"] = int(tp.group(1)) if tp else 0
        out["overclock"]["heat"] = int(ht.group(1)) if ht else 0
    hr = re.search(r"m\.parentScene\.heat = (\d+)", text)
    if "repair" in out:
        out["repair"]["heat_reset_to"] = int(hr.group(1)) if hr else None
    hp = re.search(r"networkHealth \+ (\d+)", text)
    if "restore_health" in out:
        out["restore_health"]["health"] = int(hp.group(1)) if hp else 0
    return out


def max_nodes() -> int:
    """Parse the node cap from NodesTab.brs."""
    src = _read(NODES)
    m = re.search(r"if nodeCount >= (\d+)", src)
    if not m:
        raise RuntimeError("node cap not found")
    return int(m.group(1))


def node_costs() -> dict:
    """Backwards-compatible flat mapping of action -> credit cost."""
    return {k: v["cost"] for k, v in node_actions().items()}


def upgrade_effects() -> dict:
    """Parse applyEffect() in UpgradesTab.brs -> {key: (field, amount)}.

    Keys absent from the result are passive (read by onIncomeTick) and have
    no immediate one-off effect.
    """
    src = _read(UPGRADES)
    body = re.search(r"sub applyEffect\(key as string\)(.*?)\nend sub",
                     src, re.S)
    if not body:
        raise RuntimeError(f"applyEffect() not found in {UPGRADES}")
    text = body.group(1)
    out = {}
    # e.g. else if key = "bandwidth" ... throughput + 8
    for m in re.finditer(
            r'key = "(\w+)"(.*?)(?=else if key = "|\n    end if)', text, re.S):
        key, chunk = m.group(1), m.group(2)
        fm = re.search(r"m\.parentScene\.(\w+) = clampVal\("
                       r"m\.parentScene\.\w+ \+ (\d+)", chunk)
        if fm:
            out[key] = (fm.group(1), int(fm.group(2)))
            continue
        if re.search(r"upgradeLevel = m\.parentScene\.upgradeLevel \+ 1", chunk):
            out[key] = ("upgradeLevel", 1)
    return out


def max_rules() -> int:
    """Parse the automation rule cap from AutomationTab.brs."""
    src = _read(os.path.join(COMPONENTS, "AutomationTab.brs"))
    m = re.search(r"count\(\) >= (\d+)", src)
    if not m:
        raise RuntimeError("rule cap not found")
    return int(m.group(1))


def displayed_node_caps() -> dict:
    """Find every place the node cap is written into user-facing text.

    The cap appears in the expansion gate, the Monitor label, and the
    expansion log line. If they disagree the UI lies to the player, so the
    tests assert they all match max_nodes().
    """
    out = {}
    monitor = _read(os.path.join(COMPONENTS, "MonitorTab.brs"))
    m = re.search(r'Active Nodes: " \+ \w+\.toStr\(\) \+ " / (\d+)"', monitor)
    if m:
        out["monitor_label"] = int(m.group(1))
    nodes = _read(NODES)
    m = re.search(r'Total: " \+ [^+]+\+ "/(\d+)"', nodes)
    if m:
        out["expansion_log"] = int(m.group(1))
    m = re.search(r"Maximum nodes reached \((\d+)/(\d+)\)", nodes)
    if m:
        out["max_status"] = int(m.group(2))
    return out


def event_count() -> int:
    """Count reachable random event outcomes in triggerRandomEvent().

    Branches are `if eventType = N` / `else if eventType = N` plus a final
    bare `else` fallback, which is a real outcome and must be counted — the
    roll is rnd(12) and there are only 11 numbered branches, so the else
    handles the twelfth.
    """
    src = _read(MAIN_SCENE)
    body = re.search(r"sub triggerRandomEvent\(\)(.*?)\nend sub", src, re.S)
    if not body:
        raise RuntimeError("triggerRandomEvent() not found")
    numbered = len(re.findall(r"eventType = \d+", body.group(1)))
    has_else = bool(re.search(r"\n    else\n", body.group(1)))
    return numbered + (1 if has_else else 0)


def event_roll_max() -> int:
    """The upper bound of the event roll, i.e. rnd(N)."""
    src = _read(MAIN_SCENE)
    body = re.search(r"sub triggerRandomEvent\(\)(.*?)\nend sub",
                     src, re.S).group(1)
    m = re.search(r"eventType = rnd\((\d+)\)", body)
    if not m:
        raise RuntimeError("event roll bound not found")
    return int(m.group(1))


def event_deltas() -> list:
    """Parse each event branch's resource deltas.

    Lines look like:  deltaT = -8 : deltaC = -5 : deltaHp = -2
    Returns one dict per branch, keyed by delta name.
    """
    src = _read(MAIN_SCENE)
    body = re.search(r"sub triggerRandomEvent\(\)(.*?)\nend sub",
                     src, re.S).group(1)
    branches = []
    # Split on each eventType comparison so deltas group per branch.
    chunks = re.split(r"(?:else )?if eventType = \d+", body)[1:]
    for chunk in chunks:
        d = {}
        for m in re.finditer(r"(delta[A-Za-z]+)\s*=\s*(-?\d+)", chunk):
            d[m.group(1)] = int(m.group(2))
        branches.append(d)
    return branches


def income_multiplier_step() -> float:
    """Parse the per-upgrade-level income multiplier step (0.25 by default)."""
    src = _read(MAIN_SCENE)
    m = re.search(r"upgradeMult = 1\.0 \+ \(upgradeLevel \* ([0-9.]+)\)", src)
    if not m:
        raise RuntimeError("income upgrade multiplier not found")
    return float(m.group(1))


def resource_caps() -> dict:
    """Parse the clamp bounds applied in applyResourceChangesQuiet()."""
    src = _read(MAIN_SCENE)
    body = re.search(r"sub applyResourceChangesQuiet\((.*?)\nend sub",
                     src, re.S)
    if not body:
        raise RuntimeError("applyResourceChangesQuiet() not found")
    out = {}
    for m in re.finditer(r"m\.top\.(\w+) = clamp\([^,]+,\s*(\d+),\s*(\d+)\)",
                         body.group(1)):
        out[m.group(1)] = (int(m.group(2)), int(m.group(3)))
    if not out:
        raise RuntimeError("no clamp bounds parsed")
    return out


if __name__ == "__main__":
    import json
    print(json.dumps({
        "tuning": tuning(),
        "upgrades": upgrade_catalog(),
        "rule_actions": {k: list(v) for k, v in rule_actions().items()},
        "rule_conditions": rule_conditions(),
        "rule_predicates": rule_condition_predicates(),
        "event_count": event_count(),
        "resource_caps": {k: list(v) for k, v in resource_caps().items()},
        "income_step": income_multiplier_step(),
    }, indent=2))
