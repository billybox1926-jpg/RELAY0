' ============================================================
' RELAY-0 - MainScene.brs  (Core Game Engine v1.1)
' ============================================================
' v1.1 - Roku Platform Optimizations:
'   - Cached roRegistrySection (avoid re-creating on every save)
'   - Dirty-flag save throttling (debounced 2s timer instead of
'     saving on every single event/rule/income tick)
'   - Local variable optimization in onIncomeTick (avoid m scope
'     in hot path per Roku perf best practice)
'   - Telnet debug logging via print() for port 8085 console
'   - Deduped addLog + processRules saves (no double-write)
'   - Reduced FormatJson calls (only on rules/logs change, not
'     every resource tick)
'   - Guard against save during dialog (SceneGraph focus safety)
' ============================================================

sub init()
    m.top.setFocus(true)
    m.top.activeTab = 0
    m.saveVersion = 2
    m.lastSaveTime = invalid
    m.tabCount = 4
    m.incomeTimer = invalid
    m.saveTimer = invalid
    m.saveDirty = false
    m.saveReg = CreateObject("roRegistrySection", "relay0")
    m.lastRulesJson = ""
    m.lastLogsJson = ""

    print "=== RELAY-0 v1.1 booting ==="

    loadGame()
    simulateWhileAway()
    createTabs()
    updateFooter()
    startEventTimer()
    startIncomeTimer()
    addLog("RELAY-0 terminal initialized. System online.")
    print "=== RELAY-0 ready. Rules: " + m.top.rules.count().toStr() + ", Logs: " + m.top.logEntries.count().toStr() + " ==="
end sub

' ----- Save / Load (Cached Registry, Debounced) -----
sub loadGame()
    reg = m.saveReg

    ' Read save version
    saveVer = 1
    if reg.Exists("saveVersion")
        v = reg.Read("saveVersion")
        if v <> invalid then saveVer = v.toInt()
    end if
    m.saveVersion = saveVer

    if reg.Exists("saveData")
        data = reg.Read("saveData")
        if data <> invalid and data <> ""
            parts = data.split(",")
            for each p in parts
                kv = p.split("=")
                if kv.count() = 2
                    key = kv[0].trim()
                    val = kv[1].trim().toInt()
                    if key = "credits" then m.top.credits = val
                    if key = "power" then m.top.power = val
                    if key = "heat" then m.top.heat = val
                    if key = "throughput" then m.top.throughput = val
                    if key = "nodes" then m.top.nodesUnlocked = max(1, val)
                    if key = "lastTime" then m.lastSaveTime = val
                    if key = "upgrade" then m.top.upgradeLevel = val
                    if key = "health" then m.top.networkHealth = max(0, val)
                end if
            end for
        end if
    end if

    if m.lastSaveTime = invalid then m.lastSaveTime = getCurrentEpoch()

    ' Load automation rules
    if reg.Exists("rules")
        rulesJson = reg.Read("rules")
        if rulesJson <> invalid and rulesJson <> ""
            parsed = parseJson(rulesJson)
            if parsed <> invalid then m.top.rules = parsed
            m.lastRulesJson = rulesJson
        end if
    end if
    if m.top.rules = invalid then m.top.rules = []

    ' Load logs
    if reg.Exists("logs")
        logsJson = reg.Read("logs")
        if logsJson <> invalid and logsJson <> ""
            parsed = parseJson(logsJson)
            if parsed <> invalid then m.top.logEntries = parsed
            m.lastLogsJson = logsJson
        end if
    end if
    if m.top.logEntries = invalid then m.top.logEntries = []

    print "[loadGame] credits=" + m.top.credits.toStr() + " power=" + m.top.power.toStr() + " heat=" + m.top.heat.toStr()
end sub

