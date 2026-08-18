sub init()
    m.top.setFocus(true)
    m.top.activeTab = 0
    m.lastSaveTime = invalid
    loadGame()
    simulateWhileAway()
    createTabs()
    updateFooter()
    startEventTimer()
end sub

' ----- Save / Load (Epoch-based) -----
sub loadGame()
    reg = CreateObject("roRegistrySection", "relay0")
    if reg.Exists("saveData") then
        data = reg.Read("saveData")
        if data <> invalid then
            fields = m.top.getFields()
            parts = data.Split(",")
            for each p in parts
                kv = p.Split("=")
                if kv.Count() = 2 then
                    if kv[0] = "credits" then fields.credits = kv[1].ToInt()
                    if kv[0] = "power" then fields.power = kv[1].ToInt()
                    if kv[0] = "heat" then fields.heat = kv[1].ToInt()
                    if kv[0] = "throughput" then fields.throughput = kv[1].ToInt()
                    if kv[0] = "nodes" then fields.nodesUnlocked = kv[1].ToInt()
                    if kv[0] = "lastTime" then m.lastSaveTime = kv[1].ToInt()
                end if
            end for
        end if
    end if

    if m.lastSaveTime = invalid then m.lastSaveTime = getCurrentEpoch()

    if reg.Exists("rules") then
        rulesJson = reg.Read("rules")
        if rulesJson <> invalid then
            m.top.rules = parseJson(rulesJson)
        end if
    end if
    if m.top.rules = invalid then m.top.rules = []

    if reg.Exists("logs") then
        logsJson = reg.Read("logs")
        if logsJson <> invalid then m.top.logEntries = parseJson(logsJson)
    end if
    if m.top.logEntries = invalid then m.top.logEntries = []
end sub

sub saveGame()
    data = "credits=" + m.top.credits.ToStr()
    data = data + ",power=" + m.top.power.ToStr()
    data = data + ",heat=" + m.top.heat.ToStr()
    data = data + ",throughput=" + m.top.throughput.ToStr()
    data = data + ",nodes=" + m.top.nodesUnlocked.ToStr()
    data = data + ",lastTime=" + getCurrentEpoch().ToStr()

    reg = CreateObject("roRegistrySection", "relay0")
    reg.Write("saveData", data)

    if m.top.rules <> invalid then
        reg.Write("rules", FormatJson(m.top.rules))
    end if
    if m.top.logEntries <> invalid then
        reg.Write("logs", FormatJson(m.top.logEntries))
    end if
    reg.Flush()
end sub

function getCurrentEpoch() as integer
    dt = CreateObject("roDateTime")
    return dt.AsSeconds()
end function

sub simulateWhileAway()
    now = getCurrentEpoch()
    elapsedSeconds = now - m.lastSaveTime
    if elapsedSeconds <= 0 then return
    m.lastSaveTime = now

    deltaCredits = (10 * elapsedSeconds) / 60
    deltaPower = -(5 * elapsedSeconds) / 60
    deltaHeat = (8 * elapsedSeconds) / 60
    deltaThroughput = (3 * elapsedSeconds) / 60

    m.top.credits = m.top.credits + deltaCredits
    m.top.power = MaxInt(0, MinInt(100, m.top.power + deltaPower))
    m.top.heat = MaxInt(0, MinInt(100, m.top.heat + deltaHeat))
    m.top.throughput = MaxInt(0, MinInt(100, m.top.throughput + deltaThroughput))

    if elapsedSeconds > 30 then
        minutesAway = elapsedSeconds / 60
        addLog("Resuming after " + minutesAway.ToStr() + " minutes. System adjusted.")
    end if
    saveGame()
end sub

' ----- Tab Management -----
sub createTabs()
    m.tabs = [
        CreateObject("roSGNode", "MonitorTab"),
        CreateObject("roSGNode", "AutomationTab"),
        CreateObject("roSGNode", "NodesTab"),
        CreateObject("roSGNode", "LogsTab")
    ]
    for each tab in m.tabs
        tab.CallFunc("setParentScene", m.top)
        m.top.tabContainer.appendChild(tab)
        tab.visible = false
        tab.setFocus(true)
    end for
    showCurrentTab()
end sub

sub onTabChange()
    showCurrentTab()
end sub

sub showCurrentTab()
    for i = 0 to m.tabs.Count() - 1
        m.tabs[i].visible = (i = m.top.activeTab)
    end for
    updateTabHighlight()
end sub

