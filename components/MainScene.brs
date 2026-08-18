' ============================================================
' RELAY-0 - MainScene.brs  (Core Game Engine v1.2)
' ============================================================
' v1.2 - Rebalanced economy (homeostasis model):
'   - Power/heat/throughput drift toward sustainable targets instead
'     of draining one-way into an unrecoverable death spiral
'   - Upgrades raise those targets, so investment is felt passively
'   - Events are rarer, gentler, and suppressed while struggling
'   - Health slowly self-repairs; damage only at true extremes
'   - Save v3 migration rescues saves wedged at power=0/heat=100
'   - All tuning lives in tuning() below - edit there, not inline
' ============================================================

' ---- Central tuning table -------------------------------------
' Every balance number lives here so the game can be retuned in one
' place without hunting through the logic.
function tuning() as object
    return {
        incomeBase:          6     ' credits per tick at 50 throughput, no upgrades
        incomeFloor:         4     ' never earn less than this per tick
        offlineRate:         12    ' credits per minute while away
        offlineFloor:        6

        powerBase:           70    ' idle power equilibrium
        powerPerReactor:     5     ' each Reactor Shielding level
        powerPerBattery:     4     ' each Capacitor Bank level
        powerPerNode:        6     ' each extra node costs this much headroom
        powerMin:            25    ' equilibrium never drops below this

        heatBase:            30    ' idle heat equilibrium
        heatPerCooling:      3     ' each Cryo Manifold level lowers it
        heatMin:             10
        heatDissipation:     4     ' base cooling per tick
        heatCoolPerLevel:    2     ' extra cooling per Cryo level
        heatPanicThreshold:  75    ' above this, fans shed extra heat
        heatPanicBonus:      4

        throughputBase:      45    ' idle throughput equilibrium
        throughputPerBand:   5     ' each Bandwidth Expander level
        throughputStarve:    15    ' below this power, throughput suffers
        throughputPenalty:   3

        healthRegen:         1     ' per tick self-repair
        healthPerArmor:      2     ' armor levels add regen (integer divide)
        healthHeatDamage:    90    ' heat above this damages health
        healthPowerDamage:   5     ' power below this damages health

        eventChance:         22    ' percent per 30s tick
        eventChanceStruggle: 8     ' reduced while in trouble
        settleMinutes:       30.0  ' offline blend fully settles after this
    }
end function

sub init()
    m.tune = tuning()
    m.top.setFocus(true)
    m.top.activeTab = 0
    m.saveVersion = 3
    m.lastSaveTime = invalid
    m.tabCount = 5
    m.incomeTimer = invalid
    m.saveTimer = invalid
    m.saveDirty = false
    m.saveReg = CreateObject("roRegistrySection", "relay0")
    m.lastRulesJson = ""
    m.lastLogsJson = ""
    m.lastUpgradeCountsJson = ""

    print "=== RELAY-0 v1.2 booting ==="

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

    ' Load upgrade purchase counts
    if reg.Exists("upgradeCounts")
        ucJson = reg.Read("upgradeCounts")
        if ucJson <> invalid and ucJson <> ""
            parsed = parseJson(ucJson)
            if parsed <> invalid then m.top.upgradeCounts = parsed
            m.lastUpgradeCountsJson = ucJson
        end if
    end if
    if m.top.upgradeCounts = invalid then m.top.upgradeCounts = {}

    ' Save migration: builds before v3 could leave a save wedged at
    ' power=0 / heat=100 with no recovery path. Rescue those states once.
    if saveVer < 3
        if m.top.power < 30 then m.top.power = 60
        if m.top.heat > 70 then m.top.heat = 30
        if m.top.throughput < 30 then m.top.throughput = 45
        if m.top.networkHealth < 50 then m.top.networkHealth = 80
        m.saveVersion = 3
        print "[loadGame] migrated save to v3 (rebalanced economy)"
    end if

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

    ' Persist upgrade purchase counts
    upgradeCounts = m.top.upgradeCounts
    if upgradeCounts <> invalid
        ucJson = FormatJson(upgradeCounts)
        if ucJson <> m.lastUpgradeCountsJson
            reg.Write("upgradeCounts", ucJson)
            m.lastUpgradeCountsJson = ucJson
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

