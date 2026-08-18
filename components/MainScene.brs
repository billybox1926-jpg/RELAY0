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
    m.saveVersion = SAVE_SCHEMA_VERSION()
    m.lastSaveTime = invalid
    m.tabCount = 5
    m.incomeTimer = invalid
    m.saveTimer = invalid
    m.saveDirty = false
    m.saveReg = CreateObject("roRegistrySection", "relay0")
    m.lastRulesJson = ""
    m.lastLogsJson = ""
    m.lastUpgradeCountsJson = ""
    m.creditRemainder = 0.0
    m.lastRulesFired = 0

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

' ============================================================
' Save schema (registry section "relay0")
' ============================================================
' Key              Format                          Notes
' ---------------  ------------------------------  ----------------------
' saveVersion      integer as string               current: SAVE_SCHEMA_VERSION
' saveData         "k=v,k=v,..." scalar pairs      credits, power, heat,
'                                                  throughput, nodes,
'                                                  lastTime, upgrade,
'                                                  health, remainder
' rules            JSON array of objects           {condition, action, target}
' logs             JSON array of strings           newest first, max 100
' upgradeCounts    JSON object of string->integer  purchase counts per key
'
' Migration policy
' ----------------
'   * Every load runs through sanitise + migrate before values reach
'     m.top, so a malformed or hostile registry can never enter live state.
'   * Migrations are keyed on the stored saveVersion, applied in ascending
'     order, and are IDEMPOTENT: re-running a migration on already-migrated
'     data is a no-op.
'   * Unknown//future saveVersion values are treated as current rather than
'     discarded, so a downgrade does not wipe a player's progress.
'   * Any single field that fails validation falls back to its documented
'     default; the rest of the save still loads. A wholly unreadable save
'     falls back to a complete known-good default state.
' ============================================================

function SAVE_SCHEMA_VERSION() as integer
    return 4
end function

' Documented defaults, also the recovery state for an unreadable save.
function defaultSaveState() as object
    return {
        credits: 100
        power: 80
        heat: 25
        throughput: 40
        nodes: 1
        upgrade: 0
        health: 100
        remainder: 0.0
        lastTime: invalid
    }
end function

' Coerce to an integer within [lo, hi]. Returns fallback when the value is
' missing, non-numeric, or otherwise unusable.
function safeInt(raw as dynamic, lo as integer, hi as integer, fallback as integer) as integer
    if raw = invalid then return fallback

    t = type(raw)
    if isStr(raw)
        s = raw.trim()
        if s = "" then return fallback
        ' Reject anything that is not an optional sign followed by digits.
        if not isNumericString(s) then return fallback
        v = s.toInt()
    else if t = "roInt" or t = "Integer" or t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" or t = "LongInteger"
        v = Int(raw)
    else
        return fallback
    end if

    if v < lo then return lo
    if v > hi then return hi
    return v
end function

' Coerce to a float within [lo, hi). Used for the credit remainder.
' The upper bound is EXCLUSIVE: an out-of-range value wraps to lo rather
' than clamping to hi, since hi itself is not a legal value.
function safeFloat(raw as dynamic, lo as float, hi as float, fallback as float) as float
    if raw = invalid then return fallback
    t = type(raw)
    if isStr(raw)
        s = raw.trim()
        if s = "" then return fallback
        v = s.toFloat()
        ' toFloat() yields 0 for garbage; only trust it if it looks numeric.
        if v = 0.0 and not isFloatString(s) then return fallback
    else if t = "roFloat" or t = "Float" or t = "Double" or t = "roDouble" or t = "roInt" or t = "Integer"
        v = raw
    else
        return fallback
    end if
    if v < lo then return lo
    if v >= hi then return lo
    return v
end function

' BrightScript reports strings as either "String" (intrinsic) or "roString"
' (boxed) depending on origin. roRegistrySection.Read() returns the former,
' parseJson() members the latter, so every string check must accept both.
function isStr(v as dynamic) as boolean
    if v = invalid then return false
    t = type(v)
    return (t = "String" or t = "roString")
end function

' Explicit key lookup for a dynamically-populated assoc array. Returns
' invalid when the key is absent, so callers can distinguish "missing"
' from "present but empty".
function mapGet(m_ as object, key as string) as dynamic
    if m_ = invalid then return invalid
    if not m_.doesExist(key) then return invalid
    return m_[key]
