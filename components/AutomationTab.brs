' ============================================================
' RELAY-0 — AutomationTab.brs  (Rule Management)
' ============================================================
' Upgraded: 6 conditions, 6 actions, max 10 rules,
' dialog-based creation (2-step), fixed deletion edge cases
' ============================================================

sub init()
    m.selectedIndex = 0
    m.top.setFocus(true)
    updateRuleList()
end sub

sub setParentScene(parent)
    m.parentScene = parent
end sub

sub updateRuleList()
    if m.parentScene = invalid or m.parentScene.rules = invalid then return
    rules = m.parentScene.rules
    if rules.count() = 0
        m.top.findNode("ruleList").text = "No rules installed."
        return
    end if
    text = ""
    for i = 0 to rules.count() - 1
        r = rules[i]
        prefix = "  "
        if i = m.selectedIndex then prefix = "> "
        conditionText = r.condition
        actionText = r.action
        text = text + prefix + "[" + i.toStr() + "] " + conditionText + "  ->  " + actionText + chr(10)
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
    else if key = "down"
        if m.selectedIndex < rules.count() - 1 then m.selectedIndex = m.selectedIndex + 1
        updateRuleList()
        return true
    else if key = "right"
        ' Delete selected rule
        if rules.count() > 0 and m.selectedIndex < rules.count()
            deletedCondition = rules[m.selectedIndex].condition
            rules.delete(m.selectedIndex)
            ' Adjust selection
            maxIdx = rules.count() - 1
            if maxIdx < 0 then maxIdx = 0
            if m.selectedIndex > maxIdx then m.selectedIndex = maxIdx
            m.parentScene.flushSave()
            m.parentScene.addLog("Rule deleted: " + deletedCondition)
            updateRuleList()
        end if
        return true
    else if key = "OK"
        ' Check max rules (10)
        if rules.count() >= 10
            m.parentScene.addLog("Cannot add rule: maximum 10 rules reached.")
            return true
        end if
        showRuleBuilder()
        return true
    end if
    return false
end function

sub showRuleBuilder()
    dialog = CreateObject("roSGNode", "Dialog")
    dialog.title = "NEW AUTOMATION RULE"
    dialog.optionsDialog = true
    dialog.message = "Select a CONDITION to trigger the rule:"
    dialog.buttons = [
        "Power < 30",
        "Power < 10 (Critical)",
        "Heat > 70",
        "Heat > 85 (Critical)",
        "Throughput < 20",
        "Health < 30",
        "Cancel"
    ]
    dialog.observeField("buttonSelected", "onConditionSelected")
    m.top.getScene().dialog = dialog
end sub

sub onConditionSelected(event)
    dialog = m.top.getScene().dialog
    if dialog = invalid then return
    idx = dialog.buttonSelected
    m.top.getScene().dialog = invalid
    if idx = 6 or idx = -1 then return

    conditions = [
        "power < 30",
        "power < 10",
        "heat > 70",
        "heat > 85",
        "throughput < 20",
        "health < 30"
    ]
    if idx < 0 or idx > conditions.count() - 1 then return
    selectedCondition = conditions[idx]

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
    ' Store condition using a safe method (addfield on dialog is not available,
    ' so we store it in m before creating the observer)
    m.pendingCondition = selectedCondition
    dialog2.observeField("buttonSelected", "onActionSelected")
    m.top.getScene().dialog = dialog2
end sub

sub onActionSelected(event)
    dialog = m.top.getScene().dialog
    if dialog = invalid then return
    idx = dialog.buttonSelected
    condition = m.pendingCondition
    m.top.getScene().dialog = invalid
    if idx = 6 or idx = -1 then return
    if condition = invalid then return

    actions = [
        "boost_power",
        "reduce_heat",
        "earn_credits",
        "repair_health",
        "boost_throughput",
        "emergency_cool"
    ]
    if idx < 0 or idx > actions.count() - 1 then return
    selectedAction = actions[idx]

    if m.parentScene.rules = invalid then m.parentScene.rules = []
    rule = { condition: condition, action: selectedAction, target: "self" }
    m.parentScene.rules.push(rule)
    m.parentScene.flushSave()
    m.parentScene.addLog("New rule: " + condition + " -> " + selectedAction)
    m.pendingCondition = invalid
    updateRuleList()
end sub

function onEvent()
    updateRuleList()
    return invalid
end function
