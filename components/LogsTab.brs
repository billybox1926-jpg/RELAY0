sub init()
    refresh()
end sub

sub setParentScene(parentScene)
    m.parentScene = parentScene
end sub

sub refresh()
    parent = m.parentScene
    if parent = invalid or parent.logEntries = invalid then return
    display = ""
    for each entry in parent.logEntries
        display = display + entry + chr(10)
    end for
    if display = "" then display = "No logs yet."
    m.top.findNode("logDisplay").text = display
end sub

function onEvent() as boolean
    refresh()
    return false
end function

function onKeyEvent(key as string, press as boolean) as boolean
    return false
end function
