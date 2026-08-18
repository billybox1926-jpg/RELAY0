# Contributing

Thanks for your interest in RELAY-0.

RELAY-0 is a BrightScript / Roku SceneGraph idle game. Contributions are welcome for gameplay, UI, docs, event design, and automation rules.

## Ground rules

- Be respectful and follow the Code of Conduct.
- Prefer small, focused changes. A single tab tweak or a single new event type is a good PR.
- Open an issue first for large or breaking changes, especially anything that changes save format, resource balance, or the manifest.

## Repo orientation

- **Game code** lives in `components/` and `source/`.
- **Channel config** lives in `manifest`.
- **Automation scripts** live in `scripts/` (currently bootstrap/validate/hygiene helpers).
- **Docs** live in `docs/` and in the README.

There is no Node.js or Python build pipeline yet. If you are working on linting, packaging, or CI for BrightScript, add it under `scripts/` and keep commands named consistently with the existing reusable workflow.

## Development workflow

1. Fork and create a branch: `feature/short-description`.
2. Make your changes.
3. Sideload the channel to a Roku device to test gameplay, navigation, and save behavior.
4. Verify the main paths:
   - Tab switching (left/right)
   - Within-tab navigation (up/down/OK)
   - Add and delete automation rules
   - Overclock, repair, and node expand
   - Events appear in logs
   - Save/load works and resume shows "while you were away"
5. Open a pull request using the PR template.

## Pull request checklist

- [ ] Scope is focused and understandable
- [ ] Sideload-tested on a Roku device (or at minimum reviewed on the code side)
- [ ] No breakage to save format or resource math without a note in the PR
- [ ] Docs updated if behavior changed
- [ ] Changelog updated if needed

## Coding notes

- SceneGraph components are XML + BrightScript. Keep UI simple: Labels and Rectangles are preferred over heavy node trees.
- Save format is hand-rolled into `roRegistry` in `MainScene.brs`. If you add a new saved field, update load/save in the same PR.
- Resources are clamped 0–100 in the helper functions at the bottom of `MainScene.brs`. Keep that clamping consistent if you add new resource changes.

## Local automation defaults

- Hygiene check: `bash scripts/hygiene.sh`
- Validation: `bash scripts/validate.sh`
- CI workflows: `.github/workflows/`

## Ideas welcome

If you want to suggest a new tab, new event class, new rule condition/action, or a polish pass, open an issue and describe the idea and the expected player experience.
