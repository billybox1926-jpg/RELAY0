sub init()
    m.top.setFocus(true)
    updateUI()
end sub

sub setParentScene(parentScene)
    m.parentScene = parentScene
end sub

sub updateUI()
    parent = m.parentScene
    if parent = invalid then return

    m.top.findNode("powerBarFill").width = 400 * parent.power / 100
    m.top.findNode("heatBarFill").width = 400 * parent.heat / 100
    m.top.findNode("throughputBarFill").width = 400 * parent.throughput / 100
    m.top.findNode("creditsLabel").text = "Credits: " + parent.credits.ToStr()
end sub

sub onEvent()
    updateUI()
end sub

function handleKeyEvent(key as string, press as boolean) as boolean
    return false
end function
