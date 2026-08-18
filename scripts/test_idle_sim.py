#!/usr/bin/env python3
"""Deterministic tests for RELAY-0 idle (offline) simulation math.

The BrightScript in components/MainScene.brs cannot be executed off-device,
so this file mirrors the same arithmetic and asserts the properties issue #4
asks for. The constants below are parsed directly out of the tuning() table
in MainScene.brs, so if the game is retuned and this file is not updated,
these tests fail rather than silently drifting.

Run:
    python3 scripts/test_idle_sim.py
"""

from __future__ import annotations

import math
import os
import re
import sys

MAIN_SCENE = os.path.join("components", "MainScene.brs")
MAX_ELAPSED = 7 * 24 * 3600  # must match the cap in simulateWhileAway()


def parse_tuning(path: str) -> dict[str, float]:
    """Extract the tuning() table from MainScene.brs."""
    src = open(path, encoding="utf-8").read()
    m = re.search(r"function tuning\(\) as object\s*return\s*\{(.*?)\n    \}", src, re.S)
    if not m:
        raise SystemExit(f"could not locate tuning() table in {path}")
    out: dict[str, float] = {}
    for key, val in re.findall(r"(\w+)\s*:\s*([0-9.]+)", m.group(1)):
        out[key] = float(val)
    return out


def round_half_up(v: float) -> int:
    """Mirror of roundHalfUp() in MainScene.brs."""
    if v >= 0:
        return int(v + 0.5)
    return -int(-v + 0.5)


def power_equilibrium(t, reactor=0, battery=0, nodes=1) -> int:
    v = (t["powerBase"] + reactor * t["powerPerReactor"]
         + battery * t["powerPerBattery"] - nodes * t["powerPerNode"])
    return int(max(t["powerMin"], min(100, v)))


def heat_equilibrium(t, cooling=0) -> int:
    return int(max(t["heatMin"], t["heatBase"] - cooling * t["heatPerCooling"]))


def throughput_equilibrium(t, bandwidth=0) -> int:
    return int(min(100, t["throughputBase"] + bandwidth * t["throughputPerBand"]))


class State:
    """Mirror of the subset of m.top / m that simulateWhileAway() touches."""

    def __init__(self, credits=100, power=80, heat=25, throughput=40,
                 health=100, nodes=1, upgrade_level=0, remainder=0.0):
        self.credits = credits
        self.power = power
        self.heat = heat
        self.throughput = throughput
        self.health = health
        self.nodes = nodes
        self.upgrade_level = upgrade_level
        self.remainder = remainder


def simulate(t, st: State, elapsed: float, upgrades=None) -> int:
    """Mirror of simulateWhileAway(). Returns credits awarded this call."""
    upgrades = upgrades or {}

    # Clock anomaly guards
    if elapsed < 0:
        return 0
    if elapsed > MAX_ELAPSED:
        elapsed = MAX_ELAPSED
    if elapsed < 1:
        return 0

    reactor = upgrades.get("reactor", 0)
    battery = upgrades.get("battery", 0)
    cooling = upgrades.get("cooling", 0)
    bandwidth = upgrades.get("bandwidth", 0)

    # Credits with carried remainder
    rate = t["offlineRate"] * (st.throughput / 50.0) * (1.0 + st.upgrade_level * 0.25)
    rate = max(rate, t["offlineFloor"])
    minutes = elapsed / 60.0
    exact = rate * minutes + st.remainder
    awarded = int(exact)              # floor
    st.remainder = exact - awarded
    st.credits = max(0, st.credits + awarded)

    # Levels blend toward equilibrium
    p_t = power_equilibrium(t, reactor, battery, st.nodes)
    h_t = heat_equilibrium(t, cooling)
    q_t = throughput_equilibrium(t, bandwidth)
    blend = min(1.0, minutes / t["settleMinutes"])

    st.power = max(0, min(100, round_half_up(st.power + (p_t - st.power) * blend)))
    st.heat = max(0, min(100, round_half_up(st.heat + (h_t - st.heat) * blend)))
    st.throughput = max(0, min(100, round_half_up(st.throughput + (q_t - st.throughput) * blend)))
    st.health = max(0, min(100, st.health + int(minutes / 2.0)))
    return awarded


# --------------------------------------------------------------------------

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}" + (f" -- {detail}" if detail else ""))
        FAILURES.append(name)


