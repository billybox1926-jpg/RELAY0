# Release process and artifact verification

How a RELAY-0 channel package is produced, why it is byte-reproducible, and
how to verify a published artifact matches the source it claims to come from
(issue #12).

## Building a package

```bash
python3 scripts/build_package.py --verify --out RELAY0.zip
```

`--verify` builds twice and fails if the two archives differ. Add `--hashes`
for a per-file SHA-256 listing.

Requires only Python 3.8+ and a checkout. No Node.js, no Roku SDK, no
network access, and no local-only state.

## What ships, and what cannot

Packaging uses an **allowlist**, not a blocklist, so a new file added to the
repository cannot silently leak into a channel package. Only these are
eligible:

| Path | Extensions |
|---|---|
| `manifest` | — (required, archive root) |
| `source/` | `.brs` |
| `components/` | `.brs`, `.xml` |
| `images/` | `.png`, `.jpg`, `.jpeg` |
| `fonts/` | `.ttf`, `.otf` |
| `locale/` | `.xml`, `.ts` |

Plus an explicit deny pass for dotfiles, `.py`, `.md`, `.sh`, `.zip`, `.pkg`,
`__pycache__/`, and `buildstamp.txt` — so even a stray script dropped into
`components/` is rejected.

Verified by planting five junk files (`components/scratch.py`,
`components/notes.md`, `components/.secret`, `RELAY0-old.zip`,
`components/buildstamp.txt`) and rebuilding: still exactly 14 files, and an
**identical** hash.

## Why the package is reproducible

A naive `zipfile.write()` stores each file's mtime in its entry header. A
fresh `git clone` sets new mtimes, so the same commit produced a *different*
archive locally than in CI. Measured before the fix:

```
in-place checkout : aae63aa55b7c583ab181cd4eccff5474…
fresh checkout    : 286f7ebf3bd4d8d136fcd17db880c772…
REPRODUCIBLE ACROSS CHECKOUTS: False
```

`build_package.py` normalises every variable:

- **timestamp** — every entry is stamped `1980-01-01 00:00:00`
- **permissions** — `external_attr` fixed at `0o644`
- **host system** — `create_system = 0` (MS-DOS) rather than host-dependent
- **ordering** — entries written in sorted path order
- **no directory entries** — only files

After the fix, the same commit produces the same bytes from either location:

```
local build   : 4a51257784dc2761394042e49ce4fd0801660766c3749b390731cb6ba38076fb
clean checkout: 4a51257784dc2761394042e49ce4fd0801660766c3749b390731cb6ba38076fb
REPRODUCIBLE: True
```

Note that `manifest` carries `build_version`, so bumping the version
intentionally changes the hash. Reproducibility means *the same commit* always
yields the same bytes — not that the hash is constant across versions.

## CI enforcement

`.github/workflows/roku-validation.yml` runs on every PR and push to `main`:

1. `bash scripts/validate.sh` — hygiene, BrightScript/SceneGraph validation,
   and all test suites including packaging.
2. Build with `--verify`, so a non-deterministic change fails immediately.
3. **Reproduce from a clean tree** — `git archive HEAD` into a pristine
   directory, rebuild, and compare SHA-256. A mismatch fails the run.
4. **Leakage assertion** — reject any archive entry matching a denied pattern,
   and confirm `manifest` sits at the archive root with no wrapper directory.
5. Upload the package as a build artifact.

## Releases

`.github/workflows/release.yml` runs `release-please` to manage versioning and
the changelog. Previously that was *all* it did — a GitHub Release carried no
channel package, and the only zip anywhere was a throwaway CI artifact.

An `attach-package` job now runs when a release is created: it checks out the
released commit, validates, builds deterministically, and uploads both
`RELAY0.zip` and `RELAY0.zip.sha256` to the release.

## Verifying a published artifact

To confirm a release artifact was built from the source it claims:

```bash
git checkout <release-tag>
python3 scripts/build_package.py --out /tmp/local.zip
sha256sum /tmp/local.zip
# compare against RELAY0.zip.sha256 attached to the release
```

Matching hashes prove the published package contains exactly the source at
that tag, with no extra files and no local contamination.

## Sideloading

```bash
curl --digest -u "rokudev:<dev-password>" \
     -F "mysubmit=Replace" -F "archive=@RELAY0.zip" -F "passwd=" \
     http://<roku-ip>/plugin_install
```

Look for `Install Success` in the response. `Install timeout. Results
unknown.` usually means a crashed channel is holding the debugger port —
reboot the device to clear it.

## Device verification of the release artifact

The exact artifact produced by `build_package.py` was installed on hardware,
not a separately-built zip:

- **Device**: onn. Roku TV (C302X), Roku OS 15.3.4 build 841, 1080p
- **Artifact**: `RELAY0.zip`, 29542 bytes, sha256 `a1db22d476ce9cdd…`
- **Install**: `HTTP 200`, `Install Success`, reported as dev version 1.0.31
- **Launch**: booted cleanly, save loaded, all five tabs navigated, no
  runtime errors

## Automated coverage

`scripts/test_package.py` — 25 assertions covering allowlist exclusions,
determinism within a run, determinism across a simulated fresh checkout,
entry normalisation (timestamps, permissions, ordering, no directory
entries), archive structure Roku requires, and that validation rejects an
orphaned component half.
