sub init()
    m.selectedIndex = 0
    updateRuleList()
    m.top.setFocus(true)
end sub

sub setParentScene(parentScene)
    m.parentScene = parentScene
end sub

sub updateRuleList()
    parent = m.parentScene
    if parent = invalid or parent.rules = invalid then return
    rules = parent.rules
    if rules.Count() = 0 then
        m.top.findNode("ruleList").text = "No rules installed."
        return
    end if
    text = ""
    for i = 0 to rules.Count() - 1
        r = rules[i]
        prefix = ""
        if i = m.selectedIndex then prefix = "> "
        text = text + prefix + r.condition + " then " + r.action + " on " + r.target + chr(10)
    end for
    m.top.findNode("ruleList").text = text
end sub

function handleKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    parent = m.parentScene
    if parent = invalid then return false

    if key = "up" then
        if m.selectedIndex > 0 then m.selectedIndex = m.selectedIndex - 1
        updateRuleList()
        return true
    else if key = "down" then
        if parent.rules <> invalid and m.selectedIndex < parent.rules.Count() - 1 then
            m.selectedIndex = m.selectedIndex + 1
        end if
        updateRuleList()
        return true
    else if key = "right" then
        if parent.rules <> invalid and parent.rules.Count() > 0 then
            parent.rules.Delete(m.selectedIndex)
            if m.selectedIndex >= parent.rules.Count() then m.selectedIndex = parent.rules.Count() - 1
            if m.selectedIndex < 0 then m.selectedIndex = 0
            parent.saveGame()
            updateRuleList()
            parent.addLog("Rule deleted.")
        end if
        return true
    else if key = "OK" then
        showRuleBuilder()
        return true
    end if
    return false
end function

sub showRuleBuilder()
    dialog = CreateObject("roSGNode", "Dialog")
    dialog.title = "New Automation Rule"
    dialog.optionsDialog = true
    dialog.message = "Condition: [1] Power<30 [2] Heat>70 [3] Throughput<20"
    dialog.buttons = ["Power<30", "Heat>70", "Throughput<20", "Cancel"]
    dialog.observeField("buttonSelected", "onRuleSelected")
    m.top.getScene().dialog = dialog
end sub

sub onRuleSelected(event)
    dialog = m.top.getScene().dialog
    if dialog = invalid then return
    idx = dialog.buttonSelected
    m.top.getScene().dialog = invalid
    if idx = 3 then return

    condition = ""
    if idx = 0 then condition = "power < 30"
    else if idx = 1 then condition = "heat > 70"
    else if idx = 2 then condition = "throughput < 20"

    dialog2 = CreateObject("roSGNode", "Dialog")
    dialog2.title = "Select Action"
    dialog2.optionsDialog = true
    dialog2.message = "When condition true:"
    dialog2.buttons = ["Boost Power (+10)", "Reduce Heat (-15)", "Earn Credits (+25)", "Cancel"]
    dialog2.observeField("buttonSelected", "onActionSelected")
    dialog2.condition = condition
    m.top.getScene().dialog = dialog2
end sub

sub onActionSelected(event)
    dialog = m.top.getScene().dialog
    if dialog = invalid then return
    idx = dialog.buttonSelected
    condition = dialog.condition
    m.top.getScene().dialog = invalid
    if idx = 3 or idx = -1 then return

    action = ""
    target = "self"
    if idx = 0 then action = "boost_power"
    else if idx = 1 then action = "reduce_heat"
    else if idx = 2 then action = "earn_credits"

    parent = m.parentScene
    if parent.rules = invalid then parent.rules = []
    rule = { condition: condition, action: action, target: target }
    parent.rules.Push(rule)
    parent.saveGame()
    parent.addLog("New automation rule added: " + condition + " -> " + action)
    updateRuleList()
end sub

function onEvent() as boolean
    return false
end function