def main() -> int:
    if not os.path.isfile(MAIN_SCENE):
        print(f"error: run from the repo root ({MAIN_SCENE} not found)", file=sys.stderr)
        return 1
    t = parse_tuning(MAIN_SCENE)
    print(f"tuning() parsed: {len(t)} constants from {MAIN_SCENE}\n")

    print("Documented intervals (30s / 60s / 5min / long):")
    for label, secs in (("30 seconds", 30), ("60 seconds", 60),
                        ("5 minutes", 300), ("8 hours", 8 * 3600)):
        st = State()
        awarded = simulate(t, st, secs)
        print(f"  {label:11} -> +{awarded:6d} cr  power={st.power:3d} "
              f"heat={st.heat:3d} thr={st.throughput:3d} hp={st.health:3d} "
              f"carry={st.remainder:.4f}")
        check(f"{label}: bounds respected",
              0 <= st.power <= 100 and 0 <= st.heat <= 100
              and 0 <= st.throughput <= 100 and 0 <= st.health <= 100)
        check(f"{label}: credits never negative", st.credits >= 0)
        check(f"{label}: remainder in [0,1)", 0.0 <= st.remainder < 1.0,
              f"got {st.remainder}")

    print("\nShort absences are not silently lost (remainder carries):")
    # 10 consecutive 30s absences must award the same as one 300s absence.
    a = State()
    total_short = sum(simulate(t, a, 30) for _ in range(10))
    b = State()
    total_long = simulate(t, b, 300)
    check("10x30s credits == 1x300s credits (no truncation loss)",
          total_short == total_long, f"{total_short} vs {total_long}")

    # Many tiny absences must still accumulate rather than round to zero.
    c = State()
    tiny_total = sum(simulate(t, c, 5) for _ in range(60))  # 60 x 5s = 300s
    check("60x5s accumulates credit (not truncated to 0)", tiny_total > 0,
          f"awarded {tiny_total}")
    check("60x5s roughly equals 1x300s", abs(tiny_total - total_long) <= 1,
          f"{tiny_total} vs {total_long}")

    print("\nClock anomalies cannot corrupt state:")
    d = State(credits=500)
    before = d.credits
    awarded = simulate(t, d, -3600)  # clock moved backwards an hour
    check("negative elapsed awards nothing", awarded == 0 and d.credits == before,
          f"awarded {awarded}")
    check("negative elapsed leaves levels untouched",
          d.power == 80 and d.heat == 25 and d.throughput == 40)

    e = State()
    awarded_huge = simulate(t, e, 10**9)  # absurd epoch glitch
    capped = State()
    awarded_cap = simulate(t, capped, MAX_ELAPSED)
    check("absurd elapsed is clamped to the 7-day cap",
          awarded_huge == awarded_cap, f"{awarded_huge} vs {awarded_cap}")
    check("clamped run keeps levels in bounds",
          0 <= e.power <= 100 and 0 <= e.heat <= 100 and 0 <= e.health <= 100)

    f = State()
    check("sub-second elapsed is a no-op", simulate(t, f, 0.4) == 0)

    print("\nEquilibrium behaviour:")
    # Starting in the red must recover, never worsen.
    g = State(power=0, heat=100, throughput=0, health=10)
    simulate(t, g, 3600)
    check("a wedged save recovers toward equilibrium",
          g.power > 0 and g.heat < 100 and g.throughput > 0 and g.health > 10,
          f"power={g.power} heat={g.heat} thr={g.throughput} hp={g.health}")

    # Upgrades must raise the targets.
    base = power_equilibrium(t, 0, 0, 1)
    upgraded = power_equilibrium(t, 3, 2, 1)
    check("reactor/battery upgrades raise the power target", upgraded > base,
          f"{base} -> {upgraded}")
    check("cooling upgrades lower the heat target",
          heat_equilibrium(t, 3) < heat_equilibrium(t, 0))
    check("bandwidth upgrades raise the throughput target",
          throughput_equilibrium(t, 3) > throughput_equilibrium(t, 0))
    check("more nodes lower the power target",
          power_equilibrium(t, 0, 0, 5) < power_equilibrium(t, 0, 0, 1))

    print("\nMonotonicity:")
    prev = -1
    ok = True
    for secs in (60, 120, 300, 900, 3600, 7200):
        st = State()
        got = simulate(t, st, secs)
        if got < prev:
            ok = False
        prev = got
    check("longer absence never awards fewer credits", ok)

    print()
    if FAILURES:
        print(f"IDLE SIM TESTS FAILED: {len(FAILURES)} failure(s): {FAILURES}",
              file=sys.stderr)
        return 1
    print("All idle simulation tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
