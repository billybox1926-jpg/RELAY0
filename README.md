# RELAY-0

An idle strategy/simulation game for Roku — you inherit an abandoned autonomous server farm and keep it running. Optimize throughput, manage heat and power, install automation rules, respond to intrusions, and slowly expand while piecing together what happened to the previous admin.

**For couch + remote + popcorn.** No mouse, no keyboard. D-pad and OK button only.

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)

## What it is

RELAY-0 is a turnable, epoch-based simulation inspired by retro terminal dashboards and haunted infrastructure. The game runs at TV scale (1920×1080) using Roku SceneGraph, with all UI rendered as Labels and Rectangles — no sprites, no 3D, no heavy rendering. It is designed to run on modest hardware (Roku Express and up).

**Core loop:**

- Monitor power, heat, throughput, and credits.
- Install simple if-then automation rules (for example, "if heat > 70, reduce heat").
- Overclock or repair individual nodes, unlock more nodes.
- Respond to events: intrusions, thermal spikes, packet storms, ghost signals.
- Close the app, walk away, come back — the simulation advances while you were away using epoch-based save/load.

**Theme:** abandoned infrastructure, slow decay, quiet autonomy. The fiction embraces your absence.

## Controls

| Button | Action |
| --- | --- |
| Left / Right | Switch tabs (Monitor, Automation, Nodes, Logs) |
| Up / Down | Navigate within a tab (rule list, node list) |
| OK | Select / activate / open dialog |
| Back (optional) | Usually handled by Scene default behavior |

Tabs:

- **Monitor** — live resource bars and credit count.
- **Automation** — list and manage if-then rules.
- **Nodes** — overclock, repair, expand the node farm.
- **Logs** — scroll through the system event log.

## Requirements

- A Roku device (HD-resolution models and up).
- Developer mode enabled on the Roku.
- A zip tool and a desktop browser for sideloading.

## Getting started (dev)

1. Enable developer mode on your Roku: press **Home** 3×, **Up** 2×, **Right**, **Left**, **Right**, **Left**, **Right**. Note the IP and set a password.
2. Clone this repo and open the `RELAY0` folder.
3. Zip the contents so `manifest` is at the root of the zip.
4. Open `http://<your-roku-ip>` in a browser and upload the zip.
5. Launch RELAY-0 from the Roku home screen.

For a first run you can use the placeholder icon; a real 512×512 PNG can be added later under `pkg:/images/icon_hd.png`.

## Project structure

```
RELAY0/
├── manifest                  # Channel manifest (title, version, icon)
├── source/
│   └── main.brs             # Entry point: creates the Roku Scene
└── components/
    ├── MainScene.xml        # Root scene: tab bar, footer, global state
    ├── MainScene.brs        # Save/load, epoch sim, event timer, rules processing
    ├── MonitorTab.xml       # Resource bars UI
    ├── MonitorTab.brs
    ├── AutomationTab.xml    # Rule list UI
    ├── AutomationTab.brs    # Rule add/delete, dialog-based rule builder
    ├── NodesTab.xml         # Node overclock/repair/expand UI
    ├── NodesTab.brs
    ├── LogsTab.xml          # Event log display
    └── LogsTab.brs
```

## State and persistence

The game uses `roRegistry` to persist credits, resources, rules, logs, and last-save timestamp. On launch it calculates the elapsed epoch delta and applies passive income/decay in bulk, then appends a "while you were away" note to the log.

## Automation rules

Rules are stored as a simple array of `{ condition, action, target }` objects. Conditions currently include:

- `power < 30`
- `heat > 70`
- `throughput < 20`

Actions:

- `boost_power`
- `reduce_heat`
- `earn_credits`

Rules are processed periodically by the main event timer as well as on manual triggers.

## Building from source

This is a BrightScript/SceneGraph project. There is no bundled Node.js or Python build pipeline yet. If you want linting or automated packaging later, the repo is structured to add it — for example, BrighterScript (`bsc`) or `roku-deploy` can be added under `scripts/` and wired into CI.

## License

MIT — see `LICENSE`.

## Contributing

See `CONTRIBUTING.md`.

## Security

See `SECURITY.md`.

## Credits

RELAY-0 is a solo Roku channel experiment. The abandoned-infrastructure aesthetic, idle simulation, and epoch-based resume are the core design ideas.

See `CHANGELOG.md` for version history.
