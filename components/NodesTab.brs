' ============================================================
' RELAY-0 - NodesTab.brs  (Node Management)
' ============================================================
' Upgraded: Dialog-based action selection, 5 actions,
' expand to 5 nodes, upgrade system, network repair,
' fixed node count edge cases
' ============================================================

sub init()
    m.top.setFocus(true)
    m.selectedNode = 0
    updateUI()
end sub

sub setParentScene(parent)
    m.parentScene = parent
end sub

sub updateUI(dummy = invalid as dynamic)
    if m.parentScene = invalid then return
    nodeCount = m.parentScene.nodesUnlocked
    if nodeCount < 1 then nodeCount = 1

    ' Navigation info
    if nodeCount <= 1
        m.top.findNode("nodeNav").text = "Only primary node available."
    else
        m.top.findNode("nodeNav").text = "UP/DOWN: Browse Nodes (0-" + (nodeCount - 1).toStr() + ")  |  OK: Actions"
    end if

    ' Node info
    if m.selectedNode = 0
        m.top.findNode("nodeInfo").text = "Primary Node [0]  -  Core Relay Hub"
        m.top.findNode("nodeName").text = "NODE 0 - Primary Relay Hub"
        m.top.findNode("nodeStatus").text = "Status: ONLINE  |  All systems operational"
        m.top.findNode("nodeStatus").color = "#88FF88FF"

        ' Node stats
        stats = "Credits: " + m.parentScene.credits.toStr() + "  |  "
        stats = stats + "Power: " + m.parentScene.power.toStr() + "  |  "
        stats = stats + "Heat: " + m.parentScene.heat.toStr() + "  |  "
        stats = stats + "Throughput: " + m.parentScene.throughput.toStr() + "  |  "
        stats = stats + "Health: " + m.parentScene.networkHealth.toStr() + "%  |  "
        stats = stats + "Upgrade Lvl: " + m.parentScene.upgradeLevel.toStr()
        m.top.findNode("nodeStats").text = stats

        ' Show all actions for primary node
        m.top.findNode("action1").visible = true
        m.top.findNode("action2").visible = true
        m.top.findNode("action3").visible = true
        m.top.findNode("action4").visible = true
        m.top.findNode("action5").visible = true
        m.top.findNode("actionsTitle").visible = true
    else if m.selectedNode < nodeCount
        m.top.findNode("nodeInfo").text = "Relay Node [" + m.selectedNode.toStr() + "]  -  Satellite"
        m.top.findNode("nodeName").text = "NODE " + m.selectedNode.toStr() + " - Relay Satellite"
        m.top.findNode("nodeStatus").text = "Status: STANDBY  |  Awaiting expansion"
        m.top.findNode("nodeStatus").color = "#FFAA44FF"
        m.top.findNode("nodeStats").text = "This node is operational but has limited functions."
        m.top.findNode("action1").visible = true
        m.top.findNode("action2").visible = true
        m.top.findNode("action3").visible = false
        m.top.findNode("action4").visible = false
        m.top.findNode("action5").visible = true
        m.top.findNode("actionsTitle").visible = true
    else
        m.top.findNode("nodeInfo").text = "Node [" + m.selectedNode.toStr() + "]  -  LOCKED"
        m.top.findNode("nodeName").text = "NODE " + m.selectedNode.toStr() + " - LOCKED"
        m.top.findNode("nodeStatus").text = "Status: OFFLINE  |  Expand your network to unlock"
        m.top.findNode("nodeStatus").color = "#FF4444FF"
        m.top.findNode("nodeStats").text = "This node is not yet unlocked. Use EXPAND action on primary node."
        m.top.findNode("action1").visible = false
        m.top.findNode("action2").visible = false
        m.top.findNode("action3").visible = false
        m.top.findNode("action4").visible = false
        m.top.findNode("action5").visible = false
        m.top.findNode("actionsTitle").visible = false
    end if
end sub

function handleKey(key as string) as boolean
    if m.parentScene = invalid then return false
    nodeCount = m.parentScene.nodesUnlocked
    if nodeCount < 1 then nodeCount = 1

    if key = "up"
        if m.selectedNode > 0 then m.selectedNode = m.selectedNode - 1
        updateUI()
        return true
    else if key = "down"
        ' Allow browsing up to nodeCount + 1 (to show "locked" state)
        maxBrowse = nodeCount + 1
        if maxBrowse > 5 then maxBrowse = 5
        if m.selectedNode < maxBrowse then m.selectedNode = m.selectedNode + 1
        updateUI()
        return true
    else if key = "OK"
        showActionDialog()
        return true
    end if
    return false
end function

