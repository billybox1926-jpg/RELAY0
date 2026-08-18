#!/usr/bin/env python3
"""Static contract tests for RELAY-0 timer and observer lifecycle (#10).

Timer behaviour cannot be executed off-device, so these tests assert the
structural invariants documented in docs/TIMER_AUDIT.md by parsing the
BrightScript sources. They catch the regressions that matter: an unguarded
timer starter, a dialog observer without a matching unobserve, a callback
that can leave the re-entrancy guard stuck, or a lost shutdown flush.

Run:
    python3 scripts/test_timer_lifecycle.py
"""

from __future__ import annotations

import os
import re
import sys

COMPONENTS = "components"
MAIN_SCENE = os.path.join(COMPONENTS, "MainScene.brs")
MAIN_BRS = os.path.join("source", "main.brs")
TAB_FILES = ["AutomationTab.brs", "LogsTab.brs", "NodesTab.brs"]

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}" + (f" -- {detail}" if detail else ""))
        FAILURES.append(name)


def read(path: str) -> str:
    return open(path, encoding="utf-8").read()


def strip_comments(src: str) -> str:
    """Drop BrightScript line comments so they don't match as code."""
    out = []
    for line in src.split("\n"):
        in_str = False
        cut = len(line)
        for i, ch in enumerate(line):
            if ch == '"':
                in_str = not in_str
            elif ch == "'" and not in_str:
                cut = i
                break
        out.append(line[:cut])
    return "\n".join(out)


def body_of(src: str, header: str) -> str:
    """Return the body of a sub/function starting at `header`."""
    i = src.find(header)
    if i < 0:
        return ""
    depth = 0
    lines = src[i:].split("\n")
    collected = []
    for ln in lines:
        collected.append(ln)
        s = ln.strip().lower()
        if re.match(r"^(sub|function)\b", s):
            depth += 1
        elif re.match(r"^end\s+(sub|function)\b", s):
            depth -= 1
            if depth == 0:
                break
    return "\n".join(collected)


def test_timers(ms: str) -> None:
    print("\nTimer inventory and guards:")
    creations = re.findall(r'(\w+)\s*=\s*m\.top\.createChild\("Timer"\)', ms)
    check("exactly 3 Timer nodes created", len(creations) == 3, str(creations))
    for name in ("m.incomeTimer", "m.eventTimer", "m.saveTimer"):
        check(f"{name} is created", any(name.split(".")[-1] in c for c in creations),
              str(creations))

    for starter in ("startIncomeTimer", "startEventTimer"):
        body = body_of(ms, f"sub {starter}()")
        check(f"{starter}() exists", bool(body))
        guarded = "<> invalid" in body and "return" in body
        check(f"{starter}() guards against a second start", guarded,
              "no early-return guard found")

    save_body = body_of(ms, "sub markDirty()")
    check("markDirty() only creates saveTimer when invalid",
          "if m.saveTimer = invalid" in save_body, save_body[:120])
    check("markDirty() restarts rather than stacking",
          'control = "stop"' in save_body and 'control = "start"' in save_body)

    check("repeating timers are declared repeat = true",
          ms.count("repeat = true") >= 2)
    check("saveTimer is one-shot (repeat = false)",
          "m.saveTimer.repeat = false" in ms)


def test_observers(ms: str) -> None:
    print("\nObserver attachment:")
    obs = re.findall(r'(\w+(?:\.\w+)*)\.observeField\("(\w+)",\s*"(\w+)"\)', ms)
    fire_obs = [o for o in obs if o[1] == "fire"]
    check("3 timer 'fire' observers in MainScene", len(fire_obs) == 3, str(fire_obs))

    callbacks = {o[2] for o in fire_obs}
    for cb in ("onIncomeTick", "onEventTimer", "onSaveTimer"):
        check(f"{cb} is the handler for exactly one timer",
              sum(1 for o in fire_obs if o[2] == cb) == 1)
        check(f"{cb}() is defined", f"sub {cb}(" in ms)

    # Each observeField on a timer must sit inside its starter/creator, not
    # in a code path that could run repeatedly.
    for starter, cb in (("startIncomeTimer", "onIncomeTick"),
                        ("startEventTimer", "onEventTimer"),
                        ("markDirty", "onSaveTimer")):
        body = body_of(ms, f"sub {starter}()")
        check(f"{cb} observer is attached inside {starter}()",
              f'"{cb}"' in body, "attached elsewhere")


def test_shutdown(ms: str, main: str) -> None:
    print("\nShutdown path (debounce must not lose the final mutation):")
    check("main.brs signals the scene on screen close",
          "isScreenClosed" in main and "shutdown" in main, main[:200])
    check("MainScene declares a shutdown field with onChange",
          'id="shutdown"' in read(os.path.join(COMPONENTS, "MainScene.xml"))
          and 'onChange="onShutdown"' in read(os.path.join(COMPONENTS, "MainScene.xml")))

    body = body_of(ms, "sub onShutdown()")
    check("onShutdown() exists", bool(body))
    check("onShutdown() stops timers", "stopAllTimers" in body, body[:160])
    check("onShutdown() flushes the save", "flushSave" in body, body[:160])

    stop_body = body_of(ms, "sub stopAllTimers()")
    for t in ("m.incomeTimer", "m.eventTimer", "m.saveTimer"):
        check(f"stopAllTimers() stops {t}", t in stop_body)

    flush_body = body_of(ms, "sub flushSave(")
    check("flushSave() is unconditional (not gated on saveDirty)",
          "if m.saveDirty" not in flush_body, flush_body[:200])
    check("flushSave() stops the pending debounce timer",
          'control = "stop"' in flush_body)


