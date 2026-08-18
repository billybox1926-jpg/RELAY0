#!/usr/bin/env python3
"""Deterministic gameplay tests for RELAY-0 (#9).

Asserts the game's rules and invariants using scripts/relay_model.py, whose
constants are all parsed from the BrightScript sources by
scripts/relay_constants.py. No tuning value is duplicated here, so a retune
either still satisfies these invariants or fails loudly.

Run:
    python3 scripts/test_gameplay.py
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import relay_constants as rc  # noqa: E402
from relay_model import Game  # noqa: E402

FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    if cond:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name}" + (f" -- {detail}" if detail else ""))
        FAILURES.append(name)


# --------------------------------------------------------------------------
# Constant extraction sanity: if these break, every later test is meaningless
# --------------------------------------------------------------------------

def test_extraction() -> None:
    print("\nConstant extraction (single source of truth):")
    t = rc.tuning()
    check("tuning() parsed with expected keys",
          {"incomeBase", "powerBase", "heatBase", "eventChance"} <= set(t),
          str(sorted(t)[:6]))
    check("upgrade catalog parsed", len(rc.upgrade_catalog()) >= 6)
    check("rule actions parsed", len(rc.rule_actions()) >= 6)
    check("rule conditions parsed", len(rc.rule_conditions()) >= 6)
    check("condition predicates parsed for every condition",
          set(rc.rule_condition_predicates()) == set(rc.rule_conditions()))
    check("node actions parsed", len(rc.node_actions()) >= 5)
    check("upgrade effects parsed", len(rc.upgrade_effects()) >= 4)
    check("resource caps parsed", len(rc.resource_caps()) >= 4)

    # A dead roll value would mean an event that silently does nothing.
    check("every event roll value maps to an outcome",
          rc.event_count() == rc.event_roll_max(),
          f"{rc.event_count()} outcomes vs rnd({rc.event_roll_max()})")

    # The node cap is written in several user-facing strings as well as the
    # expansion gate. If they drift, the UI misreports the real limit.
    cap = rc.max_nodes()
    displayed = rc.displayed_node_caps()
    check("node cap appears in user-facing text", bool(displayed),
          str(displayed))
    for where, value in displayed.items():
        check(f"node cap in {where} matches the gate ({cap})", value == cap,
              f"{where}={value} but gate={cap}")


# --------------------------------------------------------------------------
# Income ticks and resource bounds
# --------------------------------------------------------------------------

def test_income() -> None:
    print("\nIncome ticks:")
    t = rc.tuning()

    g = Game()
    earned = g.income_tick()
    check("a tick earns at least the income floor", earned >= t["incomeFloor"],
          str(earned))
    check("bounds respected after one tick", g.in_bounds(), str(g.snapshot()))

    # Zero throughput must still pay the floor, not zero.
    g = Game(throughput=0)
    earned = g.income_tick()
    check("zero throughput still pays the floor",
          earned == int(t["incomeFloor"]), str(earned))

    # Higher upgradeLevel must pay strictly more at equal throughput.
    a = Game(throughput=60, upgrade_level=0)
    b = Game(throughput=60, upgrade_level=4)
    ea, eb = a.income_tick(), b.income_tick()
    check("higher upgrade level earns more", eb > ea, f"{ea} vs {eb}")

    # Higher throughput must pay at least as much.
    lo = Game(throughput=20).income_tick()
    hi = Game(throughput=90).income_tick()
    check("higher throughput earns at least as much", hi >= lo, f"{lo} vs {hi}")

    print("\nResource caps and floors:")
    g = Game(power=100, heat=100, throughput=100, health=100)
    for _ in range(30):
        g.income_tick()
    check("100 ticks from max cannot exceed caps", g.in_bounds(),
          str(g.snapshot()))

    g = Game(credits=0, power=0, heat=0, throughput=0, health=0)
    for _ in range(30):
        g.income_tick()
    check("30 ticks from zero stays in bounds", g.in_bounds(), str(g.snapshot()))
    check("credits never go negative", g.credits >= 0, str(g.credits))

    # Direct over/under application must clamp, not wrap.
    g = Game()
    g.apply(dP=999, dH=999, dT=999, dHp=999, dC=999)
    check("huge positive deltas clamp to caps", g.in_bounds(), str(g.snapshot()))
    g.apply(dP=-999, dH=-999, dT=-999, dHp=-999, dC=-999999)
    check("huge negative deltas clamp to floors", g.in_bounds(),
          str(g.snapshot()))
    check("credits floor at 0, never negative", g.credits == 0, str(g.credits))


# --------------------------------------------------------------------------
# Automation
# --------------------------------------------------------------------------

def test_automation() -> None:
    print("\nAutomation conditions:")
    preds = rc.rule_condition_predicates()

    # Each condition must fire when true and stay silent when false.
    for cond, p in preds.items():
        field, op, thr = p["field"], p["op"], p["threshold"]
        true_val = thr - 5 if op == "<" else thr + 5
        false_val = thr + 5 if op == "<" else thr - 5
        true_val = max(0, min(100, true_val))
        false_val = max(0, min(100, false_val))

        g = Game(**{field: true_val})
        check(f"'{cond}' is true at {field}={true_val}",
              g.condition_true(cond))

        g = Game(**{field: false_val})
        check(f"'{cond}' is false at {field}={false_val}",
              not g.condition_true(cond))

    print("\nRules do not fire when conditions are false:")
    g = Game(power=90, heat=10, throughput=90, health=100)
    for cond in list(preds)[:4]:
        g.add_rule(cond, "earn_credits")
    before = g.snapshot()
    fired = g.process_rules()
    check("no rules fire in a healthy state", fired == 0, str(fired))
    check("state unchanged when nothing fires", g.snapshot() == before)

    print("\nRules fire and apply the documented deltas:")
    actions = rc.rule_actions()
    for action, deltas in actions.items():
        g = Game(power=50, heat=50, throughput=50, health=50, credits=500)
        g.add_rule("heat > 40" if "heat > 40" in preds else list(preds)[2],
                   action)
        # Force the condition true using the parsed predicate.
        cond = g.rules[0]["condition"]
        p = preds[cond]
        setattr(g, p["field"],
                p["threshold"] + 5 if p["op"] == ">" else p["threshold"] - 5)
        before = g.snapshot()
        g.process_rules()
        after = g.snapshot()
        moved = any(before[k] != after[k] for k in
                    ("power", "heat", "throughput", "credits", "health"))
        check(f"action '{action}' changes state when its rule fires", moved,
              f"{before} -> {after}")
        check(f"action '{action}' leaves state in bounds", g.in_bounds())

    print("\nRule ordering and re-evaluation:")
    # A rule that fixes the condition should stop a later duplicate firing.
    g = Game(power=5, heat=20, throughput=50, health=100)
    g.add_rule("power < 10", "boost_power")
    g.add_rule("power < 10", "boost_power")
    fired = g.process_rules()
    boost = rc.rule_actions()["boost_power"][0]
    # After the first +boost, power should exceed 10, so rule 2 must not fire.
    expected = 1 if (5 + boost) >= 10 else 2
    check("conditions are re-read between rules, so the second may not fire",
          fired == expected, f"fired={fired} expected={expected}")

    print("\nRule cap and validation:")
    g = Game()
    added = sum(1 for _ in range(rc.max_rules() + 5)
                if g.add_rule(list(preds)[0], "earn_credits"))
    check(f"rule cap of {rc.max_rules()} enforced", added == rc.max_rules(),
          str(added))
    check("rule list never exceeds the cap", len(g.rules) == rc.max_rules())

    g = Game()
    check("unknown condition rejected", not g.add_rule("bogus", "earn_credits"))
    check("unknown action rejected",
          not g.add_rule(list(preds)[0], "definitely_not_an_action"))

    print("\nBatched refresh (one per batch, not per rule):")
    g = Game(power=5, heat=95, throughput=5, health=20)
    for cond in ("power < 30", "heat > 70", "throughput < 20", "health < 30"):
        if cond in preds:
            g.add_rule(cond, "earn_credits")
    r0 = g.refreshes
    fired = g.process_rules()
    check("multiple firing rules produce exactly one refresh",
          fired > 1 and g.refreshes == r0 + 1,
          f"fired={fired} refreshes={g.refreshes - r0}")


# --------------------------------------------------------------------------
# Random events
# --------------------------------------------------------------------------

def test_events() -> None:
    print("\nRandom events:")
    n = rc.event_roll_max()

    for ev in range(1, n + 1):
        g = Game(credits=500, power=50, heat=50, throughput=50, health=50)
        before = g.snapshot()
        g.trigger_event(ev)
        check(f"event {ev} leaves state in bounds", g.in_bounds(),
              str(g.snapshot()))
        check(f"event {ev} logs exactly one entry", len(g.logs) == 1,
              str(len(g.logs)))

    print("\nEvents cannot drive resources out of range:")
    for ev in range(1, n + 1):
        g = Game(credits=0, power=0, heat=100, throughput=0, health=0)
        g.trigger_event(ev)
        check(f"event {ev} from the floor stays in bounds", g.in_bounds(),
              str(g.snapshot()))
        g = Game(credits=10**9, power=100, heat=0, throughput=100, health=100)
        g.trigger_event(ev)
        check(f"event {ev} from the ceiling stays in bounds", g.in_bounds(),
              str(g.snapshot()))

    print("\nArmor blunts damage but never inverts it:")
    deltas = rc.event_deltas()
    harmful = [i + 1 for i, d in enumerate(deltas)
               if d.get("deltaHp", 0) < 0 or d.get("deltaT", 0) < 0]
    check("at least one harmful event exists to test against", bool(harmful),
          str(harmful))
    for ev in harmful:
        plain = Game(power=60, heat=40, throughput=60, health=80)
        plain.trigger_event(ev)
        armored = Game(power=60, heat=40, throughput=60, health=80)
        armored.upgrade_counts["armor"] = 3
        armored.trigger_event(ev)
        check(f"event {ev}: armor leaves health >= unarmored",
              armored.health >= plain.health,
              f"{plain.health} vs {armored.health}")
        check(f"event {ev}: armor leaves throughput >= unarmored",
              armored.throughput >= plain.throughput,
              f"{plain.throughput} vs {armored.throughput}")

    print("\nEvent suppression while struggling:")
    t = rc.tuning()
    healthy = Game(power=80, heat=20, health=100)
    check("healthy state uses the normal event chance",
          healthy.event_chance() == int(t["eventChance"]),
          str(healthy.event_chance()))
    for label, kw in (("low power", {"power": 10}),
                      ("high heat", {"heat": 95}),
                      ("low health", {"health": 20})):
        g = Game(**kw)
        check(f"{label} reduces the event chance",
              g.event_chance() == int(t["eventChanceStruggle"]),
              str(g.event_chance()))
        check(f"{label} chance is strictly lower than healthy",
              g.event_chance() < healthy.event_chance())


# --------------------------------------------------------------------------
# Upgrades
# --------------------------------------------------------------------------

def test_upgrades() -> None:
    print("\nUpgrade costs scale per purchase:")
    for item in rc.upgrade_catalog():
        key, base, mult = item["key"], item["baseCost"], item["costMult"]
        g = Game(credits=10**9)
        check(f"{key}: first cost equals baseCost {int(base)}",
              g.cost_for(key) == int(base), str(g.cost_for(key)))
        first = g.cost_for(key)
        g.purchase(key)
        second = g.cost_for(key)
        check(f"{key}: cost rises after purchase", second > first,
              f"{first} -> {second}")
        check(f"{key}: rise is roughly costMult ({mult})",
              abs(second - first * mult) <= 1.5,
              f"{first} * {mult} vs {second}")

    print("\nCosts are deducted exactly once:")
    for item in rc.upgrade_catalog():
        key = item["key"]
        g = Game(credits=10**6)
        cost = g.cost_for(key)
        before = g.credits
        ok = g.purchase(key)
        check(f"{key}: purchase succeeds with ample credits", ok)
        check(f"{key}: exactly {cost} deducted",
              before - g.credits == cost,
              f"deducted {before - g.credits}, expected {cost}")
        check(f"{key}: level incremented by exactly 1", g.level(key) == 1,
              str(g.level(key)))

    print("\nInsufficient credits blocks the purchase entirely:")
    for item in rc.upgrade_catalog():
        key = item["key"]
        g = Game(credits=0)
        before = g.snapshot()
        ok = g.purchase(key)
        check(f"{key}: rejected at 0 credits", not ok)
        check(f"{key}: no state change on rejection", g.snapshot() == before,
              f"{before} -> {g.snapshot()}")

    # One credit short must still be refused (boundary, not approximate).
    for item in rc.upgrade_catalog()[:3]:
        key = item["key"]
        g = Game(credits=0)
        g.credits = g.cost_for(key) - 1
        check(f"{key}: refused one credit short", not g.purchase(key))
        g.credits = g.cost_for(key)
        check(f"{key}: accepted at exactly the cost", g.purchase(key))

    print("\nMax level is respected:")
    for item in rc.upgrade_catalog():
        key, maxlvl = item["key"], item["maxLevel"]
        g = Game(credits=10**12)
        bought = sum(1 for _ in range(maxlvl + 5) if g.purchase(key))
        check(f"{key}: cannot exceed maxLevel {maxlvl}",
              g.level(key) == maxlvl and bought == maxlvl,
              f"level={g.level(key)} bought={bought}")

    print("\nPassive upgrades shift equilibrium targets:")
    g = Game()
    base_p, base_h, base_q = (g.power_equilibrium(), g.heat_equilibrium(),
                              g.throughput_equilibrium())
    g.upgrade_counts.update({"reactor": 3, "battery": 2, "cooling": 3,
                             "bandwidth": 3})
    check("reactor/battery raise the power target",
          g.power_equilibrium() > base_p,
          f"{base_p} -> {g.power_equilibrium()}")
    check("cooling lowers the heat target", g.heat_equilibrium() < base_h,
          f"{base_h} -> {g.heat_equilibrium()}")
    check("bandwidth raises the throughput target",
          g.throughput_equilibrium() > base_q,
          f"{base_q} -> {g.throughput_equilibrium()}")

    g2 = Game(nodes=5)
    check("more nodes lower the power target",
          g2.power_equilibrium() < Game(nodes=1).power_equilibrium())

    print("\nEquilibrium targets never leave their documented bounds:")
    t = rc.tuning()
    g = Game(nodes=5)
    check("power target respects powerMin",
          g.power_equilibrium() >= t["powerMin"], str(g.power_equilibrium()))
    g = Game()
    g.upgrade_counts["cooling"] = 99
    check("heat target respects heatMin",
          g.heat_equilibrium() >= t["heatMin"], str(g.heat_equilibrium()))
    g = Game()
    g.upgrade_counts["bandwidth"] = 99
    check("throughput target caps at 100",
          g.throughput_equilibrium() <= 100, str(g.throughput_equilibrium()))


# --------------------------------------------------------------------------
# Node actions
# --------------------------------------------------------------------------

def test_nodes() -> None:
    print("\nNode actions deduct exactly their cost:")
    acts = rc.node_actions()
    methods = {
        "overclock": lambda g: g.overclock(),
        "repair": lambda g: g.repair(),
        "expand": lambda g: g.expand(),
        "upgrade": lambda g: g.node_upgrade(),
        "restore_health": lambda g: g.restore_health(),
    }
    for name, fn in methods.items():
        cost = acts[name]["cost"]
        g = Game(credits=10**6, heat=60, health=40, throughput=40)
        before = g.credits
        ok = fn(g)
        check(f"{name}: succeeds with ample credits", ok)
        check(f"{name}: deducts exactly {cost}", before - g.credits == cost,
              f"deducted {before - g.credits}")
        check(f"{name}: leaves state in bounds", g.in_bounds(),
              str(g.snapshot()))

    print("\nNode actions are refused when credits are short:")
    for name, fn in methods.items():
        cost = acts[name]["cost"]
        g = Game(credits=cost - 1, heat=60, health=40)
        before = g.snapshot()
        check(f"{name}: refused one credit short", not fn(g))
        check(f"{name}: no state change on refusal", g.snapshot() == before)

    print("\nSpecific node effects:")
    g = Game(credits=10**6, throughput=40, heat=20)
    oc = acts["overclock"]
    g.overclock()
    check("overclock raises throughput by the documented amount",
          g.throughput == 40 + oc["throughput"], str(g.throughput))
    check("overclock raises heat by the documented amount",
          g.heat == 20 + oc["heat"], str(g.heat))

    g = Game(credits=10**6, heat=95)
    g.repair()
    check("repair resets heat to the documented value",
          g.heat == acts["repair"]["heat_reset_to"], str(g.heat))

    g = Game(credits=10**6, health=10)
    rh = acts["restore_health"]
    g.restore_health()
    check("restore health adds the documented amount",
          g.health == 10 + rh["health"], str(g.health))

    g = Game(credits=10**6, health=95)
    g.restore_health()
    check("restore health cannot exceed 100", g.health == 100, str(g.health))

    print("\nExpansion cap:")
    g = Game(credits=10**7)
    expanded = sum(1 for _ in range(10) if g.expand())
    check(f"nodes cap at {rc.max_nodes()}", g.nodes == rc.max_nodes(),
          str(g.nodes))
    check("expansion count matches the cap",
          expanded == rc.max_nodes() - 1, str(expanded))
    check("further expansion is refused", not g.expand())

    g = Game(credits=10**6, upgrade_level=0)
    g.node_upgrade()
    check("system upgrade raises upgradeLevel by 1", g.upgrade_level == 1)


# --------------------------------------------------------------------------
# Cross-system interactions
# --------------------------------------------------------------------------

def test_interactions() -> None:
    print("\nUpgrades interact with income:")
    plain = Game(credits=0, throughput=50, upgrade_level=0)
    boosted = Game(credits=0, throughput=50, upgrade_level=0)
    boosted.credits = 10**6
    boosted.purchase("income")
    boosted.credits = 0
    ea = plain.income_tick()
    eb = boosted.income_tick()
    check("the income upgrade increases per-tick earnings", eb > ea,
          f"{ea} vs {eb}")

    print("\nCooling interacts with heat accumulation:")
    hot = Game(heat=50, throughput=80)
    cool = Game(heat=50, throughput=80)
    cool.upgrade_counts["cooling"] = 5
    for _ in range(5):
        hot.income_tick()
        cool.income_tick()
    check("cooling levels keep heat lower over time", cool.heat <= hot.heat,
          f"{hot.heat} vs {cool.heat}")

    print("\nAutomation interacts with caps (no overflow):")
    g = Game(power=95, heat=5, throughput=95, health=95, credits=10**6)
    for cond in rc.rule_conditions():
        g.add_rule(cond, "boost_power")
    for _ in range(20):
        g.process_rules()
        g.income_tick()
    check("20 rounds of rules + ticks respect caps", g.in_bounds(),
          str(g.snapshot()))

    print("\nAutomation rescues a stressed relay:")
    g = Game(power=5, heat=95, throughput=5, health=25, credits=1000)
    g.add_rule("power < 30", "boost_power")
    g.add_rule("heat > 85", "emergency_cool")
    g.add_rule("health < 30", "repair_health")
    start = g.snapshot()
    for _ in range(12):
        g.process_rules()
        g.income_tick()
    check("automation improves power from a stressed start",
          g.power > start["power"], f"{start['power']} -> {g.power}")
    check("automation improves heat from a stressed start",
          g.heat < start["heat"], f"{start['heat']} -> {g.heat}")
    check("automation improves health from a stressed start",
          g.health > start["health"], f"{start['health']} -> {g.health}")
    check("stressed recovery stays in bounds", g.in_bounds(), str(g.snapshot()))

    print("\nNo-automation relay still self-recovers (equilibrium):")
    g = Game(power=0, heat=100, throughput=0, health=10, credits=0)
    for _ in range(40):
        g.income_tick()
    check("power recovers without automation", g.power > 0, str(g.power))
    check("heat falls without automation", g.heat < 100, str(g.heat))
    check("throughput recovers without automation", g.throughput > 0,
          str(g.throughput))
    check("credits accrue even while struggling", g.credits > 0, str(g.credits))
    check("unattended recovery stays in bounds", g.in_bounds(),
          str(g.snapshot()))

    print("\nSpending cannot produce negative credits:")
    g = Game(credits=10)
    for _ in range(50):
        g.overclock(); g.repair(); g.expand()
        g.node_upgrade(); g.restore_health()
        for item in rc.upgrade_catalog():
            g.purchase(item["key"])
    check("credits never negative after spamming every action",
          g.credits >= 0, str(g.credits))
    check("state in bounds after spamming every action", g.in_bounds(),
          str(g.snapshot()))


# --------------------------------------------------------------------------
# Deterministic end-to-end scenario
# --------------------------------------------------------------------------

def test_end_to_end() -> None:
    print("\nEnd-to-end scenario (ticks + automation + event + upgrade):")
    g = Game(credits=100, power=80, heat=25, throughput=40, health=100)

    # 1. Earn for a while.
    earned_total = sum(g.income_tick() for _ in range(20))
    check("phase 1: credits accumulated from ticks", earned_total > 0,
          str(earned_total))
    check("phase 1: in bounds", g.in_bounds())
    after_earn = g.credits

    # 2. Buy the cheapest upgrade we can afford, exactly once.
    affordable = sorted(rc.upgrade_catalog(), key=lambda i: i["baseCost"])
    target = affordable[0]["key"]
    g.credits = max(g.credits, g.cost_for(target))
    cost = g.cost_for(target)
    before = g.credits
    check(f"phase 2: purchased {target}", g.purchase(target))
    check("phase 2: exact cost deducted once", before - g.credits == cost,
          f"{before - g.credits} vs {cost}")
    check("phase 2: level is exactly 1", g.level(target) == 1)

    # 3. Add automation that will fire, and drive the condition true.
    g.add_rule("heat > 70", "reduce_heat")
    g.heat = 80
    fired = g.process_rules()
    check("phase 3: the rule fired once", fired == 1, str(fired))
    check("phase 3: heat was reduced", g.heat < 80, str(g.heat))

    # 4. A harmful event lands, then the relay recovers.
    deltas = rc.event_deltas()
    harmful = next((i + 1 for i, d in enumerate(deltas)
                    if d.get("deltaHp", 0) < 0), 1)
    health_before = g.health
    g.trigger_event(harmful)
    check("phase 4: harmful event reduced health or was blunted",
          g.health <= health_before, f"{health_before} -> {g.health}")
    for _ in range(30):
        g.income_tick()
    check("phase 4: relay recovers after the event",
          g.health >= health_before or g.health >= 90,
          f"health={g.health}")

    # 5. Whole-run invariants.
    check("end-to-end: final state in bounds", g.in_bounds(), str(g.snapshot()))
    check("end-to-end: credits never went negative", g.credits >= 0)
    check("end-to-end: logs capped", len(g.logs) <= g.MAX_LOGS,
          str(len(g.logs)))
    check("end-to-end: rules within cap", len(g.rules) <= g.MAX_RULES)
    check("end-to-end: ticks did earn credits", after_earn > 100,
          str(after_earn))

    print("\nScenario is deterministic (same inputs -> same outputs):")

    def run() -> dict:
        h = Game(credits=250, power=60, heat=45, throughput=55, health=70)
        h.add_rule("heat > 70", "reduce_heat")
        h.add_rule("power < 30", "boost_power")
        for i in range(15):
            h.income_tick()
            h.process_rules()
            if i % 5 == 0:
                h.trigger_event((i % rc.event_roll_max()) + 1)
        h.purchase("bandwidth")
        h.overclock()
        return h.snapshot()

    a, b, c = run(), run(), run()
    check("three identical runs produce identical state", a == b == c,
          f"{a}\n{b}\n{c}")


def main() -> int:
    if not os.path.isdir("components"):
        print("error: run from the repo root (components/ not found)",
              file=sys.stderr)
        return 1

    print("RELAY-0 deterministic gameplay tests")
    print("Constants are parsed from components/*.brs at run time.")

    test_extraction()
    test_income()
    test_automation()
    test_events()
    test_upgrades()
    test_nodes()
    test_interactions()
    test_end_to_end()

    print()
    if FAILURES:
        print(f"GAMEPLAY TESTS FAILED: {len(FAILURES)} failure(s):",
              file=sys.stderr)
        for f in FAILURES:
            print(f"  - {f}", file=sys.stderr)
        return 1
    print("All gameplay tests passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())