end function

function isNumericString(s as string) as boolean
    if s = "" then return false
    start = 0
    if s.mid(0, 1) = "-" or s.mid(0, 1) = "+"
        if s.len() = 1 then return false
        start = 1
    end if
    for i = start to s.len() - 1
        c = s.mid(i, 1)
        if c < "0" or c > "9" then return false
    end for
    return true
end function

function isFloatString(s as string) as boolean
    if s = "" then return false
    seenDot = false
    seenDigit = false
    start = 0
    if s.mid(0, 1) = "-" or s.mid(0, 1) = "+"
        if s.len() = 1 then return false
        start = 1
    end if
    for i = start to s.len() - 1
        c = s.mid(i, 1)
        if c = "."
            if seenDot then return false
            seenDot = true
        else if c >= "0" and c <= "9"
            seenDigit = true
        else
            return false
        end if
    end for
    return seenDigit
end function

' ----- Save / Load (Cached Registry, Debounced) -----
sub loadGame()
    reg = m.saveReg
    defaults = defaultSaveState()

    ' ---- Read the stored schema version ----
    ' A missing version means a pre-versioning save (treated as v1). A
    ' garbage version is treated as v1 so migrations get a chance to run.
    storedVer = 1
    if reg.Exists("saveVersion")
        storedVer = safeInt(reg.Read("saveVersion"), 1, 9999, 1)
    end if

    ' ---- Parse scalar pairs into a plain map first ----
    ' Nothing touches m.top until every value has been validated.
    raw = {}
    if reg.Exists("saveData")
        data = reg.Read("saveData")
        if isStr(data) and data <> ""
            for each p in data.split(",")
                kv = p.split("=")
                if kv.count() = 2
                    key = kv[0].trim()
                    if key <> "" then raw[key] = kv[1].trim()
                end if
            end for
        end if
    end if

    ' ---- Validate and clamp every scalar ----
    ' Use explicit lookup helpers: dot access on a dynamically-populated
    ' roAssociativeArray does not reliably resolve keys inserted via raw[key].
    credits = safeInt(mapGet(raw, "credits"), 0, 2000000000, defaults.credits)
    power = safeInt(mapGet(raw, "power"), 0, 100, defaults.power)
    heat = safeInt(mapGet(raw, "heat"), 0, 100, defaults.heat)
    throughput = safeInt(mapGet(raw, "throughput"), 0, 100, defaults.throughput)
    nodes = safeInt(mapGet(raw, "nodes"), 1, 5, defaults.nodes)
    upgrade = safeInt(mapGet(raw, "upgrade"), 0, 999, defaults.upgrade)
    health = safeInt(mapGet(raw, "health"), 0, 100, defaults.health)
    remainder = safeFloat(mapGet(raw, "remainder"), 0.0, 1.0, defaults.remainder)

    ' lastTime: 0 or absent means "unknown", handled after migration.
    lastTime = invalid
    ltRaw = mapGet(raw, "lastTime")
    if ltRaw <> invalid
        lt = safeInt(ltRaw, 0, 2147483647, 0)
        if lt > 0 then lastTime = lt
    end if

    ' ---- Load and validate collections ----
    rules = loadRules(reg)
    logEntries = loadLogs(reg)
    upgradeCounts = loadUpgradeCounts(reg)

    ' ---- Build a candidate state, migrate it, then commit ----
    state = {
        credits: credits
        power: power
        heat: heat
        throughput: throughput
        nodes: nodes
        upgrade: upgrade
        health: health
        remainder: remainder
        lastTime: lastTime
    }
    migrateSave(state, storedVer)

    m.top.credits = state.credits
    m.top.power = state.power
    m.top.heat = state.heat
    m.top.throughput = state.throughput
    m.top.nodesUnlocked = state.nodes
    m.top.upgradeLevel = state.upgrade
    m.top.networkHealth = state.health
    m.top.rules = rules
    m.top.logEntries = logEntries
    m.top.upgradeCounts = upgradeCounts
    m.creditRemainder = state.remainder

    if state.lastTime = invalid
        m.lastSaveTime = getCurrentEpoch()
    else
        m.lastSaveTime = state.lastTime
    end if

    ' Always store forward at the current schema version.
    m.saveVersion = SAVE_SCHEMA_VERSION()

    print "[loadGame] v" + storedVer.toStr() + "->v" + m.saveVersion.toStr() + " credits=" + state.credits.toStr() + " power=" + state.power.toStr() + " heat=" + state.heat.toStr()