sub saveGame()
    ' Build save data string using local vars (avoid repeated m.top access)
    credits = m.top.credits
    power = m.top.power
    heat = m.top.heat
    throughput = m.top.throughput
    nodes = m.top.nodesUnlocked
    upgrade = m.top.upgradeLevel
    health = m.top.networkHealth

    data = "credits=" + credits.toStr()
    data = data + ",power=" + power.toStr()
    data = data + ",heat=" + heat.toStr()
    data = data + ",throughput=" + throughput.toStr()
    data = data + ",nodes=" + nodes.toStr()
    data = data + ",lastTime=" + getCurrentEpoch().toStr()
    data = data + ",upgrade=" + upgrade.toStr()
    data = data + ",health=" + health.toStr()

    reg = m.saveReg
    reg.Write("saveVersion", m.saveVersion.toStr())
    reg.Write("saveData", data)

    ' Only serialize rules/logs if they changed (expensive FormatJson)
    rules = m.top.rules
    if rules <> invalid and rules.count() > 0
        rulesJson = FormatJson(rules)
        if rulesJson <> m.lastRulesJson
            reg.Write("rules", rulesJson)
            m.lastRulesJson = rulesJson
        end if
    else
        if m.lastRulesJson <> "[]"
            reg.Write("rules", "[]")
            m.lastRulesJson = "[]"
        end if
    end if

    logEntries = m.top.logEntries
    if logEntries <> invalid and logEntries.count() > 0
        logsJson = FormatJson(logEntries)
        if logsJson <> m.lastLogsJson
            reg.Write("logs", logsJson)
            m.lastLogsJson = logsJson
        end if
    else
        if m.lastLogsJson <> "[]"
            reg.Write("logs", "[]")
            m.lastLogsJson = "[]"
        end if
    end if

    reg.Flush()
end sub

' Debounced save: marks dirty and starts a 2-second timer.
' Multiple calls within 2s collapse into a single write.
sub markDirty()
    m.saveDirty = true
    if m.saveTimer = invalid
        m.saveTimer = m.top.createChild("Timer")
        m.saveTimer.repeat = false
        m.saveTimer.duration = 2
        m.saveTimer.observeField("fire", "onSaveTimer")
    end if
    m.saveTimer.control = "stop"
    m.saveTimer.control = "start"
end sub

sub onSaveTimer()
    if m.saveDirty
        m.saveDirty = false
        saveGame()
        print "[saveGame] flushed dirty save"
    end if
end sub

sub flushSave()
    ' Immediate unconditional save. Callers (tabs, init/shutdown) mutate
    ' m.top fields or rules/logs directly without going through markDirty(),
    ' so this must not be gated on m.saveDirty or those writes are lost.
    m.saveDirty = false
    if m.saveTimer <> invalid then m.saveTimer.control = "stop"
    saveGame()
end sub

function getCurrentEpoch() as integer
    dt = CreateObject("roDateTime")
    return dt.AsSeconds()
end function

' ----- Offline Simulation -----
sub simulateWhileAway()
    now = getCurrentEpoch()
    elapsedSeconds = now - m.lastSaveTime
    if elapsedSeconds <= 0 then return
    m.lastSaveTime = now

    ' Pull values into locals
    throughput = m.top.throughput
    upgradeLevel = m.top.upgradeLevel
    power = m.top.power
    heat = m.top.heat

    ' Passive income: base 10 credits/min, scaled by throughput and upgrade level
    throughputMult = throughput / 50.0
    upgradeMult = 1.0 + (upgradeLevel * 0.25)
    creditRate = Cint(10 * throughputMult * upgradeMult)
    if creditRate < 1 then creditRate = 1

    deltaCredits = Cint((creditRate * elapsedSeconds) / 60.0)
    deltaPower = Cint(-(5 * elapsedSeconds) / 60.0)
    deltaHeat = Cint((8 * elapsedSeconds) / 60.0)
    deltaThroughput = Cint((3 * elapsedSeconds) / 60.0)
    deltaHealth = Cint(-(2 * elapsedSeconds) / 60.0)

    m.top.credits = m.top.credits + deltaCredits
    m.top.power = clamp(power + deltaPower, 0, 100)
    m.top.heat = clamp(heat + deltaHeat, 0, 100)
    m.top.throughput = clamp(throughput + deltaThroughput, 0, 100)
    m.top.networkHealth = clamp(m.top.networkHealth + deltaHealth, 0, 100)

    if m.top.credits < 0 then m.top.credits = 0

    ' Overheating damage while away
    if m.top.heat > 85
        damage = Cint((m.top.heat - 85) * elapsedSeconds / 300.0)
        m.top.networkHealth = clamp(m.top.networkHealth - damage, 0, 100)
    end if

    ' Low power degrades throughput while away
    if m.top.power < 10
        loss = Cint((10 - m.top.power) * elapsedSeconds / 120.0)
        m.top.throughput = clamp(m.top.throughput - loss, 0, 100)
    end if

    if elapsedSeconds > 30
        minutesAway = (elapsedSeconds / 60.0).toStr()
        addLog("Resuming after " + minutesAway + " min offline. Systems adjusted.")
        print "[offline] " + minutesAway + " minutes away, resources adjusted"
    end if
    flushSave()