sub flushSave(dummy = invalid as dynamic)
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
    nodesUnlocked = m.top.nodesUnlocked

    counts = m.top.upgradeCounts
    if counts = invalid then counts = {}
    reactorLvl = 0
    batteryLvl = 0
    coolingLvl = 0
    bandwidthLvl = 0
    if counts.doesExist("reactor") then reactorLvl = counts["reactor"]
    if counts.doesExist("battery") then batteryLvl = counts["battery"]
    if counts.doesExist("cooling") then coolingLvl = counts["cooling"]
    if counts.doesExist("bandwidth") then bandwidthLvl = counts["bandwidth"]

    ' Passive income while away, scaled by throughput and upgrade level
    throughputMult = throughput / 50.0
    upgradeMult = 1.0 + (upgradeLevel * 0.25)
    creditRate = Cint(m.tune.offlineRate * throughputMult * upgradeMult)
    if creditRate < m.tune.offlineFloor then creditRate = m.tune.offlineFloor

    minutesAwayNum = elapsedSeconds / 60.0
    deltaCredits = Cint(creditRate * minutesAwayNum)
    m.top.credits = m.top.credits + deltaCredits
    if m.top.credits < 0 then m.top.credits = 0

    ' While away the relay settles toward its idle equilibrium rather
    ' than draining to zero. Longer absences land closer to the target.
    powerTarget = powerEquilibrium(reactorLvl, batteryLvl, nodesUnlocked)
    heatTarget = heatEquilibrium(coolingLvl)
    throughputTarget = throughputEquilibrium(bandwidthLvl)

    ' Blend current -> target; settleMinutes away is fully settled
    blend = minutesAwayNum / m.tune.settleMinutes
    if blend > 1.0 then blend = 1.0

    m.top.power = clamp(Cint(power + (powerTarget - power) * blend), 0, 100)
    m.top.heat = clamp(Cint(heat + (heatTarget - heat) * blend), 0, 100)
    m.top.throughput = clamp(Cint(throughput + (throughputTarget - throughput) * blend), 0, 100)

    ' Health slowly self-repairs while idle
    healthGain = Cint(minutesAwayNum / 2.0)
    m.top.networkHealth = clamp(m.top.networkHealth + healthGain, 0, 100)

    if elapsedSeconds > 30
        minutesAway = minutesAwayNum.toStr()
        addLog("Resuming after " + minutesAway + " min offline. Earned " + deltaCredits.toStr() + " credits.")
        print "[offline] " + minutesAway + " minutes away, +" + deltaCredits.toStr() + " credits"
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
        CreateObject("roSGNode", "UpgradesTab"),
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
    if m.tabs = invalid then return

    for i = 0 to m.tabs.count() - 1
        m.tabs[i].visible = (i = tabIdx)
    end for
    updateTabHighlight()

    ' Keep the footer ticker in sync whenever the view changes
    updateFooter()

    current = m.tabs[tabIdx]
    if current = invalid then return

    ' Refresh the newly shown tab's contents
    if tabIdx = 0 then current.callFunc("updateUI", invalid)
    if tabIdx = 1 then current.callFunc("onEvent", invalid)
    if tabIdx = 2 then current.callFunc("updateUI", invalid)
    if tabIdx = 3 then current.callFunc("updateUI", invalid)
    if tabIdx = 4 then current.callFunc("refresh", invalid)
end sub

