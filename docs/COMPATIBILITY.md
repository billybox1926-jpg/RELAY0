# Hardware and OS compatibility matrix

Evidence-based support envelope for RELAY-0. Every result in the matrix below
was measured on physical hardware with a build produced by
`scripts/build_package.py`; anything not yet tested is recorded as **untested**
rather than inferred from another device's results.

This document exists because of issue #14: behavior on one development Roku is
not proof of behavior on every supported Roku environment, and this project
will not claim compatibility it has not verified.

## Minimum supported target

The minimum target below is defined by evidence, not by Roku platform
documentation. It is the weakest combination actually exercised end to end:

| Property | Minimum supported | Basis |
|---|---|---|
| Form factor | Roku TV (built-in) | Only form factor tested |
| Device class | onn. Roku TV (C302X) | The one device tested so far |
| Roku OS | 15.x (tested: 15.3.4 build 841) | OS present at test time |
| Resolution | `hd` (1280x720 / 1920x1080, `requires_screen_resolution=hd`) | Manifest requirement; presentation verified at 1080p |

The manifest declares `ui_resolutions=hd` and `requires_screen_resolution=hd`.
Devices that cannot present an `hd` resolution are unsupported by declaration,
independent of test coverage.

## Compatibility matrix

Test protocol: each cell is pass only if the checklist item was executed on
that device/OS against the current release artifact (sideloaded via
`plugin_install`, per `docs/RELEASE.md`). Record device model, OS version and
build, test date, artifact hash, and pass/fail per item. A partial pass is a
fail until re-run.

### Tested combinations

**onn. Roku TV C302X — Roku OS 15.3.4 (build 841), 1080p**

- Artifact: dev version 1.0.31, sha256 `a1db22d476ce9cdd…` (`docs/RELEASE.md`)
- Test dates: Aug 2026, across issues #10–#12 verification passes

| Checklist item | Result | Evidence |
|---|---|---|
| Cold launch / first-run init | PASS | Clean boot, save load, no runtime errors on port 8085 (#12 release install) |
| Five-tab D-pad navigation | PASS | ECP-driven navigation counts, #11 |
| Dialog & focus behavior under burst input | PASS | 20× OK bursts → exactly 1 action; 120-press seeded chaos, no crash (#11) |
| Back/Home exit behavior | PASS | Back dismisses dialog without acting; hammering Back no crash; exit→relaunch save intact (#11 items 10, 15, 17) |
| Rendering/layout at 1080p TV presentation | PASS | Visual check during #11/#12 sessions |
| Save/load & registry persistence | PASS | Relaunch after chaos run showed save fully intact (#11); save schema tests + on-device flush logs |
| Timers & idle simulation | PASS | Callback-count instrumentation audit, confirmed on-device (`docs/TIMER_AUDIT.md`) |
| Release artifact installation/sideload | PASS | HTTP 200, `Install Success`, reported as 1.0.31 (#12) |

### Untested combinations

No compatibility is claimed for any of these. They must be tested before being
marked otherwise; if hardware cannot be obtained, they stay listed here.

| Class | Examples | Status |
|---|---|---|
| Streaming sticks / boxes | Roku Express, Premiere, Ultra, Streaming Stick+ | **Untested** |
| Roku TVs from other makers | TCL, Hisense, Sharp, Philips Roku TVs | **Untested** |
| Older Roku OS lines | OS 12–14 | **Untested** — no API usage is knowingly gated above 15.x, but unverified |
| Newer Roku OS releases | OS 16+ | **Untested** — forward compatibility not assumed |
| Non-HD presentations | FHD-only or 4K-forced devices | **Unsupported** (manifest requires `hd`) |

## How to add a row

1. Build the package: `python3 scripts/build_package.py --verify --out RELAY0.zip`.
2. Sideload onto the device (`docs/RELEASE.md`), noting model + OS build from
   Settings → System → About.
3. Run the eight checklist items above; drive input via ECP where possible and
   read evidence off port 8085.
4. Update the matrix with date, OS build, artifact hash, and per-item results —
   including failures. An untested entry is always preferable to an inferred one.

## Relationship to the release process

`docs/RELEASE.md` records device verification against the exact published
artifact. Release notes must reference this document's minimum supported
target and must not state compatibility beyond what appears in the tested
matrix above.