sub updateTabHighlight()
    m.top.findNode("tabMonitor").color = 0x00FF41FF
    m.top.findNode("tabAuto").color = 0x44FF44FF
    m.top.findNode("tabNodes").color = 0x44FF44FF
    m.top.findNode("tabLogs").color = 0x44FF44FF
    if m.top.activeTab = 0 then m.top.findNode("tabMonitor").color = 0xFFFFFF00
    if m.top.activeTab = 1 then m.top.findNode("tabAuto").color = 0xFFFFFF00
    if m.top.activeTab = 2 then m.top.findNode("tabNodes").color = 0xFFFFFF00
    if m.top.activeTab = 3 then m.top.findNode("tabLogs").color = 0xFFFFFF00
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "right" then
        m.top.activeTab = (m.top.activeTab + 1) mod 4
        return true
    else if key = "left" then
        m.top.activeTab = (m.top.activeTab + 3) mod 4
        return true
    end if
    current = m.tabs[m.top.activeTab]
    if current <> invalid and current.callFunc("handleKeyEvent", key, press) then 
        return true
    end if
    
    return false
end function

' ----- Global Helpers -----
sub addLog(msg as string)
    if m.top.logEntries = invalid then m.top.logEntries = []
    dt = CreateObject("roDateTime")
    timestamp = dt.AsDateString() + " " + dt.ToTimeString()
    entry = timestamp + ": " + msg
    m.top.logEntries.Insert(0, entry)
    if m.top.logEntries.Count() > 50 then m.top.logEntries.Pop()
    saveGame()
    if m.top.activeTab = 3 then
        logsTab = m.tabs[3]
        if logsTab <> invalid then logsTab.CallFunc("refresh")
    end if
end sub

sub updateFooter()
    footer = m.top.findNode("footer")
    footer.text = "Credits: " + m.top.credits.ToStr() + " | Power: " + m.top.power.ToStr() + "/100 | Heat: " + m.top.heat.ToStr() + "/100 | Throughput: " + m.top.throughput.ToStr()
end sub

sub applyResourceChanges(deltaPower, deltaHeat, deltaThroughput, deltaCredits)
    m.top.power = MaxInt(0, MinInt(100, m.top.power + deltaPower))
    m.top.heat = MaxInt(0, MinInt(100, m.top.heat + deltaHeat))
    m.top.throughput = MaxInt(0, MinInt(100, m.top.throughput + deltaThroughput))
    m.top.credits = m.top.credits + deltaCredits
    updateFooter()
    saveGame()
end sub

' ----- Automation Rule Engine -----
sub processRules()
    if m.top.rules = invalid then return
    for each rule in m.top.rules
        condition = rule.condition
        action = rule.action
        satisfied = false
        if condition = "power < 30" and m.top.power < 30 then satisfied = true
        if condition = "heat > 70" and m.top.heat > 70 then satisfied = true
        if condition = "throughput < 20" and m.top.throughput < 20 then satisfied = true
        if satisfied then
            if action = "boost_power" then applyResourceChanges(10, 0, 0, 0)
            if action = "reduce_heat" then applyResourceChanges(0, -15, 0, 0)
            if action = "earn_credits" then applyResourceChanges(0, 0, 0, 25)
            addLog("Rule triggered: " + condition + " -> " + action)
        end if
    end for
end sub

' ----- Events Timer -----
sub startEventTimer()
    m.eventTimer = m.top.createChild("Timer")
    m.eventTimer.repeat = true
    m.eventTimer.duration = 45
    m.eventTimer.observeField("fire", "onEventTimer")
    m.eventTimer.control = "start"
end sub

sub onEventTimer()
    processRules()
    if rnd(100) <= 30 then triggerRandomEvent()
end sub

sub triggerRandomEvent()
    eventType = rnd(5)
    msg = ""
    deltaP = 0 : deltaH = 0 : deltaT = 0 : deltaC = 0

    if eventType = 1
        msg = "⚠ INTRUSION DETECTED! Throughput reduced by 15."
        deltaT = -15
        deltaC = -10
    else if eventType = 2
        msg = "🔥 THERMAL SPIKE! Heat +20, Power -10."
        deltaH = 20
        deltaP = -10
    else if eventType = 3
        msg = "🌪 PACKET STORM! Throughput +25, Heat +15."
        deltaT = 25
        deltaH = 15
    else if eventType = 4
        msg = "⚡ EFFICIENCY BOOST! Credits +30."
        deltaC = 30
    else
        msg = "👻 GHOST SIGNAL: Node whispers in the dark. Heat -10, Credits +5."
        deltaH = -10
        deltaC = 5
    end if

    addLog(msg)
    applyResourceChanges(deltaP, deltaH, deltaT, deltaC)

    for each tab in m.tabs
        if tab.visible and tab.CallFunc("onEvent") <> invalid then
            tab.CallFunc("onEvent")
        end if
    end for
end sub

' ----- Math helpers -----
function MaxInt(a, b) as integer
    if a > b then return a else return b
end function

function MinInt(a, b) as integer
    if a < b then return a else return b
end function