sub updateTabHighlight()
    ' Use cached node references to avoid repeated findNode calls
    if m.tabLabels = invalid
        m.tabLabels = [
            m.top.findNode("tabMonitor"),
            m.top.findNode("tabAuto"),
            m.top.findNode("tabNodes"),
            m.top.findNode("tabUpgrades"),
            m.top.findNode("tabLogs")
        ]
        m.tabUnderlines = [
            m.top.findNode("tabUnderline0"),
            m.top.findNode("tabUnderline1"),
            m.top.findNode("tabUnderline2"),
            m.top.findNode("tabUnderline3"),
            m.top.findNode("tabUnderline4")
        ]
    end if

    dimColor = &h44FF44FF
    dimUnder = &h00FF4140
    activeColor = &hFFFFFFFF

    for i = 0 to m.tabLabels.count() - 1
        if m.tabLabels[i] <> invalid then m.tabLabels[i].color = dimColor
        if m.tabUnderlines[i] <> invalid then m.tabUnderlines[i].color = dimUnder
    end for

    tabIdx = m.top.activeTab
    if tabIdx >= 0 and tabIdx < m.tabLabels.count()
        if m.tabLabels[tabIdx] <> invalid then m.tabLabels[tabIdx].color = activeColor
        if m.tabUnderlines[tabIdx] <> invalid then m.tabUnderlines[tabIdx].color = activeColor
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
    if m.tabs = invalid then return false
    if tabIdx >= 0 and tabIdx < m.tabs.count()
        current = m.tabs[tabIdx]
        if current <> invalid
            handled = current.callFunc("handleKey", key)
            if handled = true then return true
        end if
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
    if m.top.activeTab = 4 and m.tabs <> invalid and m.tabs.count() > 4
        logsTab = m.tabs[4]
        if logsTab <> invalid then logsTab.callFunc("refresh", invalid)
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
    ' Events are occasional flavour, not a constant beating.
    ' Skip entirely while the relay is already struggling so the
    ' player gets room to recover.
    struggling = (m.top.power < 25 or m.top.heat > 80 or m.top.networkHealth < 40)
    chance = m.tune.eventChance
    if struggling then chance = m.tune.eventChanceStruggle
    if rnd(100) <= chance then triggerRandomEvent()

    ' Notify visible tabs
    if m.tabs = invalid then return
    for each tabNode in m.tabs
        if tabNode.visible then tabNode.callFunc("onEvent", invalid)
    end for
    updateFooter()
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
    t = m.tune
    ' Pull m.top values into locals (m scope access is slower).
    throughput = m.top.throughput
    upgradeLevel = m.top.upgradeLevel
    heat = m.top.heat
    power = m.top.power
    nodesUnlocked = m.top.nodesUnlocked
    health = m.top.networkHealth

    counts = m.top.upgradeCounts
    if counts = invalid then counts = {}
    coolingLvl = 0
    reactorLvl = 0
    batteryLvl = 0
    bandwidthLvl = 0
    armorLvl = 0
    if counts.doesExist("cooling") then coolingLvl = counts["cooling"]
    if counts.doesExist("reactor") then reactorLvl = counts["reactor"]
    if counts.doesExist("battery") then batteryLvl = counts["battery"]
    if counts.doesExist("bandwidth") then bandwidthLvl = counts["bandwidth"]
    if counts.doesExist("armor") then armorLvl = counts["armor"]

    ' ---- Income ----
    throughputMult = throughput / 50.0
    upgradeMult = 1.0 + (upgradeLevel * 0.25)
    earned = Cint(t.incomeBase * throughputMult * upgradeMult)
    if earned < t.incomeFloor then earned = t.incomeFloor

    ' ---- POWER: homeostasis toward a sustainable target ----
    powerTarget = powerEquilibrium(reactorLvl, batteryLvl, nodesUnlocked)
    if power < powerTarget
        powerDelta = Cint((powerTarget - power) / 4.0) + 2
    else
        powerDelta = -1
    end if

    ' ---- HEAT: passive dissipation vs throughput load ----
    heatLoad = Cint(throughput / 20.0) + Cint(nodesUnlocked / 2)
    heatDissipation = t.heatDissipation + (coolingLvl * t.heatCoolPerLevel)
    heatDelta = heatLoad - heatDissipation
    if heat > t.heatPanicThreshold then heatDelta = heatDelta - t.heatPanicBonus

    ' ---- THROUGHPUT: recovers toward a baseline after events ----
    throughputTarget = throughputEquilibrium(bandwidthLvl)
    if throughput < throughputTarget
        throughputDelta = Cint((throughputTarget - throughput) / 5.0) + 1
    else
        throughputDelta = 0
    end if
    if power < t.throughputStarve then throughputDelta = throughputDelta - t.throughputPenalty

    ' ---- HEALTH: slow self-repair, damage only at true extremes ----
    healthDelta = t.healthRegen + Cint(armorLvl / t.healthPerArmor)
    if heat > t.healthHeatDamage then healthDelta = -2
    if power < t.healthPowerDamage then healthDelta = healthDelta - 1
    if health >= 100 then healthDelta = 0

    applyResourceChanges(powerDelta, heatDelta, throughputDelta, earned, healthDelta)

    ' Refresh whichever tab is currently visible so live values update
    refreshActiveTab()