end sub

' Apply migrations in ascending order. Each step must be idempotent.
sub migrateSave(state as object, fromVer as integer)
    if fromVer >= SAVE_SCHEMA_VERSION() then return

    ' v1/v2 -> v3: early builds drained power to 0 and pinned heat at 100
    ' with no recovery path. Rescue a wedged economy exactly once.
    if fromVer < 3
        if state.power < 30 then state.power = 60
        if state.heat > 70 then state.heat = 30
        if state.throughput < 30 then state.throughput = 45
        if state.health < 50 then state.health = 80
        print "[migrate] v" + fromVer.toStr() + " -> v3 (rebalanced economy)"
    end if

    ' v3 -> v4: the credit remainder was introduced. Absent means 0, which
    ' safeFloat() already supplied, so this step only records the bump.
    if fromVer < 4
        print "[migrate] v" + fromVer.toStr() + " -> v4 (idle remainder tracking)"
    end if
end sub

' Rules must be an array of {condition, action, target} with string members.
' Anything else is dropped rather than allowed to crash the Automation tab.
function loadRules(reg as object) as object
    if not reg.Exists("rules") then return []
    json = reg.Read("rules")
    if not isStr(json) or json = "" then return []

    parsed = parseJson(json)
    if parsed = invalid then
        print "[loadGame] rules JSON unparseable; starting with none"
        return []
    end if
    if type(parsed) <> "roArray"
        print "[loadGame] rules was not an array; starting with none"
        return []
    end if

    clean = []
    dropped = 0
    for each r in parsed
        if type(r) = "roAssociativeArray" and r.doesExist("condition") and r.doesExist("action")
            cond = r.condition
            act = r.action
            if isStr(cond) and isStr(act) and cond <> "" and act <> ""
                target = "self"
                if r.doesExist("target") and isStr(r.target) and r.target <> "" then target = r.target
                clean.push({ condition: cond, action: act, target: target })
            else
                dropped = dropped + 1
            end if
        else
            dropped = dropped + 1
        end if
        if clean.count() >= 10 then exit for
    end for
    if dropped > 0 then print "[loadGame] dropped " + dropped.toStr() + " malformed rule(s)"
    return clean
end function

' Logs must be an array of non-empty strings, newest first, capped at 100.
function loadLogs(reg as object) as object
    if not reg.Exists("logs") then return []
    json = reg.Read("logs")
    if not isStr(json) or json = "" then return []

    parsed = parseJson(json)
    if parsed = invalid or type(parsed) <> "roArray"
        print "[loadGame] logs unreadable; starting empty"
        return []
    end if

    clean = []
    for each entry in parsed
        if isStr(entry) and entry <> ""
            clean.push(entry)
        else if type(entry) = "roInt" or type(entry) = "Integer"
            clean.push(entry.toStr())
        end if
        if clean.count() >= 100 then exit for
    end for
    return clean
end function

' Upgrade counts must map known upgrade keys to non-negative integers.
function loadUpgradeCounts(reg as object) as object
    if not reg.Exists("upgradeCounts") then return {}
    json = reg.Read("upgradeCounts")
    if not isStr(json) or json = "" then return {}

    parsed = parseJson(json)
    if parsed = invalid or type(parsed) <> "roAssociativeArray"
        print "[loadGame] upgradeCounts unreadable; starting empty"
        return {}
    end if

    clean = {}
    for each key in parsed
        v = safeInt(parsed[key], 0, 999, -1)
        if v >= 0 then clean[key] = v
    end for
    return clean
end function

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
    data = data + ",lastTime=" + Int(getCurrentEpoch()).toStr()
    data = data + ",upgrade=" + upgrade.toStr()
    data = data + ",health=" + health.toStr()
    data = data + ",remainder=" + m.creditRemainder.toStr()

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

