# Changelog

All notable changes to RELAY-0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] — initial Roku channel prototype

### Added

- Roku SceneGraph channel scaffold: `manifest`, `source/main.brs`, and component tabs.
- Four tabs: Monitor, Automation, Nodes, Logs.
- D-pad navigation: left/right for tab switching, up/down/OK within tabs.
- Resource monitor: Power, Heat, Throughput, Credits.
- Idle resource display with progress bars in monitor tab.
- Epoch-based save/load using `roRegistry`.
- "While you were away" simulation on resume.
- Automation rule system: add/delete if-then rules via dialogs.
- Rule conditions: `power < 30`, `heat > 70`, `throughput < 20`.
- Rule actions: `boost_power`, `reduce_heat`, `earn_credits`.
- Periodic event system: intrusions, thermal spikes, packet storms, efficiency boosts, ghost signals.
- Node actions: overclock, repair, node expand.
- Event log tab with persistent log entries.
- Footer status line with current credits and resource levels.
- MIT license, README, CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG.

### Known limitations

- Save format is hand-rolled and may change before a stable release.
- Node expansion is limited to a small initial count.
- Rule conditions and actions are fixed in this prototype; a fuller rule editor is a future improvement.
- No automated packaging or lint pipeline yet.
- Channel is intended for sideload/dev testing in this version.

## [Unreleased]

### Planned

- Stabilize save format before any broader release.
- Expand node count and node-specific behavior.
- More rule conditions and actions.
- Polish log display, tab highlight behavior, and event pacing.
- Consider BrighterScript/lint tooling under `scripts/`.
- Consider a proper icon and store-ready packaging path.