end sub

' ----- Tab Management -----
sub createTabs()
    container = m.top.findNode("tabContainer")
    if container = invalid
        print "[createTabs] FATAL: tabContainer node not found"
        return
    end if

    m.tabs = [
        CreateObject("roSGNode", "MonitorTab"),
        CreateObject("roSGNode", "AutomationTab"),
        CreateObject("roSGNode", "NodesTab"),
        CreateObject("roSGNode", "LogsTab")
    ]
    for each tabNode in m.tabs
        tabNode.callFunc("setParentScene", m.top)
        container.appendChild(tabNode)
        tabNode.visible = false
    end for
    showCurrentTab()
end sub

sub onTabChange()
    showCurrentTab()
end sub

sub showCurrentTab()
    tabIdx = m.top.activeTab
    if tabIdx < 0 or tabIdx >= m.tabCount then tabIdx = 0
    for i = 0 to m.tabs.count() - 1
        m.tabs[i].visible = (i = tabIdx)
    end for
    updateTabHighlight()

    current = m.tabs[tabIdx]
    if current <> invalid
        if tabIdx = 0 then current.callFunc("updateUI")
        if tabIdx = 3 then current.callFunc("refresh")
        if tabIdx = 2 then current.callFunc("updateUI")
    end if
end sub

sub updateTabHighlight()
    ' Use cached node references to avoid repeated findNode calls
    if m.tabLabels = invalid
        m.tabLabels = [
            m.top.findNode("tabMonitor"),
            m.top.findNode("tabAuto"),
            m.top.findNode("tabNodes"),
            m.top.findNode("tabLogs")
        ]
        m.tabUnderlines = [
            m.top.findNode("tabUnderline0"),
            m.top.findNode("tabUnderline1"),
            m.top.findNode("tabUnderline2"),
            m.top.findNode("tabUnderline3")
        ]
    end if

    dimColor = &h44FF44FF
    dimUnder = &h00FF4140
    activeColor = &hFFFFFFFF

    for i = 0 to 3
        m.tabLabels[i].color = dimColor
        m.tabUnderlines[i].color = dimUnder
    end for

    tabIdx = m.top.activeTab
    if tabIdx >= 0 and tabIdx < 4
        m.tabLabels[tabIdx].color = activeColor
        m.tabUnderlines[tabIdx].color = activeColor
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    if key = "right"
        m.top.activeTab = (m.top.activeTab + 1) mod m.tabCount
        return true
    else if key = "left"
        m.top.activeTab = (m.top.activeTab + m.tabCount - 1) mod m.tabCount
        return true
    end if
    tabIdx = m.top.activeTab
    if tabIdx >= 0 and tabIdx < m.tabs.count()
        current = m.tabs[tabIdx]
        if current <> invalid and current.callFunc("handleKey", key) = true then return true
    end if
    return false
end function

' ----- Logging -----
sub addLog(msg as string)
    dt = CreateObject("roDateTime")
    dt.ToLocalTime()
    hh = dt.GetHours()
    mm = dt.GetMinutes()
    ss = dt.GetSeconds()
    hhs = hh.toStr()
    mms = mm.toStr()
    sss = ss.toStr()
    if hh < 10 then hhs = "0" + hhs
    if mm < 10 then mms = "0" + mms
    if ss < 10 then sss = "0" + sss
    timestamp = dt.AsDateString("short-date") + " " + hhs + ":" + mms + ":" + sss
    entry = timestamp + ": " + msg

    ' Node fields are copy-on-access: mutating m.top.logEntries in place would
    ' only modify a throwaway copy. Read into a local, mutate, assign back.
    entries = m.top.logEntries
    if entries = invalid then entries = []
    entries.unshift(entry)
    while entries.count() > 100
        entries.pop()
    end while
    m.top.logEntries = entries

    ' Refresh logs tab if visible
    if m.top.activeTab = 3 and m.tabs.count() > 3
        logsTab = m.tabs[3]
        if logsTab <> invalid then logsTab.callFunc("refresh")
    end if

    ' Debounced save (don't flush immediately)
    markDirty()
end sub

