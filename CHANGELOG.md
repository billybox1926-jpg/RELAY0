# Changelog

All notable changes to RELAY-0 will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.0.0 (2026-08-25)


### Features

* implement daily signal system ([c2e1dad](https://github.com/billybox1926-jpg/RELAY0/commit/c2e1dad99a8bcb525787cef2ccf73a594bc8edf4))
* implement RELAY-0 network terminal core ([8f17348](https://github.com/billybox1926-jpg/RELAY0/commit/8f1734842324e7a164a5a206e1b7c793d41fa5be))


### Bug Fixes

* restore config/.env.example required by hygiene check ([b9219b7](https://github.com/billybox1926-jpg/RELAY0/commit/b9219b74a3f0a578e12dac621ec3797d24801a10))
* restore config/.env.example required by hygiene check ([e78c98c](https://github.com/billybox1926-jpg/RELAY0/commit/e78c98cd14a8a2d3e7180ec541326347a75b629b))
* restore config/.env.example required by hygiene check ([#17](https://github.com/billybox1926-jpg/RELAY0/issues/17)) ([b9219b7](https://github.com/billybox1926-jpg/RELAY0/commit/b9219b74a3f0a578e12dac621ec3797d24801a10))

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
