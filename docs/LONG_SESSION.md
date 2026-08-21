# Long-session performance and resource-budget audit

Repeatable hardware soak procedure for RELAY-0 (issue #13), plus the recorded
results. It complements `docs/TIMER_AUDIT.md` (structural timer/observer
contracts and the 5-minute tick-rate soak) by testing *sustained mixed
operation* on real hardware.

## Why a driver, not assertions

As with the input matrix (#11): a script can prove what was pressed and what
the console printed; only scoring against explicit gates proves stability.
The driver (`scripts/soak_driver.py`) records both halves of that evidence —
a timestamped keypress log and the full debug-console transcript — and stops
there. Scoring is a deliberate human step against the gates below.

## Procedure

Prerequisites: primary supported device from `docs/COMPATIBILITY.md`
(onn. Roku TV C302X, Roku OS 15.x), release artifact sideloaded per
`docs/RELEASE.md`, developer machine on the same network, device IP known.

1. Reboot the device; note free-memory baseline if tooling exposes one.
2. Launch the channel fresh; clear any prior save only if testing first-run,
   otherwise keep an existing save to exercise load paths.
3. Run the soak:

   ```bash
   python3 scripts/soak_driver.py --host <roku-ip> --duration 120 \
       --cycles 6 --seed 13 --out soak_results/
   ```

   Default profile: **2 hours**, 6 cycles of ~48 min active / ~72 min idle
   (40% active share). Active phases random-walk the five tabs with
   Up/Down/Left/Right/OK/Back at 4 keys/sec — deliberately harsher than
   human play. Idle phases send nothing, exercising income/event timers,
   automation evaluation, and debounced saves in silence.

4. Immediately after the final cycle, manually verify controls still respond
   crisply (tab switch, dialog open/cancel, purchase) — degradation shows up
   as lag before it shows up as a crash.
5. Exit via Home, relaunch, confirm the save loads intact.
6. Repeat launch→soak→relaunch at least once more (step 3–5) to cover
   repeated save/load/relaunch cycles.

### Target duration

**2 hours continuous** is the acceptance target for this issue. That covers
~480 income ticks, ~240 event-timer evaluations, hundreds of save flushes,
and thousands of keypresses. Longer soaks are welcome but not required.

## Pass/fail gates

The transcript must show ALL of:

| Gate | How it is checked |
|---|---|
| No debugger/runtime errors | No `BRIGHTSCRIPT: ERROR`, no crash backtrace anywhere in the console transcript |
| No timer multiplication | `onIncomeTick` / `onEventTimer` invocation counts scale linearly with elapsed wall time (compare first vs last cycle rate); same contract as TIMER_AUDIT |
| No observer accumulation | Dialog open/close counts match observed-field subscribe/unsubscribe pairs; console shows no repeated-callback signature after N dialogs |
| Bounded log growth | Console line volume per idle minute does not trend upward across cycles; log viewer content stays within its cap |
| Bounded persisted state | Registry save size stays flat across cycles (save schema tests bound the shape; on-device, confirm no unbounded growth in flush cadence or content) |
| No UI-refresh degradation | Manual responsiveness check after the soak matches pre-soak feel; no growing delay between keypress and repaint |

## Measurable results

Recorded below per run. Roku's ECP/debug tooling exposes limited numeric
resource data (no general heap inspector over port 8085), so several gates
are scored observationally rather than numerically; where a number cannot be
measured reliably, that is stated rather than invented.

### Run 1 — TBD

- Device / OS:
- Artifact (sha256):
- Date / operator:
- Duration / cycles:
- Keypresses sent / console lines captured:
- Gate results:
- Observations:

(No runs have been recorded yet. This section is filled from the transcript
produced by `scripts/soak_driver.py`.)