end sub

' ---- Equilibrium helpers (shared by live ticks and offline sim) ----
function powerEquilibrium(reactorLvl, batteryLvl, nodesUnlocked) as integer
    t = m.tune
    v = t.powerBase + (reactorLvl * t.powerPerReactor) + (batteryLvl * t.powerPerBattery) - (nodesUnlocked * t.powerPerNode)
    if v < t.powerMin then v = t.powerMin
    if v > 100 then v = 100
    return v
end function

function heatEquilibrium(coolingLvl) as integer
    t = m.tune
    v = t.heatBase - (coolingLvl * t.heatPerCooling)
    if v < t.heatMin then v = t.heatMin
    return v
end function

function throughputEquilibrium(bandwidthLvl) as integer
    t = m.tune
    v = t.throughputBase + (bandwidthLvl * t.throughputPerBand)
    if v > 100 then v = 100
    return v
end function

' Refresh the currently visible tab plus the footer ticker
sub refreshActiveTab()
    updateFooter()
    if m.tabs = invalid then return
    tabIdx = m.top.activeTab
    if tabIdx < 0 or tabIdx >= m.tabs.count() then return
    current = m.tabs[tabIdx]
    if current = invalid then return
    if tabIdx = 4
        current.callFunc("refresh", invalid)
    else
        current.callFunc("onEvent", invalid)
    end if
end sub

' ----- Random Events (12 types) -----
' Tuned so positives outnumber negatives and negatives sting without
' triggering a death spiral. Armor upgrades further blunt the damage.
sub triggerRandomEvent()
    eventType = rnd(12)
    msg = ""
    deltaP = 0 : deltaH = 0 : deltaT = 0 : deltaC = 0 : deltaHp = 0

    if eventType = 1
        msg = "!! INTRUSION DETECTED - Unauthorized access. Throughput -8, Credits -5."
        deltaT = -8 : deltaC = -5 : deltaHp = -2
    else if eventType = 2
        msg = ">> THERMAL SPIKE - Cooling strained. Heat +10, Power -4."
        deltaH = 10 : deltaP = -4
    else if eventType = 3
        msg = ">> PACKET STORM - Data surge. Throughput +25, Heat +8."
        deltaT = 25 : deltaH = 8
    else if eventType = 4
        msg = "** EFFICIENCY BOOST - Optimized routing. Credits +40."
        deltaC = 40
    else if eventType = 5
        msg = "~~ GHOST SIGNAL - Unknown node whispering. Heat -10, Credits +15."
        deltaH = -10 : deltaC = 15
    else if eventType = 6
        msg = "** POWER SURGE - Grid feedback. Power +25, Heat +6."
        deltaP = 25 : deltaH = 6
    else if eventType = 7
        msg = "!! DATA CORRUPTION - Memory damaged. Throughput -10, Health -4."
        deltaT = -10 : deltaHp = -4
    else if eventType = 8
        msg = "++ FIRMWARE UPDATE - Patch applied. Health +15, Throughput +5."
        deltaHp = 15 : deltaT = 5
    else if eventType = 9
        msg = "!! SOLAR FLARE - EM interference. Systems disrupted."
        deltaP = -6 : deltaH = 12 : deltaT = -5 : deltaHp = -3
    else if eventType = 10
        msg = "$$ CONTRACT FULFILLED - Payment received. Credits +70."
        deltaC = 70
    else if eventType = 11
        msg = "++ COOLING CACHE - Coolant reserves found. Heat -25."
        deltaH = -25
    else
        msg = "~~ SYSTEM GLITCH - Minor anomaly. Power +8, Heat -5."
        deltaP = 8 : deltaH = -5
    end if

    ' Network Hardening blunts incoming damage
    counts = m.top.upgradeCounts
    if counts <> invalid and counts.doesExist("armor")
        armorLvl = counts["armor"]
        if deltaHp < 0
            deltaHp = deltaHp + armorLvl
            if deltaHp > 0 then deltaHp = 0
        end if
        if deltaT < 0
            deltaT = deltaT + armorLvl
            if deltaT > 0 then deltaT = 0
        end if
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