' Wall-clock seconds since the Unix epoch. AsSecondsLong() is used rather
' than AsSeconds() because the latter is a 32-bit integer, and integer time
' math can overflow / lose precision. Falls back where unavailable.
function getCurrentEpoch() as double
    dt = CreateObject("roDateTime")
    secs = dt.AsSecondsLong()
    if secs = invalid then secs = dt.AsSeconds()
    return secs
end function

' ----- Offline Simulation -----
' Idle rates are documented in the README. Rounding policy:
'   - Credits accrue fractionally and the remainder is CARRIED in
'     m.creditRemainder, so short absences are never silently lost.
'   - Resource levels blend toward equilibrium and are rounded to the
'     nearest integer (the fields are integer-typed).
'   - Elapsed time is clamped to a sane range so a clock change cannot
'     corrupt the save.
sub simulateWhileAway()
    t = m.tune
    now = getCurrentEpoch()

    if m.lastSaveTime = invalid then m.lastSaveTime = now
    elapsedSeconds = now - m.lastSaveTime

    ' --- Clock anomaly guards ---
    ' Clock moved backwards (timezone/NTP correction, or a restored save from
    ' a device with a skewed clock): award nothing, just resynchronise.
    if elapsedSeconds < 0
        print "[offline] clock moved backwards by " + Int(-elapsedSeconds).toStr() + "s; resyncing without credit"
        m.lastSaveTime = now
        flushSave()
        return
    end if

    ' Absurd gaps (uninitialised clock, epoch glitch) are capped so a single
    ' bad reading cannot hand out a fortune. 7 days of idle is the ceiling.
    maxElapsed = 7.0 * 24.0 * 3600.0
    if elapsedSeconds > maxElapsed
        print "[offline] elapsed " + Int(elapsedSeconds).toStr() + "s exceeds cap; clamping to 7 days"
        elapsedSeconds = maxElapsed
    end if

    m.lastSaveTime = now

    ' Sub-second / trivial gaps: nothing to simulate, but keep the remainder.
    if elapsedSeconds < 1 then return

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

    ' --- Credits: fractional accrual with carried remainder ---
    throughputMult = throughput / 50.0
    upgradeMult = 1.0 + (upgradeLevel * 0.25)
    creditRate = t.offlineRate * throughputMult * upgradeMult
    if creditRate < t.offlineFloor then creditRate = t.offlineFloor

    minutesAwayNum = elapsedSeconds / 60.0

    carried = m.creditRemainder
    if carried = invalid then carried = 0.0
    earnedExact = (creditRate * minutesAwayNum) + carried
    deltaCredits = Int(earnedExact)                  ' floor, never over-award
    m.creditRemainder = earnedExact - deltaCredits   ' keep the fraction

    m.top.credits = m.top.credits + deltaCredits
    if m.top.credits < 0 then m.top.credits = 0

    ' --- Resource levels: blend toward equilibrium, round to nearest ---
    powerTarget = powerEquilibrium(reactorLvl, batteryLvl, nodesUnlocked)
    heatTarget = heatEquilibrium(coolingLvl)
    throughputTarget = throughputEquilibrium(bandwidthLvl)

    blend = minutesAwayNum / t.settleMinutes
    if blend > 1.0 then blend = 1.0

    m.top.power = clamp(roundHalfUp(power + (powerTarget - power) * blend), 0, 100)
    m.top.heat = clamp(roundHalfUp(heat + (heatTarget - heat) * blend), 0, 100)
    m.top.throughput = clamp(roundHalfUp(throughput + (throughputTarget - throughput) * blend), 0, 100)

    ' Health slowly self-repairs while idle (floored, so it never over-heals)
    healthGain = Int(minutesAwayNum / 2.0)
    m.top.networkHealth = clamp(m.top.networkHealth + healthGain, 0, 100)

    if elapsedSeconds > 30
        minutesAway = formatMinutes(minutesAwayNum)
        addLog("Resuming after " + minutesAway + " min offline. Earned " + deltaCredits.toStr() + " credits.")
        print "[offline] " + minutesAway + " min away, +" + deltaCredits.toStr() + " credits (carry " + m.creditRemainder.toStr() + ")"
    end if
    flushSave()
end sub

