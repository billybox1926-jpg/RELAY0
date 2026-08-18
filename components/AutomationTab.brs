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

sub updateRuleList()
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
        if rules.count() > 0 and m.selectedIndex < rules.count()
            deletedCondition = rules[m.selectedIndex].condition
            rules.Delete(m.selectedIndex)
            ' Node fields are copy-on-access: assign the mutated local back.
            m.parentScene.rules = rules
            maxIdx = rules.count() - 1
            if maxIdx < 0 then maxIdx = 0
            if m.selectedIndex > maxIdx then m.selectedIndex = maxIdx
            m.parentScene.flushSave()
            m.parentScene.addLog("Rule deleted: " + deletedCondition)
            updateRuleList()
        end if
        return true
    end if

    if key = "OK"
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
    m.pendingCondition = invalid
    if idx = 6 or idx = -1 or condition = invalid then return

    actions = [
        "boost_power",
        "reduce_heat",
        "earn_credits",
        "repair_health",
        "boost_throughput",
        "emergency_cool"
    ]
    selectedAction = actions[idx]

    ' Node fields are copy-on-access: read into a local, mutate, assign back.
    currentRules = m.parentScene.rules
    if currentRules = invalid then currentRules = []
    rule = { condition: condition, action: selectedAction, target: "self" }
    currentRules.push(rule)
    m.parentScene.rules = currentRules
    m.parentScene.flushSave()
    m.parentScene.addLog("New rule: " + condition + " -> " + selectedAction)
    updateRuleList()
end sub

function onEvent()
    updateRuleList()
    return invalid
end function