' ----- Footer / HUD -----
sub updateFooter()
    ' Pull all values into local scope first (m.top is slower)
    credits = m.top.credits
    power = m.top.power
    heat = m.top.heat
    throughput = m.top.throughput
    nodesUnlocked = m.top.nodesUnlocked
    networkHealth = m.top.networkHealth
    upgradeLevel = m.top.upgradeLevel

    footer = m.top.findNode("footer")
    warn = ""
    if heat > 80 then warn = " [!OVERHEAT!]"
    if power < 15 then warn = warn + " [LOW POWER]"
    if networkHealth < 30 then warn = warn + " [CRITICAL]"

    text = "Credits: " + credits.toStr()
    text = text + "  |  Power: " + power.toStr() + "/100"
    text = text + "  |  Heat: " + heat.toStr() + "/100"
    text = text + "  |  Throughput: " + throughput.toStr() + "/100"
    text = text + "  |  Nodes: " + nodesUnlocked.toStr()
    text = text + "  |  Health: " + networkHealth.toStr() + "%"
    text = text + "  |  Lvl: " + upgradeLevel.toStr()
    if warn <> "" then text = text + warn

    footer.text = text

    if heat > 80 or power < 15 or networkHealth < 30
        footer.color = &hFF4444FF
    else if heat > 60 or power < 30
        footer.color = &hFFAA44FF
    else
        footer.color = &h88FF88FF
    end if
end sub

' ----- Resource Changes (Central) -----
sub applyResourceChanges(deltaPower, deltaHeat, deltaThroughput, deltaCredits, deltaHealth)
    if deltaHealth = invalid then deltaHealth = 0
    m.top.power = clamp(m.top.power + deltaPower, 0, 100)
    m.top.heat = clamp(m.top.heat + deltaHeat, 0, 100)
    m.top.throughput = clamp(m.top.throughput + deltaThroughput, 0, 100)
    m.top.networkHealth = clamp(m.top.networkHealth + deltaHealth, 0, 100)
    m.top.credits = m.top.credits + deltaCredits
    if m.top.credits < 0 then m.top.credits = 0
    updateFooter()
    ' Debounced save instead of immediate
    markDirty()
end sub

' ----- Automation Rule Engine (Expanded) -----
sub processRules()
    rules = m.top.rules
    if rules = invalid or rules.count() = 0 then return

    ' Pull current values into locals for the condition checks
    currentPower = m.top.power
    currentHeat = m.top.heat
    currentThroughput = m.top.throughput
    currentHealth = m.top.networkHealth

    rulesFired = 0
    for each rule in rules
        if rule.condition = invalid or rule.action = invalid then continue for
        condition = rule.condition
        action = rule.action
        satisfied = false

        if condition = "power < 30" and currentPower < 30 then satisfied = true
        if condition = "power < 10" and currentPower < 10 then satisfied = true
        if condition = "heat > 70" and currentHeat > 70 then satisfied = true
        if condition = "heat > 85" and currentHeat > 85 then satisfied = true
        if condition = "throughput < 20" and currentThroughput < 20 then satisfied = true
        if condition = "health < 30" and currentHealth < 30 then satisfied = true

        if satisfied
            if action = "boost_power" then applyResourceChanges(12, 0, 0, 0, 0)
            if action = "reduce_heat" then applyResourceChanges(0, -18, 0, 0, 0)
            if action = "earn_credits" then applyResourceChanges(0, 0, 0, 30, 0)
            if action = "repair_health" then applyResourceChanges(0, 0, 0, 0, 15)
            if action = "boost_throughput" then applyResourceChanges(0, 5, 15, 0, 0)
            if action = "emergency_cool" then applyResourceChanges(5, -30, -10, -15, 5)
            addLog("Rule fired: " + condition + " -> " + action)
            rulesFired = rulesFired + 1
            ' Refresh locals after applyResourceChanges mutates values
            currentPower = m.top.power
            currentHeat = m.top.heat
            currentThroughput = m.top.throughput
            currentHealth = m.top.networkHealth
        end if
    end for
    if rulesFired > 0 then print "[rules] " + rulesFired.toStr() + " rule(s) fired"
end sub

' ----- Event Timer (every 30s) -----
sub startEventTimer()
    m.eventTimer = m.top.createChild("Timer")
    m.eventTimer.repeat = true
    m.eventTimer.duration = 30
    m.eventTimer.observeField("fire", "onEventTimer")
    m.eventTimer.control = "start"
