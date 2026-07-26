# RELAY-0

Network relay station idle/management game for Roku.

## Repo layout

This workspace:
- `main.brs` — entry point
- `manifest` — Roku channel manifest
- `components/` — BrightScript/SceneGraph modules
  - `MainScene.brs`
  - `MonitorTab.brs`
  - `AutomationTab.brs`
  - `NodesTab.brs`
  - `LogsTab.brs`
  - matching `.xml` scene files

## Target environment

- Roku HD target
- Local SDK: `C:/Users/Billy/Documents/Android/Sdk`

## Controls

- UP / DOWN — navigate tabs and rules
- RIGHT — delete selected rule
- OK — open actions / dialogs

## Tabs

- Monitor — power, heat, throughput, health, credits
- Automation — manage rules
- Nodes — node actions, expansion, upgrades
- Logs — system log viewer

## Automation

Max 10 rules.
Dialog-driven creation:
- Conditions: power thresholds, heat thresholds, throughput, health
- Actions: boost/reduce power/heat, credits, repair health, throughput, emergency cool

## Save / offline behavior

- Cached save state via registry
- Debounced saves
- Offline simulation on load

## Build / deploy notes

Use the Roku target device and local SDK install rather than relying on UI summaries alone.
