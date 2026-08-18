# Developer Setup

This guide is for working on RELAY-0, a Roku BrightScript / SceneGraph idle game.

If you are just playing the game, you only need the sideload steps in the README. This page is for people editing the channel.

## 1) Prerequisites

- Git
- A desktop machine for editing BrightScript/SceneGraph files
- A Roku device with developer mode enabled
- A zip tool for packaging the channel

There is no required Node.js, Python, or Rust toolchain for the current prototype.

## 2) Get the code

```bash
git clone <your-repo-url>
cd RELAY0
```

## 3) Package and sideload

1. Open developer mode on your Roku and note the IP and password.
2. Zip the contents of the `RELAY0` folder so `manifest` is at the root of the zip.
3. Upload the zip at `http://<your-roku-ip>`.
4. Launch RELAY-0 from the Roku home screen.

For a first test, a placeholder icon is acceptable. A real 512×512 PNG can be added later under `pkg:/images/icon_hd.png`.

## 4) Editing the channel

The main code areas are:

- `manifest` — channel metadata and version
- `source/main.brs` — entry point
- `components/` — SceneGraph scenes and tabs

After editing, re-zip and re-sideload.

## 5) Manual testing checklist

Before opening a PR, test the main player paths:

1. Tab switching with left/right.
2. Within-tab navigation with up/down/OK.
3. Adding and deleting automation rules.
4. Overclock, repair, and node expand.
5. Random events showing up in logs.
6. Closing and reopening the channel, then checking the "while you were away" summary.

## 6) Local helper scripts

The repo includes generic helper scripts under `scripts/`:

- `bash scripts/hygiene.sh` — repo hygiene checks
- `bash scripts/validate.sh` — hygiene plus project-specific checks
- `bash scripts/bootstrap.sh` — stack-specific bootstrap helper

These are not BrightScript build tools. They exist for repo hygiene and may be adapted later for packaging or lint helpers.

## 7) CI and workflow files

CI lives in `.github/workflows/`. The current workflows are reusable-quality-oriented and may need updating as the project gains BrightScript-specific tooling.

## 8) Branch and PR workflow

1. Create a branch from `main`.
2. Make changes.
3. Sideload and test.
4. Open a focused PR with context for reviewers.
5. Merge only when the manual checks above pass.

## 9) Save format caution

Save data is stored in `roRegistry` inside `MainScene.brs`. If a PR changes what is saved, update both load and save in the same PR and note it in the PR description.
