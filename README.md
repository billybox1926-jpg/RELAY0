# RELAY-0

[![Roku Validation](https://github.com/billybox1926-jpg/RELAY0/actions/workflows/roku-validation.yml/badge.svg)](https://github.com/billybox1926-jpg/RELAY0/actions/workflows/roku-validation.yml)

Network relay station idle/management game for Roku, written in BrightScript
and SceneGraph.

## Repo layout

- `manifest` — Roku channel manifest (must sit at the package root)
- `source/main.brs` — entry point, defines `sub Main()`
- `components/` — BrightScript/SceneGraph components, each a paired `.brs` + `.xml`
  - `MainScene` — game engine: save/load, timers, rule engine, tab routing
  - `MonitorTab` — resource bars, income rate, alerts, stats
  - `AutomationTab` — if-then rule builder
  - `NodesTab` — node actions, expansion
  - `UpgradesTab` — credit store
  - `LogsTab` — system log viewer
- `scripts/` — validation entry points (see below)

## Validation

Run the full check suite locally. This is the exact command CI runs:

```bash
bash scripts/validate.sh
```

**Prerequisites:** `bash`, `git`, and `python3` (3.8+). No Node.js, no
BrighterScript, and no proprietary Roku tooling required.

To run only the BrightScript/SceneGraph checks:

```bash
python3 scripts/validate_brightscript.py
```

Both exit non-zero on failure and report `file:line` for every problem.

### What gets checked

`scripts/hygiene.sh` — repo and Roku project structure:

- required documentation files are present
- shell scripts parse (`bash -n`)
- no unresolved merge-conflict markers (anchored to line start, so
  BrightScript `' ===` comment banners don't false-positive)
- markdown files start with a heading or front matter
- `manifest` exists with `title`, `major_version`, `minor_version`,
  `build_version`; version values are integers; no UTF-8 BOM
- `source/main.brs` exists and defines `sub Main()`; `components/` exists

`scripts/validate_brightscript.py` — source correctness, encoding the defect
classes that have actually reached device testing on this project:

| Check | Why it matters |
|---|---|
| Unclosed `sub`/`function` | Compilation failure |
| Unterminated string literals | Compiler silently swallows following lines |
| UTF-8 BOM in `.brs`/`.xml` | Compiler rejects the file |
| XML well-formedness, `<component name>` present | Component never loads |
| Invalid font names | **A Label with an unknown font renders nothing** — looks like a blank screen, not an error |
| Colors with alpha `00` | Roku is `0xRRGGBBAA`, so a trailing `00` is invisible |
| `m.top.<childId>.appendChild()` | Child ids are not interface fields; raises `Interface not a member of BrightScript Component (&hf3)`. Use `m.top.findNode("id")` |
| `roDateTime.ToTimeString()` / `AsDateString()` with no args | Neither exists as used; raises `Member function not found (&hf4)` |
| `callFunc("x")` with no argument | `callFunc` requires at least one argument |
| `<interface>` promises a function the `.brs` lacks | `callFunc` returns `invalid` at runtime |
| `callFunc` target not published by any `<interface>` (warning) | Silent no-op — the single largest source of "nothing happens" bugs here |

`scripts/test_idle_sim.py` — deterministic tests for the offline/idle math.
BrightScript cannot run off-device, so this mirrors the arithmetic in
`simulateWhileAway()` and asserts its documented properties. It parses the
`tuning()` table straight out of `MainScene.brs`, so retuning the game
without updating expectations fails the tests rather than drifting silently.
Covers 30s / 60s / 5min / 8h absences, remainder carrying, clock anomalies,
bounds, and equilibrium behaviour.

`scripts/test_gameplay.py` — deterministic gameplay rule tests (248
assertions) covering income ticks, resource caps and floors, automation
conditions and ordering, random events, upgrade cost scaling, node actions,
cross-system interactions, and an end-to-end scenario.

`scripts/relay_constants.py` parses every balance value out of
`components/*.brs` at run time — the `tuning()` table, upgrade catalog, rule
actions and conditions, node action costs and effects, event deltas, resource
clamp bounds, and both the rule and node caps. `scripts/relay_model.py`
holds game *logic* only, never game *numbers*. Retuning the game therefore
cannot leave the tests validating a stale second copy: either the invariants
still hold against the new values, or they fail.

### Simulated vs. device-only

Deterministic tests cover the rules; they cannot cover the platform. What
each side proves:

| Verified by `bash scripts/validate.sh` | Requires a Roku device |
|---|---|
| Income formula, floors, and multipliers | That timers actually fire at 15s/30s |
| Resource clamping at 0 and 100 | SceneGraph rendering and layout |
| Automation conditions, ordering, re-evaluation, cap | Focus movement and D-pad routing |
| Rule actions applying their documented deltas | Dialog open/cancel/confirm behaviour |
| One batched UI refresh per rule batch | That a refresh actually repaints |
| Event deltas, armor mitigation, struggling-state suppression | Registry read/write and `roRegistry` flush |
| Upgrade cost scaling, exact deduction, max level | Real elapsed-time and clock behaviour |
| Node action costs and effects, expansion cap | Channel install, boot, and crash-free launch |
| Save sanitisation, migration, recovery | Shutdown flush on channel exit |
| Timer/observer structural contracts | Actual callback rates over a soak |
| Node cap agreement across gate, label, and log text | Anything visual |

Device verification for each issue is recorded in its GitHub thread, with
telnet output (`telnet <roku-ip> 8085`) as the evidence.

CI additionally verifies that a sideload zip can be assembled, that every
component has both a `.brs` and an `.xml`, and uploads the package as a
build artifact.

## Idle rates and rounding

Two timers drive the simulation while the channel is open:

| Timer | Period | Effect |
|---|---|---|
| Income | 15s | Credits, plus power/heat/throughput/health drift toward equilibrium |
| Event | 30s | Evaluates automation rules, then may fire one random event |

**Credits** accrue at `offlineRate × (throughput ÷ 50) × (1 + 0.25 × upgradeLevel)`
per minute, floored at `offlineFloor`. While offline the exact fractional
amount is computed, the integer part is awarded, and **the fraction is carried
in the save** — so ten separate 30-second absences award exactly as much as one
300-second absence. Without the carry, each short session silently truncated
its progress to zero.

**Resource levels** are integer fields. They blend from their current value
toward an equilibrium target, reaching it after `settleMinutes` away, and are
rounded half-away-from-zero (`roundHalfUp`). Plain truncation would bias every
resource downward on each launch. Health self-repair is floored so it never
over-heals.

**Equilibrium targets** are raised or lowered by upgrades:

| Resource | Base | Modifiers |
|---|---|---|
| Power | `powerBase` | `+` Reactor Shielding, `+` Capacitor Bank, `−` per extra node |
| Heat | `heatBase` | `−` Cryo Manifold |
| Throughput | `throughputBase` | `+` Bandwidth Expander |

**Clock safety.** Elapsed time is derived from `AsSecondsLong()` (not the
32-bit `AsSeconds()`). If the clock moves backwards, the game resynchronises
and awards nothing rather than corrupting the save. Gaps beyond 7 days are
clamped, so a bad clock reading cannot hand out a fortune.

## State-update path

All resource mutations flow through **one** path so the footer and the visible
tab can never disagree:

- `applyResourceChanges(...)` — mutates, then calls `refreshActiveTab()`.
- `applyResourceChangesQuiet(...)` — mutates only; used by `processRules()`
  to batch several firing rules and refresh once.
- `refreshActiveTab()` — updates the footer plus the currently visible tab.
  It is published on MainScene's interface so tabs can call it after their
  own actions (`NodesTab` overclock/repair/expand, `UpgradesTab` purchases).

Random events apply their mutation *before* logging, so the Logs tab and any
refresh triggered by `addLog()` observe post-event values.

### Manual regression checklist

Confirm on-device after changing resource or refresh logic. Watch the footer
and Monitor tab without switching tabs.

1. **Automation rule fires** — create a rule whose condition is already true
   (e.g. `heat > 70` while hot). Within 30s the footer and Monitor must both
   change, and LOGS must show `Rule fired: ...`.
2. **Random event** — idle on the Monitor tab. When an event logs, the bars
   and footer must update in the same tick.
3. **Overclock** (Nodes) — throughput and heat must change immediately in the
   footer, with no tab switch.
4. **Repair** (Nodes) — heat must drop to 30 immediately.
5. **Expand** (Nodes) — credits drop by 500 and node count rises immediately;
   the power equilibrium then settles lower over the next few ticks.
6. **Purchase** (Upgrades) — credits drop, the upgrade's level increments, and
   the affected resource moves immediately.
7. **Offline** — close the channel, wait a minute, relaunch. LOGS must report
   `Resuming after N.NN min offline. Earned X credits.`
8. **No duplicates** — each action above should produce exactly one log entry
   and one save flush (`[saveGame] flushed dirty save` on the debug console).

## Sideloading

1. Enable developer mode on the Roku (Home ×3, Up ×2, Right, Left, Right, Left, Right).
2. Note the device IP (Settings → Network → About).
3. Build a zip containing `manifest`, `source/`, and `components/` at the archive root.
4. Upload it at `http://<roku-ip>/` (user `rokudev`, plus your dev password).

Live debug output — including `print` statements and BrightScript crash
backtraces — is on port 8085:

```bash
telnet <roku-ip> 8085
```

The debug console is the fastest way to diagnose a channel that launches to
a blank screen; `AppLaunchComplete ---> Pended without Render` followed by
`EXIT_BRIGHTSCRIPT_CRASH` means a runtime error during `init()`.

## Controls

- LEFT / RIGHT — switch tabs
- UP / DOWN — navigate within a tab
- OK — select, purchase, or open a dialog
- RIGHT (Automation tab) — delete the selected rule

## Gameplay

Manage Power, Heat, Throughput, Network Health, and Credits across up to five
relay nodes.

- **Income** accrues every 15s, scaled by throughput and upgrade level.
- **Resources** drift toward equilibrium targets rather than draining one way,
  so a run cannot become permanently unwinnable. Upgrades raise those targets.
- **Events** fire occasionally, and are suppressed while the relay is already
  struggling.
- **Automation** supports up to 10 if-then rules over 6 conditions and 6 actions,
  evaluated every 30s.
- **Upgrades** are purchased with credits; costs scale per purchase.

All balance constants live in a single `tuning()` table at the top of
`components/MainScene.brs` — retune there rather than editing inline numbers.

## Save behavior

State persists to `roRegistry` (credits, resources, rules, logs, upgrade
counts) with debounced writes. On launch, elapsed offline time is simulated:
credits accrue and resources settle toward equilibrium. Saves carry a version
and are migrated forward on load.
