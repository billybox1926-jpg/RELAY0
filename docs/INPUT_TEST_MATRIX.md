# Input and UI resilience test matrix

Manual and scripted verification for RELAY-0's TV-first interaction model
(issue #11). Every result below was measured on hardware — onn. Roku TV,
Roku OS 15.3.4 — by driving ECP keypresses and counting the actions the
channel actually performed, read off the debug console on port 8085.

## Why counting, not asserting

A static check can prove a guard exists. It cannot prove the user-visible
behaviour. For this pass, each mutation site was temporarily instrumented
with an `[ACTION]` print, a burst of 15–20 presses was fired, and the
actions were counted. The instrumentation was removed before commit.

That method found a real defect that the code review had missed: the
`m.dialogBusy` guard added in #10 protects the dialog *callback*, but
nothing prevented a rapid burst from re-opening a dialog and confirming it
again. Guarding the callback alone was not enough.

## Rapid-input results

Bursts of 20 presses with no delay between them.

| Surface | Burst | Before | After | Expected |
|---|---|---|---|---|
| Automation — add rule | 20 × OK | 6 rules | **1** | 1 |
| Automation — delete rule | 20 × RIGHT | untested | **0** (empty list) | 0 or 1 |
| Nodes — overclock | 20 × OK | 10 actions | **1** | 1 |
| Upgrades — purchase | 20 × OK | 2 purchases | **1** | 1 |
| Monitor | 20 × OK | 0 | **0** | 0 (no controls) |
| Logs | 20 × OK | 0 | **0** | 0 (empty log) |
| Any dialog | 20 × Back | 0 | **0** | 0 |
| Open once, then 20 × OK on the same dialog | — | — | **0 extra** | 0 |
| Deliberate open + confirm, 3s apart | — | — | **1** | 1 |

The last two rows matter: the fix must suppress unintended bursts without
breaking deliberate use. A slow, intentional open-then-confirm still
performs exactly one action.

## Fixes applied

1. **Dialog stacking.** `showActionDialog()` (Nodes), `showRuleBuilder()`
   (Automation) and the Logs clear-confirm now refuse to open when a dialog
   is already present or a callback is mid-flight.
2. **Action cooldowns.** A one-second cooldown on node actions, rule
   creation, rule deletion, and purchases. Rapid bursts form legitimate
   open→confirm *pairs*, so guarding the dialog alone still allowed ~10
   actions from 20 presses.
3. Upgrades has no confirmation dialog at all, so it needed the cooldown
   rather than a dialog guard.

## Navigation and boundaries

| Test | Presses | Result |
|---|---|---|
| UP at the top of every tab's list | 30 per tab | No movement past index 0, no crash |
| DOWN at the bottom of every tab's list | 30 per tab | Clamped at the last item, no crash |
| Rapid tab traversal RIGHT | 30 | Wraps 0→4→0, no crash |
| Rapid tab traversal LEFT | 30 | Wraps 0→4→0, no crash |
| Mixed random chaos (Up/Down/Left/Right/OK/Back) | 120, seeded | No crash |

Total: 330+ presses in a single session with no `runtime error` and no
Micro Debugger break.

After the chaos run the channel had exited to Home (the random sequence
included Back). Relaunching showed the save fully intact:

```
=== RELAY-0 v1.2 booting ===
[loadGame] v4->v4 credits=384 power=63 heat=71
=== RELAY-0 ready. Rules: 8, Logs: 19 ===
```

No `dropped`/`unreadable` warnings, so the #8 sanitiser accepted everything
the chaos wrote — the save was left valid, not merely recoverable.

## Manual checklist

Run with a physical remote after changing any input, focus, or dialog code.

### Per-tab focus and boundaries
1. **Monitor** — OK does nothing (no interactive controls). UP/DOWN do nothing.
2. **Automation** — UP/DOWN move the selected rule; both clamp at the ends.
   RIGHT deletes the selected rule. OK opens the rule builder.
3. **Nodes** — UP/DOWN move between nodes, clamped at 0 and the browse limit.
   OK opens the action dialog.
4. **Upgrades** — UP/DOWN move the selected upgrade, clamped at both ends.
   OK purchases.
5. **Logs** — UP/DOWN do nothing. OK opens clear-confirm only when the log
   is non-empty.

### Tab traversal
6. LEFT/RIGHT move between all five tabs and wrap at both ends.
7. The active tab's label and underline are visibly highlighted.
8. Switching tabs mid-dialog does not leave an orphaned dialog on screen.

### Dialogs
9. Every dialog's last button is Cancel, and selecting it changes nothing.
10. Back dismisses a dialog without performing its action.
11. After dismissal, D-pad input returns to the underlying tab.
12. Rapidly pressing OK inside a dialog performs the action at most once.
13. A dialog cannot be opened on top of another dialog.

### Rapid input
14. Hold or hammer OK on each of add-rule, delete-rule, purchase, overclock,
    repair, expand, restore-health: each must perform exactly one action.
15. Hammer Back with no dialog open: nothing happens, no crash.
16. Hammer UP/DOWN at a list boundary: selection stays put.

### Recovery
17. Exit and relaunch after a burst: the save loads with no `dropped` or
    `unreadable` warnings on the debug console.

## Known limitation

The one-second cooldown is wall-clock based (`roDateTime.AsSeconds()`), so
two deliberate actions inside the same clock second are refused. In practice
a player cannot navigate a dialog that fast, and the alternative — a press
counter — would not survive the dialog teardown that clears component state.