sub showActionDialog()
    if m.parentScene = invalid then return
    nodeCount = m.parentScene.nodesUnlocked

    ' Build button list based on what's available
    buttons = []
    isPrimary = (m.selectedNode = 0)
    isUnlocked = (m.selectedNode < nodeCount)

    if isUnlocked
        buttons.push("Overclock (30 cr)")
        buttons.push("Repair (20 cr)")
    end if
    if isPrimary
        if nodeCount < 5 then buttons.push("Expand Node (500 cr)")
        buttons.push("Upgrade Level (200 cr)")
    end if
    if isUnlocked
        buttons.push("Restore Health (150 cr)")
    end if
    buttons.push("Cancel")

    if buttons.count() <= 1 then return

    dialog = CreateObject("roSGNode", "Dialog")
    dialog.title = "NODE " + m.selectedNode.toStr() + " - ACTIONS"
    dialog.optionsDialog = true
    dialog.message = "Current credits: " + m.parentScene.credits.toStr()
    dialog.buttons = buttons
    m.pendingButtons = buttons
    dialog.observeField("buttonSelected", "onActionChosen")
    m.top.getScene().dialog = dialog
end sub

sub onActionChosen(event)
    dialog = m.top.getScene().dialog
    if dialog = invalid then return
    idx = dialog.buttonSelected
    m.top.getScene().dialog = invalid
    if idx = -1 then return

    cancelIdx = m.pendingButtons.count() - 1
    if idx = cancelIdx then return

    if m.parentScene = invalid then return
    nodeCount = m.parentScene.nodesUnlocked
    isPrimary = (m.selectedNode = 0)

    ' Map button index to action based on what buttons were shown
    actionIdx = idx
    isUnlocked = (m.selectedNode < nodeCount)

    ' Determine offset: unlocked nodes get overclock + repair first
    actionOffset = 0
    if isUnlocked
        if actionIdx = 0
            ' Overclock
            if m.parentScene.credits >= 30
                m.parentScene.credits = m.parentScene.credits - 30
                m.parentScene.throughput = clamp(m.parentScene.throughput + 10, 0, 100)
                m.parentScene.heat = clamp(m.parentScene.heat + 15, 0, 100)
                m.parentScene.callFunc("flushSave", invalid)
                m.parentScene.callFunc("addLog", "Node " + m.selectedNode.toStr() + " overclocked. Throughput +10, Heat +15.")
                setStatus("Overclock applied successfully.")
            else
                setStatus("Insufficient credits. Need 30.")
            end if
            return
        else if actionIdx = 1
            ' Repair
            if m.parentScene.credits >= 20
                m.parentScene.credits = m.parentScene.credits - 20
                m.parentScene.heat = 30
                m.parentScene.callFunc("flushSave", invalid)
                m.parentScene.callFunc("addLog", "Node " + m.selectedNode.toStr() + " repaired. Heat reset to 30.")
                setStatus("Repair complete. Heat normalized.")
            else
                setStatus("Insufficient credits. Need 20.")
            end if
            return
        end if
        actionOffset = 2
    end if

    adjustedIdx = actionIdx - actionOffset

    if isPrimary
        if adjustedIdx = 0
            ' Expand
            if nodeCount >= 5
                setStatus("Maximum nodes reached (5/5).")
            else if m.parentScene.credits >= 500
                m.parentScene.credits = m.parentScene.credits - 500
                m.parentScene.nodesUnlocked = m.parentScene.nodesUnlocked + 1
                m.parentScene.callFunc("flushSave", invalid)
                m.parentScene.callFunc("addLog", "New relay node unlocked! Total: " + m.parentScene.nodesUnlocked.toStr() + "/5")
                setStatus("Expansion successful. Node " + (m.parentScene.nodesUnlocked - 1).toStr() + " is online.")
            else
                setStatus("Insufficient credits. Need 500.")
            end if
            return
        else if adjustedIdx = 1
            ' Upgrade
            if m.parentScene.credits >= 200
                m.parentScene.credits = m.parentScene.credits - 200
                m.parentScene.upgradeLevel = m.parentScene.upgradeLevel + 1
                m.parentScene.callFunc("flushSave", invalid)
                newMult = 1.0 + (m.parentScene.upgradeLevel * 0.25)
                m.parentScene.callFunc("addLog", "System upgraded to level " + m.parentScene.upgradeLevel.toStr() + ". Income mult: x" + formatFloat(newMult, 2))
                setStatus("Upgrade complete. Now level " + m.parentScene.upgradeLevel.toStr() + ".")
            else
                setStatus("Insufficient credits. Need 200.")
            end if
            return
        end if
        actionOffset = actionOffset + 2
    end if

    ' Restore Health (available for all unlocked nodes)
    if isUnlocked
        if m.parentScene.credits >= 150
            m.parentScene.credits = m.parentScene.credits - 150
            m.parentScene.networkHealth = clamp(m.parentScene.networkHealth + 30, 0, 100)
            m.parentScene.callFunc("flushSave", invalid)
            m.parentScene.callFunc("addLog", "Network health restored. +30% (now " + m.parentScene.networkHealth.toStr() + "%)")
            setStatus("Health restored. Network integrity improving.")
        else
            setStatus("Insufficient credits. Need 150.")
        end if
    end if
end sub

sub setStatus(msg as string)
    m.top.findNode("statusText").text = msg
end sub

function onEvent(dummy = invalid as dynamic)
    updateUI()
    return invalid
end function

function clamp(val, lo, hi) as integer
    if val < lo then return lo
    if val > hi then return hi
    return val
end function

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
