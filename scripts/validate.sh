#!/usr/bin/env bash
set -euo pipefail

# RELAY-0 validation entry point.
#
# Local usage:
#   bash scripts/validate.sh
#
# Requires: bash, git, python3 (3.8+). No Node.js or proprietary Roku
# tooling needed. This is the same command CI runs.

echo "==> Repository hygiene + Roku manifest/layout checks"
bash scripts/hygiene.sh

echo
echo "==> BrightScript / SceneGraph validation"
python3 scripts/validate_brightscript.py

echo
echo "==> Idle simulation math tests"
python3 scripts/test_idle_sim.py

echo
echo "==> Save schema / migration tests"
python3 scripts/test_save_schema.py

echo
echo "==> Timer / observer lifecycle tests"
python3 scripts/test_timer_lifecycle.py

echo
echo "==> Gameplay rule tests (economy, automation, events, upgrades, nodes)"
python3 scripts/test_gameplay.py

echo
if [[ -f package.json ]]; then
  if command -v npm >/dev/null 2>&1; then
    echo "==> Node checks (package.json present)"
    npm run format:check --if-present
    npm run lint --if-present
    npm test --if-present
  else
    echo "npm not installed; skipping optional Node validation."
  fi
fi

echo
echo "Validation complete."