' Round half away from zero. Int() truncates toward zero in BrightScript,
' so a plain Int() on a blended value biases resources downward over time.
function roundHalfUp(v as double) as integer
    if v >= 0 then return Int(v + 0.5)
    return -Int(-v + 0.5)
end function

' Two-decimal minutes for log readability.
function formatMinutes(mins as double) as string
    whole = Int(mins)
    frac = Int((mins - whole) * 100 + 0.5)
    fracStr = frac.toStr()
    if frac < 10 then fracStr = "0" + fracStr
    return whole.toStr() + "." + fracStr
end function

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
' THE single state-update path. Every resource mutation must go through
' here (or through applyResourceChangesQuiet + refreshActiveTab for batches)
' so the footer and the visible tab can never drift out of sync.
sub applyResourceChanges(deltaPower, deltaHeat, deltaThroughput, deltaCredits, deltaHealth)
    applyResourceChangesQuiet(deltaPower, deltaHeat, deltaThroughput, deltaCredits, deltaHealth)
    refreshActiveTab()
end sub

' Mutate resources without refreshing the UI. Only for callers that apply
' several changes in a row and then refresh once themselves (processRules).
sub applyResourceChangesQuiet(deltaPower, deltaHeat, deltaThroughput, deltaCredits, deltaHealth)
    if deltaHealth = invalid then deltaHealth = 0
    m.top.power = clamp(m.top.power + deltaPower, 0, 100)
    m.top.heat = clamp(m.top.heat + deltaHeat, 0, 100)
    m.top.throughput = clamp(m.top.throughput + deltaThroughput, 0, 100)
    m.top.networkHealth = clamp(m.top.networkHealth + deltaHealth, 0, 100)
    m.top.credits = m.top.credits + deltaCredits
    if m.top.credits < 0 then m.top.credits = 0
    ' Debounced save; callers needing an immediate write use flushSave()
    markDirty()
end sub

' ----- Automation Rule Engine (Expanded) -----
sub processRules()
    m.lastRulesFired = 0
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
            ' Quiet variant: batch all firing rules, then refresh once below
            if action = "boost_power" then applyResourceChangesQuiet(12, 0, 0, 0, 0)
            if action = "reduce_heat" then applyResourceChangesQuiet(0, -18, 0, 0, 0)
            if action = "earn_credits" then applyResourceChangesQuiet(0, 0, 0, 30, 0)
            if action = "repair_health" then applyResourceChangesQuiet(0, 0, 0, 0, 15)
            if action = "boost_throughput" then applyResourceChangesQuiet(0, 5, 15, 0, 0)
            if action = "emergency_cool" then applyResourceChangesQuiet(5, -30, -10, -15, 5)
            addLog("Rule fired: " + condition + " -> " + action)
            rulesFired = rulesFired + 1
            ' Refresh locals after the mutation so later rules see new values
            currentPower = m.top.power
            currentHeat = m.top.heat
            currentThroughput = m.top.throughput
            currentHealth = m.top.networkHealth
        end if
    end for
    m.lastRulesFired = rulesFired
    if rulesFired > 0
        print "[rules] " + rulesFired.toStr() + " rule(s) fired"
        ' Single refresh for the whole batch, so Monitor and the footer
        ' reflect rule activity immediately rather than on the next tick.
        refreshActiveTab()
    end if
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
    fired = false
    if rnd(100) <= chance
        triggerRandomEvent()
        fired = true
    end if

    ' processRules() and triggerRandomEvent() each refresh when they change
    ' something, so only refresh here if neither of them did (keeps the
    ' footer honest on quiet ticks without double work).
    if not fired and m.lastRulesFired = 0 then refreshActiveTab()
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

    ' applyResourceChanges() refreshes the footer and visible tab itself.
    applyResourceChanges(powerDelta, heatDelta, throughputDelta, earned, healthDelta)
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
sub refreshActiveTab(dummy = invalid as dynamic)
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

    ' Apply the mutation BEFORE logging so the Logs tab (and any refresh
    ' triggered by addLog) observes post-event values, not stale ones.
    print "[event] " + msg
    applyResourceChangesQuiet(deltaP, deltaH, deltaT, deltaC, deltaHp)
    addLog(msg)
    refreshActiveTab()
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
