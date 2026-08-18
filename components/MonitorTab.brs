' ============================================================
' RELAY-0 - MonitorTab.brs  (Dashboard Display)
' ============================================================

sub init()
    m.top.setFocus(true)
    updateUI()
end sub

sub setParentScene(parent)
    m.parentScene = parent
end sub

sub updateUI()
    if m.parentScene = invalid then return

    power = m.parentScene.power
    heat = m.parentScene.heat
    throughput = m.parentScene.throughput
    health = m.parentScene.networkHealth
    credits = m.parentScene.credits
    upgradeLevel = m.parentScene.upgradeLevel
    nodesCount = m.parentScene.nodesUnlocked

    ' --- Power Bar ---
    m.top.findNode("powerBarFill").width = 500 * power / 100
    m.top.findNode("powerValue").text = power.toStr() + "/100"
    if power < 15
        m.top.findNode("powerBarFill").color = "#FF2222"
        m.top.findNode("powerValue").color = "#FF2222FF"
    else if power < 40
        m.top.findNode("powerBarFill").color = "#FFAA22"
        m.top.findNode("powerValue").color = "#FFAA22FF"
    else
        m.top.findNode("powerBarFill").color = "#00CC33"
        m.top.findNode("powerValue").color = "#00CC33FF"
    end if

    ' --- Heat Bar ---
    m.top.findNode("heatBarFill").width = 500 * heat / 100
    m.top.findNode("heatValue").text = heat.toStr() + "/100"
    if heat > 80
        m.top.findNode("heatBarFill").color = "#FF2222"
        m.top.findNode("heatValue").color = "#FF2222FF"
    else if heat > 55
        m.top.findNode("heatBarFill").color = "#FF8844"
        m.top.findNode("heatValue").color = "#FF8844FF"
    else
        m.top.findNode("heatBarFill").color = "#FF6644"
        m.top.findNode("heatValue").color = "#FF6644FF"
    end if

    ' --- Throughput Bar ---
    m.top.findNode("throughputBarFill").width = 440 * throughput / 100
    m.top.findNode("throughputValue").text = throughput.toStr() + "/100"
    if throughput < 20
        m.top.findNode("throughputBarFill").color = "#FF4444"
        m.top.findNode("throughputValue").color = "#FF4444FF"
    else if throughput < 50
        m.top.findNode("throughputBarFill").color = "#4488FF"
        m.top.findNode("throughputValue").color = "#4488FFFF"
    else
        m.top.findNode("throughputBarFill").color = "#44AAFF"
        m.top.findNode("throughputValue").color = "#44AAFFFF"
    end if

    ' --- Network Health Bar ---
    m.top.findNode("healthBarFill").width = 460 * health / 100
    m.top.findNode("healthValue").text = health.toStr() + "%"
    if health < 30
        m.top.findNode("healthBarFill").color = "#FF2222"
        m.top.findNode("healthValue").color = "#FF2222FF"
    else if health < 60
        m.top.findNode("healthBarFill").color = "#FFAA22"
        m.top.findNode("healthValue").color = "#FFAA22FF"
    else
        m.top.findNode("healthBarFill").color = "#00FF88"
        m.top.findNode("healthValue").color = "#00FF88FF"
    end if

    ' --- Credits ---
    m.top.findNode("creditsLabel").text = credits.toStr()

    ' --- Income Rate (calculated) ---
    throughputMult = throughput / 50.0
    upgradeMult = 1.0 + (upgradeLevel * 0.25)
    incomeRate = Cint(10 * throughputMult * upgradeMult)
    if incomeRate < 1 then incomeRate = 1
    m.top.findNode("incomeLabel").text = "Income: ~" + incomeRate.toStr() + " credits/min"

    ' --- Upgrade & Nodes ---
    m.top.findNode("upgradeLabel").text = "Upgrade Level: " + upgradeLevel.toStr() + " (mult x" + formatFloat(upgradeMult, 2) + ")"
    m.top.findNode("nodesLabel").text = "Active Nodes: " + nodesCount.toStr() + " / 3"

    ' --- Warnings ---
    warnings = ""
    if heat > 85 then warnings = warnings + "[CRITICAL] Heat overload! Systems taking damage." + chr(10)
    if heat > 65 then warnings = warnings + "[WARNING] Temperature elevated. Consider cooling." + chr(10)
    if power < 10 then warnings = warnings + "[CRITICAL] Power failure! Throughput degrading." + chr(10)
    if power < 30 then warnings = warnings + "[WARNING] Power reserves low." + chr(10)
    if health < 30 then warnings = warnings + "[CRITICAL] Network health critical!" + chr(10)
    if health < 60 then warnings = warnings + "[WARNING] Network integrity compromised." + chr(10)
    if throughput < 20 then warnings = warnings + "[INFO] Throughput very low. Income reduced." + chr(10)
    if warnings = "" then warnings = "All systems nominal."

    m.top.findNode("warningText").text = warnings
    if heat > 85 or power < 10 or health < 30
        m.top.findNode("warningText").color = "#FF4444FF"
        m.top.findNode("warningTitle").color = "#FF4444FF"
    else if heat > 65 or power < 30 or health < 60
        m.top.findNode("warningText").color = "#FFAA44FF"
        m.top.findNode("warningTitle").color = "#FFAA44FF"
    else
        m.top.findNode("warningText").color = "#88FF88FF"
        m.top.findNode("warningTitle").color = "#00FF41FF"
    end if

    ' --- Stats Panel ---
    ruleCount = 0
    logCount = 0
    if m.parentScene.rules <> invalid then ruleCount = m.parentScene.rules.count()
    if m.parentScene.logEntries <> invalid then logCount = m.parentScene.logEntries.count()
    m.top.findNode("statsText").text = "Active Rules: " + ruleCount.toStr() + chr(10) + "Log Entries: " + logCount.toStr()
end sub

function onEvent()
    updateUI()
    return invalid
end function

function handleKey(key as string) as boolean
    return false
end function

' Helper for formatting floats
function formatFloat(val, decimals) as string
    s = val.toStr()
    dot = s.instr(".")
    if dot = -1 then return s + ".00"
    whole = s.left(dot)
    frac = s.mid(dot + 1)
    while frac.len() < decimals
        frac = frac + "0"
    end while
    if frac.len() > decimals then frac = frac.left(decimals)
    return whole + "." + frac
end function
