' ============================================================
' RELAY-0 - LogsTab.brs  (System Log Viewer)
' ============================================================
' Upgraded: Clear logs function, entry count, improved formatting
' ============================================================

sub init()
    m.top.setFocus(true)
    refresh()
end sub

sub setParentScene(parent)
    m.parentScene = parent
end sub

sub refresh(dummy = invalid as dynamic)
    if m.parentScene = invalid or m.parentScene.logEntries = invalid then return
    entries = m.parentScene.logEntries
    if entries.count() = 0
        m.top.findNode("logDisplay").text = "No logs yet."
        m.top.findNode("logCount").text = "Entries: 0"
        return
    end if

    m.top.findNode("logCount").text = "Entries: " + entries.count().toStr()

    ' Format log entries with visual separators
    display = ""
    maxShow = entries.count()
    if maxShow > 50 then maxShow = 50
    for i = 0 to maxShow - 1
        entry = entries[i]
        display = display + entry + chr(10)
    end for
    if entries.count() > 50
        display = display + chr(10) + "... (" + (entries.count() - 50).toStr() + " older entries not shown)"
    end if

    m.top.findNode("logDisplay").text = display

    ' Color based on newest entry severity
    if entries.count() > 0
        newest = entries[0]
        if newest.instr("CRITICAL") > -1 or newest.instr("INTRUSION") > -1 or newest.instr("CORRUPTION") > -1
            m.top.findNode("logDisplay").color = "#FFAAAAFF"
        else if newest.instr("WARNING") > -1 or newest.instr("SPIKE") > -1 or newest.instr("FLARE") > -1
            m.top.findNode("logDisplay").color = "#FFDDAAFF"
        else if newest.instr("BOOST") > -1 or newest.instr("UPDATE") > -1 or newest.instr("FULFILLED") > -1 or newest.instr("upgraded") > -1
            m.top.findNode("logDisplay").color = "#AAFFAAFF"
        else
            m.top.findNode("logDisplay").color = "#CCFFCCFF"
        end if
    end if
end sub

function onEvent(dummy = invalid as dynamic)
    refresh()
    return invalid
end function

function handleKey(key as string) as boolean
    if key = "OK"
        clearLogs()
        return true
    end if
    return false
end function

sub clearLogs()
    if m.parentScene = invalid then return
    if m.parentScene.logEntries = invalid then return

    count = m.parentScene.logEntries.count()
    if count = 0 then return

    dialog = CreateObject("roSGNode", "Dialog")
    dialog.title = "CLEAR LOGS"
    dialog.optionsDialog = true
    dialog.message = "Delete all " + count.toStr() + " log entries?"
    dialog.buttons = ["Clear All", "Cancel"]
    dialog.observeField("buttonSelected", "onClearConfirm")
    m.top.getScene().dialog = dialog
end sub

sub onClearConfirm(event)
    if m.dialogBusy = true then return
    m.dialogBusy = true

    dialog = m.top.getScene().dialog
    if dialog = invalid
        m.dialogBusy = false
        return
    end if
    idx = dialog.buttonSelected
    closeDialog()

    if idx = 0
        m.parentScene.logEntries = []
        m.parentScene.callFunc("flushSave", invalid)
        m.parentScene.callFunc("addLog", "Logs cleared by operator.")
        refresh()
    end if
end sub

' Detach the dialog observer and release the node. Setting scene.dialog to
' invalid alone drops the reference without unsubscribing, leaving a live
' subscription on a node whose surrounding state has been cleared.
sub closeDialog()
    scene = m.top.getScene()
    if scene <> invalid
        dlg = scene.dialog
        if dlg <> invalid then dlg.unobserveField("buttonSelected")
        scene.dialog = invalid
    end if
    ' Release the re-entrancy guard so the next dialog can open.
    m.dialogBusy = false
end sub