def test_dialog_observers() -> None:
    print("\nDialog observer lifecycle (per tab):")
    for name in TAB_FILES:
        path = os.path.join(COMPONENTS, name)
        src = strip_comments(read(path))

        n_observe = len(re.findall(r'\.observeField\("buttonSelected"', src))
        check(f"{name}: has dialog observer(s)", n_observe > 0, str(n_observe))

        check(f"{name}: defines closeDialog()", "sub closeDialog()" in src)
        cd = body_of(src, "sub closeDialog()")
        check(f"{name}: closeDialog() unobserves buttonSelected",
              'unobserveField("buttonSelected")' in cd, cd[:160])
        check(f"{name}: closeDialog() releases the dialog node",
              "scene.dialog = invalid" in cd, cd[:160])
        check(f"{name}: closeDialog() clears the re-entrancy guard",
              "m.dialogBusy = false" in cd, cd[:160])

        # No callback may still null the dialog without unobserving.
        check(f"{name}: no raw 'getScene().dialog = invalid' left",
              "getScene().dialog = invalid" not in src)


def test_reentrancy() -> None:
    print("\nRe-entrancy guards (rapid OK must not double-execute):")
    callbacks = {
        "AutomationTab.brs": ["onConditionSelected", "onActionSelected"],
        "LogsTab.brs": ["onClearConfirm"],
        "NodesTab.brs": ["onActionChosen"],
    }
    for name, cbs in callbacks.items():
        src = strip_comments(read(os.path.join(COMPONENTS, name)))
        for cb in cbs:
            body = body_of(src, f"sub {cb}(")
            check(f"{name}:{cb} exists", bool(body))
            check(f"{name}:{cb} checks the guard first",
                  "if m.dialogBusy = true then return" in body, body[:140])
            check(f"{name}:{cb} sets the guard", "m.dialogBusy = true" in body)

            # Critical: every early return must release the guard, or all
            # dialogs wedge permanently after the first dismissal.
            releases = body.count("m.dialogBusy = false")
            closes = body.count("closeDialog()")
            check(f"{name}:{cb} releases the guard on every exit path",
                  releases + closes >= 2,
                  f"{releases} explicit release(s) + {closes} closeDialog()")


def test_input_guards() -> None:
    print("\nInput resilience guards (#11):")
    # Dialog openers must refuse to stack.
    openers = {
        "NodesTab.brs": "sub showActionDialog()",
        "AutomationTab.brs": "sub showRuleBuilder()",
    }
    for name, head in openers.items():
        src = strip_comments(read(os.path.join(COMPONENTS, name)))
        body = body_of(src, head)
        check(f"{name}: {head} exists", bool(body))
        check(f"{name}: refuses to open when a dialog is already present",
              "scene.dialog <> invalid" in body, body[:200])
        check(f"{name}: also checks the busy flag",
              "m.dialogBusy = true then return" in body, body[:200])

    logs = strip_comments(read(os.path.join(COMPONENTS, "LogsTab.brs")))
    check("LogsTab: clear-confirm refuses to stack dialogs",
          "scene.dialog <> invalid" in logs)

    # Action cooldowns: guarding the dialog alone still allowed ~10 actions
    # from a 20-press burst, because bursts form open->confirm pairs.
    cooldowns = {
        "NodesTab.brs": "m.lastNodeActionAt",
        "UpgradesTab.brs": "m.lastPurchaseAt",
        "AutomationTab.brs": "m.lastRuleAddAt",
    }
    for name, var in cooldowns.items():
        src = strip_comments(read(os.path.join(COMPONENTS, name)))
        check(f"{name}: has a {var} cooldown", var in src)
        check(f"{name}: cooldown compares against AsSeconds()",
              "AsSeconds()" in src)

    autom = strip_comments(read(os.path.join(COMPONENTS, "AutomationTab.brs")))
    check("AutomationTab: rule deletion is debounced",
          "m.lastDeleteAt" in autom)

    # A cooldown that calls a helper the component lacks would crash.
    for name in ("NodesTab.brs", "UpgradesTab.brs"):
        src = read(os.path.join(COMPONENTS, name))
        if "setStatus(" in src:
            check(f"{name}: defines setStatus() it calls",
                  "sub setStatus(" in src)
    check("AutomationTab: does not call an undefined setStatus()",
          "setStatus(" not in autom or "sub setStatus(" in autom)


def main() -> int:
    for p in (MAIN_SCENE, MAIN_BRS):
        if not os.path.isfile(p):
            print(f"error: run from the repo root ({p} not found)", file=sys.stderr)
            return 1

    ms = strip_comments(read(MAIN_SCENE))
    main_src = strip_comments(read(MAIN_BRS))

    print("Timer / observer lifecycle contract tests")

    test_timers(ms)
    test_observers(ms)
    test_shutdown(ms, main_src)
    test_dialog_observers()
    test_reentrancy()
    test_input_guards()

    print()
    if FAILURES:
        print(f"TIMER LIFECYCLE TESTS FAILED: {len(FAILURES)} failure(s):",
              file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("All timer lifecycle tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
