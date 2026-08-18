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

CI additionally verifies that a sideload zip can be assembled, that every
component has both a `.brs` and an `.xml`, and uploads the package as a
build artifact.

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
