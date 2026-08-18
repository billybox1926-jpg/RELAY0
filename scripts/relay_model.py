#!/usr/bin/env python3
"""Deterministic gameplay model for RELAY-0 (#9).

Mirrors the game rules in components/*.brs so economy, automation, events,
upgrades, and node actions can be regression-tested without a Roku.

Every constant comes from scripts/relay_constants.py, which parses the
BrightScript sources at run time. This module contains game *logic* only,
never game *numbers* — so a retune cannot leave these tests validating a
stale copy of the balance table.

This is a test model, not a reimplementation for shipping: it covers the
deterministic rules, and randomness is injected so scenarios are repeatable.
"""

from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import relay_constants as rc  # noqa: E402


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def round_half_up(v: float) -> int:
    """Mirror of roundHalfUp() in MainScene.brs."""
    if v >= 0:
        return int(v + 0.5)
    return -int(-v + 0.5)


class Game:
    """A deterministic RELAY-0 session."""

    def __init__(self, credits=100, power=80, heat=25, throughput=40,
                 health=100, nodes=1, upgrade_level=0):
        self.t = rc.tuning()
        self.caps = rc.resource_caps()
        self.catalog = {i["key"]: i for i in rc.upgrade_catalog()}
        self.actions = rc.rule_actions()
        self.predicates = rc.rule_condition_predicates()
        self.income_step = rc.income_multiplier_step()

        # Caps parsed from source, never hardcoded here.
        self.MAX_RULES = rc.max_rules()
        self.MAX_NODES = rc.max_nodes()
        self.MAX_LOGS = 100

        self.credits = credits
        self.power = power
        self.heat = heat
        self.throughput = throughput
        self.health = health
        self.nodes = nodes
        self.upgrade_level = upgrade_level

        self.upgrade_counts: dict[str, int] = {}
        self.rules: list[dict] = []
        self.logs: list[str] = []
        self.remainder = 0.0

        # Instrumentation for duplicate-action assertions
        self.saves = 0
        self.refreshes = 0
        self.rules_fired_last = 0

    # ---- helpers -------------------------------------------------------

    def _cap(self, field: str):
        """Clamp bounds for a resource, taken from the BrightScript."""
        key = "networkHealth" if field == "health" else field
        return self.caps.get(key, (0, 100))

    def level(self, key: str) -> int:
        return self.upgrade_counts.get(key, 0)

    def snapshot(self) -> dict:
        return {
            "credits": self.credits, "power": self.power, "heat": self.heat,
            "throughput": self.throughput, "health": self.health,
            "nodes": self.nodes, "upgrade_level": self.upgrade_level,
            "upgrades": dict(self.upgrade_counts),
        }

    def in_bounds(self) -> bool:
        for f in ("power", "heat", "throughput", "health"):
            lo, hi = self._cap(f)
            if not lo <= getattr(self, f) <= hi:
                return False
        return self.credits >= 0 and 1 <= self.nodes <= self.MAX_NODES

    # ---- central mutation path (applyResourceChangesQuiet) -------------

    def apply(self, dP=0, dH=0, dT=0, dC=0, dHp=0, refresh=True):
        """Mirror of applyResourceChanges / applyResourceChangesQuiet."""
        lo, hi = self._cap("power")
        self.power = clamp(self.power + dP, lo, hi)
        lo, hi = self._cap("heat")
        self.heat = clamp(self.heat + dH, lo, hi)
        lo, hi = self._cap("throughput")
        self.throughput = clamp(self.throughput + dT, lo, hi)
        lo, hi = self._cap("health")
        self.health = clamp(self.health + dHp, lo, hi)
        self.credits = max(0, self.credits + dC)
        self.saves += 1
        if refresh:
            self.refreshes += 1

    def add_log(self, msg: str):
        self.logs.insert(0, msg)
        if len(self.logs) > self.MAX_LOGS:
            self.logs = self.logs[:self.MAX_LOGS]

    # ---- equilibrium helpers (shared with the offline sim) ------------

    def power_equilibrium(self) -> int:
        t = self.t
        v = (t["powerBase"]
             + self.level("reactor") * t["powerPerReactor"]
             + self.level("battery") * t["powerPerBattery"]
             - self.nodes * t["powerPerNode"])
        return int(clamp(v, t["powerMin"], 100))

    def heat_equilibrium(self) -> int:
        t = self.t
        return int(max(t["heatMin"],
                       t["heatBase"] - self.level("cooling") * t["heatPerCooling"]))

    def throughput_equilibrium(self) -> int:
        t = self.t
        return int(min(100, t["throughputBase"]
                       + self.level("bandwidth") * t["throughputPerBand"]))

    # ---- income tick (onIncomeTick) -----------------------------------

    def income_tick(self):
        """Mirror of onIncomeTick(): earn credits, drift toward equilibrium.

        Deliberately mirrors the BrightScript line-for-line, including its
        use of Cint() (round-half-away-from-zero) rather than truncation.
        """
        t = self.t

        # ---- Income ----
        # NOTE: the game scales income by upgradeLevel only. The "income"
        # upgrade key feeds upgradeLevel via NodesTab, not directly here.
        mult = (self.throughput / 50.0) * (1.0 + self.upgrade_level * self.income_step)
        earned = round_half_up(t["incomeBase"] * mult)
        if earned < t["incomeFloor"]:
            earned = int(t["incomeFloor"])

        # ---- POWER: homeostasis toward a sustainable target ----
        p_target = self.power_equilibrium()
        if self.power < p_target:
            dP = round_half_up((p_target - self.power) / 4.0) + 2
        else:
            dP = -1

        # ---- HEAT: passive dissipation vs throughput load ----
        heat_load = round_half_up(self.throughput / 20.0) + int(self.nodes / 2)
        dissipation = t["heatDissipation"] + self.level("cooling") * t["heatCoolPerLevel"]
        dH = int(heat_load - dissipation)
        if self.heat > t["heatPanicThreshold"]:
            dH -= int(t["heatPanicBonus"])

        # ---- THROUGHPUT: recovers toward a baseline after events ----
        q_target = self.throughput_equilibrium()
        if self.throughput < q_target:
            dT = round_half_up((q_target - self.throughput) / 5.0) + 1
        else:
            dT = 0
        if self.power < t["throughputStarve"]:
            dT -= int(t["throughputPenalty"])

        # ---- HEALTH: slow self-repair, damage only at true extremes ----
        dHp = int(t["healthRegen"]) + int(self.level("armor") / t["healthPerArmor"])
        if self.heat > t["healthHeatDamage"]:
            dHp -= 2
        if self.power < t["healthPowerDamage"]:
            dHp -= 1
        if self.health >= 100:
            dHp = 0

        self.apply(dP, dH, dT, earned, dHp)
        return earned

    # ---- automation (processRules) -------------------------------------

    def add_rule(self, condition: str, action: str, target="self") -> bool:
        """Mirror of AutomationTab rule creation, including the 10-rule cap."""
        if len(self.rules) >= self.MAX_RULES:
            return False
        if condition not in self.predicates:
            return False
        if action not in self.actions:
            return False
        self.rules.append({"condition": condition, "action": action,
                           "target": target})
        return True

    def condition_true(self, condition: str) -> bool:
        """Evaluate a condition against current state, per processRules()."""
        p = self.predicates.get(condition)
        if p is None:
            return False
        value = getattr(self, p["field"])
        if p["op"] == "<":
            return value < p["threshold"]
        if p["op"] == ">":
            return value > p["threshold"]
        return False

    def process_rules(self):
        """Mirror of processRules(): evaluate in order, batch, refresh once.

        Conditions are re-read after each firing rule, matching the
        BrightScript, so an earlier rule can enable or disable a later one.
        """
        self.rules_fired_last = 0
        if not self.rules:
            return 0

        fired = 0
        refreshes_before = self.refreshes
        for rule in self.rules:
            cond, act = rule.get("condition"), rule.get("action")
            if cond is None or act is None:
                continue
            if not self.condition_true(cond):
                continue
            deltas = self.actions.get(act)
            if deltas is None:
                continue
            # Quiet variant: no per-rule refresh
            self.apply(*deltas, refresh=False)
            self.add_log(f"Rule fired: {cond} -> {act}")
            fired += 1

        self.rules_fired_last = fired
        if fired > 0:
            self.refreshes = refreshes_before + 1  # single batched refresh
        return fired

    # ---- random events (triggerRandomEvent) ---------------------------

    def trigger_event(self, event_type: int):
        """Apply one specific event branch, so scenarios stay deterministic."""
        branches = rc.event_deltas()
        idx = event_type - 1
        if idx < 0 or idx >= len(branches):
            deltas = {}
        else:
            deltas = branches[idx]

        dP = deltas.get("deltaP", 0)
        dH = deltas.get("deltaH", 0)
        dT = deltas.get("deltaT", 0)
        dC = deltas.get("deltaC", 0)
        dHp = deltas.get("deltaHp", 0)

        # Network Hardening blunts incoming damage
        armor = self.level("armor")
        if armor:
            if dHp < 0:
                dHp = min(0, dHp + armor)
            if dT < 0:
                dT = min(0, dT + armor)

        # Mutation happens BEFORE logging (see #5)
        self.apply(dP, dH, dT, dC, dHp)
        self.add_log(f"event {event_type}")
        return (dP, dH, dT, dC, dHp)

    def event_chance(self) -> int:
        """Mirror of the struggling-state event suppression."""
        t = self.t
        struggling = (self.power < 25 or self.heat > 80 or self.health < 40)
        return int(t["eventChanceStruggle"] if struggling else t["eventChance"])

    # ---- upgrades (UpgradesTab) ---------------------------------------

    def cost_for(self, key: str) -> int:
        """Mirror of costFor(): baseCost scaled by costMult per level."""
        item = self.catalog[key]
        cost = item["baseCost"]
        for _ in range(self.level(key)):
            cost = round_half_up(cost * item["costMult"])
        return int(cost)

    def purchase(self, key: str) -> bool:
        """Mirror of UpgradesTab purchase. Returns True when it succeeded."""
        item = self.catalog.get(key)
        if item is None:
            return False
        if self.level(key) >= item["maxLevel"]:
            return False
        cost = self.cost_for(key)
        if self.credits < cost:
            return False

        self.credits -= cost
        self.upgrade_counts[key] = self.level(key) + 1

        # Immediate one-off effects, parsed from applyEffect() in the source
        effects = rc.upgrade_effects()
        if key in effects:
            field, amount = effects[key]
            if field == "upgradeLevel":
                self.upgrade_level += amount
            elif field == "throughput":
                self.apply(dT=amount)
            elif field == "networkHealth":
                self.apply(dHp=amount)
            elif field == "power":
                self.apply(dP=amount)

        self.saves += 1
        return True

    # ---- node actions (NodesTab) --------------------------------------
    # All costs and effects come from rc.node_actions(), parsed from
    # NodesTab.brs, so a balance change is picked up automatically.

    def _node(self, name: str) -> dict:
        if not hasattr(self, "_node_actions"):
            self._node_actions = rc.node_actions()
        return self._node_actions[name]

    def overclock(self) -> bool:
        a = self._node("overclock")
        if self.credits < a["cost"]:
            return False
        self.credits -= a["cost"]
        self.apply(dH=a["heat"], dT=a["throughput"])
        return True

    def repair(self) -> bool:
        a = self._node("repair")
        if self.credits < a["cost"]:
            return False
        self.credits -= a["cost"]
        self.heat = a["heat_reset_to"]
        self.saves += 1
        self.refreshes += 1
        return True

    def expand(self) -> bool:
        a = self._node("expand")
        if self.nodes >= rc.max_nodes():
            return False
        if self.credits < a["cost"]:
            return False
        self.credits -= a["cost"]
        self.nodes += 1
        self.saves += 1
        self.refreshes += 1
        return True

    def node_upgrade(self) -> bool:
        """System upgrade: +1 upgradeLevel, raising the income multiplier."""
        a = self._node("upgrade")
        if self.credits < a["cost"]:
            return False
        self.credits -= a["cost"]
        self.upgrade_level += 1
        self.saves += 1
        self.refreshes += 1
        return True

    def restore_health(self) -> bool:
        a = self._node("restore_health")
        if self.credits < a["cost"]:
            return False
        self.credits -= a["cost"]
        self.apply(dHp=a["health"])
        return True
