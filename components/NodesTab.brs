sub init()
    m.top.setFocus(true)
    m.selectedNode = 0
    m.subAction = 0
    updateUI()
end sub

sub setParentScene(parentScene)
    m.parentScene = parentScene
end sub

sub updateUI()
    parent = m.parentScene
    if parent = invalid then return

    nodeCount = parent.nodesUnlocked
    m.top.findNode("nodeInfo").text = "Node " + m.selectedNode.ToStr() + " / " + (nodeCount - 1).ToStr() + "   (up/down to change)"

    if m.selectedNode = 0 then
        m.top.findNode("overclockBtn").visible = true
        m.top.findNode("repairBtn").visible = true
    else
        m.top.findNode("overclockBtn").visible = false
        m.top.findNode("repairBtn").visible = false
    end if

    if nodeCount < 3 then
        m.top.findNode("expandBtn").visible = true
    else
        m.top.findNode("expandBtn").visible = false
    end if
end sub

function onKeyEvent(key as string, press as boolean) as boolean
    if not press then return false
    parent = m.parentScene
    if parent = invalid then return false

    if key = "up" then
        if m.selectedNode > 0 then m.selectedNode = m.selectedNode - 1
        updateUI()
        return true
    else if key = "down" then
        if m.selectedNode < parent.nodesUnlocked - 1 then
            m.selectedNode = m.selectedNode + 1
        end if
        updateUI()
        return true
    else if key = "OK" then
        handleAction()
        return true
    end if
    return false
end function

sub handleAction()
    parent = m.parentScene
    if parent = invalid then return

    if m.selectedNode = 0 then
        if m.subAction = 0 then
            if parent.credits >= 30 then
                parent.credits = parent.credits - 30
                parent.throughput = MinInt(100, parent.throughput + 10)
                parent.heat = MinInt(100, parent.heat + 15)
                parent.saveGame()
                parent.addLog("Overclocked Node 0. Throughput +10, Heat +15.")
                m.top.findNode("statusText").text = "Overclock applied."
            else
                m.top.findNode("statusText").text = "Not enough credits (need 30)."
            end if
        else if m.subAction = 1 then
            if parent.credits >= 20 then
                parent.credits = parent.credits - 20
                parent.heat = 30
                parent.saveGame()
                parent.addLog("Node 0 repaired. Heat reset to 30.")
                m.top.findNode("statusText").text = "Repair complete."
            else
                m.top.findNode("statusText").text = "Not enough credits (need 20)."
            end if
        else if m.subAction = 2 then
            if parent.nodesUnlocked < 3 and parent.credits >= 500 then
                parent.credits = parent.credits - 500
                parent.nodesUnlocked = parent.nodesUnlocked + 1
                parent.saveGame()
                parent.addLog("New node unlocked! Total nodes: " + parent.nodesUnlocked.ToStr())
                m.top.findNode("statusText").text = "Expansion successful."
            else
                m.top.findNode("statusText").text = "Need 500 credits or max nodes."
            end if
        end if
        m.subAction = (m.subAction + 1) mod 3
        updateUI()
        parent.updateFooter()
        if parent.tabs[0].visible then parent.tabs[0].CallFunc("updateUI")
    else
        m.top.findNode("statusText").text = "Node " + m.selectedNode.ToStr() + " offline. Expand your farm first."
    end if
end sub

function onEvent() as boolean
    updateUI()
    return false
end function

function MinInt(a, b) as integer
    if a < b then return a else return b
end function
