' ============================================================
' RELAY-0 - AutomationTab.brs  (Rule Management)
' ============================================================

sub init()
    m.selectedIndex = 0
    m.top.setFocus(true)
    updateRuleList()
end sub

sub setParentScene(parent)
    m.parentScene = parent
end sub

sub updateRuleList(dummy = invalid as dynamic)
    if m.parentScene = invalid or m.parentScene.rules = invalid then
        m.top.findNode("ruleList").text = "No rules installed."
        return
    end if

    rules = m.parentScene.rules
    if rules.count() = 0 then
        m.top.findNode("ruleList").text = "No rules installed."
        return
    end if

    text = ""
    for i = 0 to rules.count() - 1
        r = rules[i]
        prefix = "  "
        if i = m.selectedIndex then prefix = "> "
        text = text + prefix + "[" + i.toStr() + "] " + r.condition + "  ->  " + r.action + chr(10)
    end for
    m.top.findNode("ruleList").text = text
end sub

function handleKey(key as string) as boolean
    if m.parentScene = invalid then return false

    rules = m.parentScene.rules
    if rules = invalid then rules = []

    if key = "up"
        if m.selectedIndex > 0 then m.selectedIndex = m.selectedIndex - 1
        updateRuleList()
        return true
    end if

    if key = "down"
        if m.selectedIndex < rules.count() - 1 then m.selectedIndex = m.selectedIndex + 1
        updateRuleList()
        return true
    end if

    if key = "right"
        ' Debounce: a rapid RIGHT burst would delete several rules at once.
        now = CreateObject("roDateTime").AsSeconds()
        if m.lastDeleteAt <> invalid and now = m.lastDeleteAt then return true
        m.lastDeleteAt = now
        if rules.count() > 0 and m.selectedIndex < rules.count()
            deletedCondition = rules[m.selectedIndex].condition
            rules.Delete(m.selectedIndex)
            ' Node fields are copy-on-access: assign the mutated local back.
            m.parentScene.rules = rules
            maxIdx = rules.count() - 1
            if maxIdx < 0 then maxIdx = 0
            if m.selectedIndex > maxIdx then m.selectedIndex = maxIdx
            m.parentScene.callFunc("flushSave", invalid)
            m.parentScene.callFunc("addLog", "Rule deleted: " + deletedCondition)
            updateRuleList()
        end if
        return true
    end if

    if key = "OK"
        if rules.count() >= 10
            m.parentScene.callFunc("addLog", "Cannot add rule: maximum 10 rules reached.")
            return true
        end if
        showRuleBuilder()
        return true
    end if

    return false
end function

sub showRuleBuilder()
    ' Refuse to stack dialogs: a rapid OK burst would otherwise open one
    ' dialog per press, each resolving into its own action.
    scene = m.top.getScene()
    if scene <> invalid and scene.dialog <> invalid then return
    if m.dialogBusy = true then return

    ' Condition labels shown to the player, paired 1:1 with m.conditionKeys
    ' below. Cancel is always the last button, so its index is derived
    ' rather than hardcoded.
    m.conditionKeys = [
        "power < 30",
        "power < 10",
        "heat > 70",
        "heat > 85",
        "throughput < 20",
        "health < 30"
    ]
    buttons = [
        "Power < 30",
        "Power < 10 (Critical)",
        "Heat > 70",
        "Heat > 85 (Critical)",
        "Throughput < 20",
        "Health < 30",
        "Cancel"
    ]
    dialog = CreateObject("roSGNode", "Dialog")
    dialog.title = "NEW AUTOMATION RULE"
    dialog.optionsDialog = true
    dialog.message = "Select a CONDITION to trigger the rule:"
    dialog.buttons = buttons
    dialog.observeField("buttonSelected", "onConditionSelected")
    m.top.getScene().dialog = dialog
end sub

sub onConditionSelected(event)
    if m.dialogBusy = true then return
    m.dialogBusy = true

    dialog = m.top.getScene().dialog
    if dialog = invalid
        m.dialogBusy = false
        return
    end if
    idx = dialog.buttonSelected
    closeDialog()

    ' Cancel / dismiss: leave the rule list untouched
    if m.conditionKeys = invalid then return
    if idx < 0 or idx > m.conditionKeys.count() - 1 then return
    selectedCondition = m.conditionKeys[idx]

    m.actionKeys = [
        "boost_power",
        "reduce_heat",
        "earn_credits",
        "repair_health",
        "boost_throughput",
        "emergency_cool"
    ]
    dialog2 = CreateObject("roSGNode", "Dialog")
    dialog2.title = "SELECT ACTION"
    dialog2.optionsDialog = true
    dialog2.message = "When [" + selectedCondition + "] is TRUE, do:"
    dialog2.buttons = [
        "Boost Power (+12)",
        "Reduce Heat (-18)",
        "Earn Credits (+30)",
        "Repair Health (+15)",
        "Boost Throughput (+15, Heat +5)",
        "Emergency Cool (+5 Pow, -30 Heat, -15 Credits, +5 Health)",
        "Cancel"
    ]
    ' Carry the condition across the dialog transition in component state,
    ' not as an undeclared field on the Dialog node.
    m.pendingCondition = selectedCondition
    dialog2.observeField("buttonSelected", "onActionSelected")
    m.top.getScene().dialog = dialog2
end sub

sub onActionSelected(event)
    if m.dialogBusy = true then return
    m.dialogBusy = true

    dialog = m.top.getScene().dialog
    if dialog = invalid
        m.dialogBusy = false
        return
    end if
    idx = dialog.buttonSelected
    condition = m.pendingCondition
    closeDialog()
    m.pendingCondition = invalid

    ' Cancel / dismiss / lost condition: leave the rule list untouched
    if condition = invalid then return
    if m.actionKeys = invalid then return
    if idx < 0 or idx > m.actionKeys.count() - 1 then return
    selectedAction = m.actionKeys[idx]

    ' Cooldown: the rule builder is a two-dialog flow, so a rapid OK burst
    ' can walk condition -> action repeatedly and create several rules from
    ' one unintended press storm. One rule per second is well above
    ' deliberate use.
    now = CreateObject("roDateTime").AsSeconds()
    if m.lastRuleAddAt <> invalid and now = m.lastRuleAddAt
        ' AutomationTab has no status label; the rule list is the feedback.
        return
    end if
    m.lastRuleAddAt = now

    ' Node fields are copy-on-access: read into a local, mutate, assign back.
    currentRules = m.parentScene.rules
    if currentRules = invalid then currentRules = []
    if currentRules.count() >= 10
        m.parentScene.callFunc("addLog", "Cannot add rule: maximum 10 rules reached.")
        return
    end if
    rule = { condition: condition, action: selectedAction, target: "self" }
    currentRules.push(rule)
    m.parentScene.rules = currentRules
    m.parentScene.callFunc("flushSave", invalid)
    m.parentScene.callFunc("addLog", "New rule: " + condition + " -> " + selectedAction)
    updateRuleList()
end sub

function onEvent(dummy = invalid as dynamic)
    updateRuleList()
    return invalid
end function

' Detach the dialog observer and release the node. Setting scene.dialog to
' invalid alone drops the reference without unsubscribing, leaving a live
' subscription on a node whose surrounding state has been cleared.
sub closeDialog()
    scene = m.top.getScene()
    if scene <> invalid
        dlg = scene.dialog
        if dlg <> invalid then dlg.unobserveField("buttonSelected")
        scene.dialog = invalid
    end if
    ' Release the re-entrancy guard so the next dialog can open.
    m.dialogBusy = false
end sub
