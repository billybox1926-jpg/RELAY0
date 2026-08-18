# Timer and observer lifecycle audit

Inventory of every `Timer` node and `observeField` subscription in RELAY-0,
with owner, lifetime, and the reason it cannot double-fire. Verified against
`components/*.brs` and confirmed on-device by callback-count instrumentation.

## Timers

| Timer | Owner | Created in | Period | repeat | Lifetime |
|---|---|---|---|---|---|
| `m.incomeTimer` | MainScene | `startIncomeTimer()`, called once from `init()` | 15s | yes | Scene lifetime |
| `m.eventTimer` | MainScene | `startEventTimer()`, called once from `init()` | 30s | yes | Scene lifetime |
| `m.saveTimer` | MainScene | lazily in `markDirty()` | 2s | **no** | Scene lifetime, restarted per mutation |

All three are created with `m.top.createChild("Timer")`, so they are children
of the scene and are destroyed with it. None is created inside a tab, a
dialog callback, or a loop.

### Why they cannot multiply

- `startIncomeTimer()` and `startEventTimer()` are each called exactly once,
  from `init()`. `init()` runs once per scene instantiation, and the scene is
  created once in `main.brs`. Relaunching the channel builds a fresh scene
  in a fresh process, so no state carries over.
- `markDirty()` guards creation with `if m.saveTimer = invalid`, so repeated
  mutations reuse the single timer instead of allocating a new one. Each call
  does `control = "stop"` then `control = "start"`, which restarts the 2s
  window rather than stacking timers. This is the debounce.
- `startTimerGuard()` (added for this audit) asserts the one-shot contract at
  runtime: if either repeating timer is somehow started twice, it logs a
  `[timer] WARNING` line rather than silently doubling the tick rate.

## Observers

| Field observed | Owner | Callback | Lifetime |
|---|---|---|---|
| `m.incomeTimer.fire` | MainScene | `onIncomeTick` | Scene lifetime, attached once |
| `m.eventTimer.fire` | MainScene | `onEventTimer` | Scene lifetime, attached once |
| `m.saveTimer.fire` | MainScene | `onSaveTimer` | Scene lifetime, attached once at creation |
| `activeTab` (XML `onChange`) | MainScene | `onTabChange` | Declarative, bound once by SceneGraph |
| `dialog.buttonSelected` | AutomationTab | `onConditionSelected` | Per-dialog, released on dismissal |
| `dialog2.buttonSelected` | AutomationTab | `onActionSelected` | Per-dialog, released on dismissal |
| `dialog.buttonSelected` | NodesTab | `onActionChosen` | Per-dialog, released on dismissal |
| `dialog.buttonSelected` | LogsTab | `onClearConfirm` | Per-dialog, released on dismissal |

### Dialog observer lifecycle

Each dialog is a fresh `roSGNode("Dialog")` created at the moment of use and
assigned to `m.top.getScene().dialog`. The observer is attached to that
specific node instance.

Every callback now calls `closeDialog()`, which:

1. Reads the current scene dialog.
2. Calls `unobserveField("buttonSelected")` on it, detaching the callback.
3. Sets `scene.dialog = invalid`, releasing the node.

Before this audit the callbacks set `scene.dialog = invalid` **without**
unobserving. The node was dropped and would eventually be collected, but the
subscription was never explicitly detached — so a dialog held alive by a
lingering reference could still deliver a `buttonSelected` change into a
callback whose surrounding state had already been cleared. Explicit
`unobserveField` removes that class of bug entirely.

Callbacks are also re-entrancy guarded: `m.dialogBusy` is set while a
callback runs, so a second `buttonSelected` change (rapid OK presses, or a
dismissal racing a selection) returns immediately instead of running the
action twice. This is the mechanism that prevents double rule creation and
double purchases.

## Shutdown behaviour

`main.brs` waits on `roSGScreenEvent`. On `isScreenClosed()` it now sends a
`shutdown` message to the scene before returning, and the scene's
`onShutdown()` handler stops all three timers and performs a final
unconditional `flushSave()`.

Previously `main.brs` returned immediately on screen close. Any mutation
inside the 2-second debounce window at that moment was **lost** — pressing
Home right after a purchase could discard it. The shutdown flush closes that
hole.

Note that Roku does not guarantee a graceful shutdown path in every exit
scenario (for example a hard power-off), so the debounce window remains the
worst-case exposure. It is 2 seconds, and every player-visible action
(purchase, node action, rule create/delete, log clear) additionally calls
`flushSave()` directly rather than relying on the debounce.

## Verification

- `scripts/test_timer_lifecycle.py` asserts the static contract: timer
  creation sites are guarded, starters are called once, every dialog
  observer has a matching `unobserveField`, and shutdown flushes.
- On-device instrumentation counted `onIncomeTick` and `onEventTimer`
  invocations over a soak run and compared them against elapsed wall time
  to confirm the tick rate matches the configured period (no doubling).
  See the issue thread for the recorded numbers.