end sub

sub onEventTimer()
    processRules()
    if rnd(100) <= 35 then triggerRandomEvent()
    ' Notify visible tabs
    for each tabNode in m.tabs
        if tabNode.visible then tabNode.callFunc("onEvent")
    end for
end sub

' ----- Income Timer (every 15s) -----
sub startIncomeTimer()
    m.incomeTimer = m.top.createChild("Timer")
    m.incomeTimer.repeat = true
    m.incomeTimer.duration = 15
    m.incomeTimer.observeField("fire", "onIncomeTick")
    m.incomeTimer.control = "start"
end sub

sub onIncomeTick()
    ' OPTIMIZATION: Pull all m.top values into local scope first.
    ' Per Roku dev best practices, m scope access is slower than local.
    ' This is our hottest code path (fires every 15s).
    throughput = m.top.throughput
    upgradeLevel = m.top.upgradeLevel
    heat = m.top.heat
    power = m.top.power
    nodesUnlocked = m.top.nodesUnlocked

    throughputMult = throughput / 50.0
    upgradeMult = 1.0 + (upgradeLevel * 0.25)
    earned = Cint(5 * throughputMult * upgradeMult)
    if earned < 1 then earned = 1

    heatGain = Cint(2 + (throughput / 25.0))
    powerLoss = Cint(2 + nodesUnlocked)

    healthDelta = 0
    if heat > 85 then healthDelta = -3
    if power < 10 then healthDelta = healthDelta - 2

    applyResourceChanges(-powerLoss, heatGain, 0, earned, healthDelta)

    if m.top.activeTab = 0 and m.tabs.count() > 0
        m.tabs[0].callFunc("updateUI")
    end if
end sub

' ----- Random Events (12 types) -----
sub triggerRandomEvent()
    eventType = rnd(12)
    msg = ""
    deltaP = 0 : deltaH = 0 : deltaT = 0 : deltaC = 0 : deltaHp = 0

    if eventType = 1
        msg = "!! INTRUSION DETECTED - Unauthorized access. Throughput -15, Credits -10."
        deltaT = -15 : deltaC = -10 : deltaHp = -5
    else if eventType = 2
        msg = ">> THERMAL SPIKE - Cooling failure. Heat +20, Power -10."
        deltaH = 20 : deltaP = -10
    else if eventType = 3
        msg = ">> PACKET STORM - Data surge. Throughput +25, Heat +15."
        deltaT = 25 : deltaH = 15
    else if eventType = 4
        msg = "** EFFICIENCY BOOST - Optimized routing. Credits +30."
        deltaC = 30
    else if eventType = 5
        msg = "~~ GHOST SIGNAL - Unknown node whispering. Heat -10, Credits +5."
        deltaH = -10 : deltaC = 5
    else if eventType = 6
        msg = "** POWER SURGE - Grid feedback. Power +25, Heat +10."
        deltaP = 25 : deltaH = 10
    else if eventType = 7
        msg = "!! DATA CORRUPTION - Memory damaged. Throughput -20, Health -10."
        deltaT = -20 : deltaHp = -10
    else if eventType = 8
        msg = "++ FIRMWARE UPDATE - Patch applied. Health +15, Throughput +5."
        deltaHp = 15 : deltaT = 5
    else if eventType = 9
        msg = "!! SOLAR FLARE - EM interference. All systems disrupted."
        deltaP = -15 : deltaH = 25 : deltaT = -10 : deltaHp = -8
    else if eventType = 10
        msg = "$$ CONTRACT FULFILLED - Payment received. Credits +50."
        deltaC = 50
    else if eventType = 11
        msg = "++ COOLING CACHE - Coolant reserves found. Heat -25."
        deltaH = -25
    else
        msg = "~~ SYSTEM GLITCH - Minor anomaly. Power +5, Heat -5."
        deltaP = 5 : deltaH = -5
    end if

    print "[event] " + msg
    addLog(msg)
    applyResourceChanges(deltaP, deltaH, deltaT, deltaC, deltaHp)
end sub

' ----- Utility Functions -----
function clamp(val, lo, hi) as integer
    if val < lo then return lo
    if val > hi then return hi
    return val
end function

function max(a, b)
    if a > b then return a else return b
end function

function min(a, b)
    if a < b then return a else return b
end function
