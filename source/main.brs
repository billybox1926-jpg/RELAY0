' RELAY-0 Entry Point
' Network relay station idle/management game for Roku
sub Main()
    screen = CreateObject("roSGScreen")
    port = CreateObject("roMessagePort")
    screen.setMessagePort(port)

    scene = screen.CreateScene("MainScene")
    screen.show()

    while true
        msg = wait(0, port)
        if type(msg) = "roSGScreenEvent" and msg.isScreenClosed()
            ' Give the scene a chance to stop its timers and flush any
            ' mutation still inside the 2-second save debounce window.
            ' Without this, exiting right after an action loses it.
            if scene <> invalid then scene.shutdown = true
            return
        end if
    end while
end sub
