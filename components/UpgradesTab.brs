' ============================================================
' RELAY-0 - UpgradesTab.brs  (Credit Store)
' ============================================================
' Purchasable upgrades using the credits system. Costs scale
' with the number of times each upgrade has been bought.
' Purchase counts persist via MainScene's upgradeCounts field.
' ============================================================

sub init()
    m.selectedIndex = 0
    m.top.setFocus(true)
    buildCatalog()
end sub

sub setParentScene(parent)
    m.parentScene = parent
    updateUI()
end sub

' Catalog of upgrades. baseCost scales by costMult per purchase.
sub buildCatalog()
    m.catalog = [
        {
            key: "income"
            name: "SIGNAL AMPLIFIER"
            desc: "Permanently increases credit income multiplier by +0.25x per level."
            baseCost: 200
            costMult: 1.6
            maxLevel: 20
        },
        {
            key: "cooling"
            name: "CRYO MANIFOLD"
            desc: "Reduces passive heat generation. Each level cuts heat gain per tick by 1."
            baseCost: 150
            costMult: 1.7
            maxLevel: 5
        },
        {
            key: "reactor"
            name: "REACTOR SHIELDING"
            desc: "Reduces passive power drain. Each level cuts power loss per tick by 1."
            baseCost: 180
            costMult: 1.7
            maxLevel: 5
        },
        {
            key: "bandwidth"
            name: "BANDWIDTH EXPANDER"
            desc: "Raises throughput by +8 immediately and improves recovery."
            baseCost: 120
            costMult: 1.5
            maxLevel: 10
        },
        {
            key: "armor"
            name: "NETWORK HARDENING"
            desc: "Restores 25 network health and reduces future event damage."
            baseCost: 160
            costMult: 1.55
            maxLevel: 10
        },
        {
            key: "battery"
            name: "CAPACITOR BANK"
            desc: "Instantly restores 40 power and raises passive power regen."
            baseCost: 90
            costMult: 1.45
            maxLevel: 10
        }
    ]
end sub

' Current purchase count for an upgrade key
function levelFor(key as string) as integer
    if m.parentScene = invalid then return 0
    counts = m.parentScene.upgradeCounts
    if counts = invalid then return 0
    if counts.doesExist(key) then return counts[key]
    return 0
end function

' Cost for the next purchase of an upgrade
function costFor(item as object) as integer
    lvl = levelFor(item.key)
    cost = item.baseCost
    for i = 1 to lvl
        cost = Cint(cost * item.costMult)
    end for
    return cost
end function

sub updateUI(dummy = invalid as dynamic)
    if m.parentScene = invalid then return
    if m.catalog = invalid then buildCatalog()

    credits = m.parentScene.credits
    m.top.findNode("creditsLine").text = "Credits: " + credits.toStr()

    text = ""
    for i = 0 to m.catalog.count() - 1
        item = m.catalog[i]
        lvl = levelFor(item.key)
        cost = costFor(item)

        prefix = "   "
        if i = m.selectedIndex then prefix = " > "

        line = prefix + item.name
        line = line + "   Lv " + lvl.toStr() + "/" + item.maxLevel.toStr()

        if lvl >= item.maxLevel
            line = line + "   [MAXED]"
        else if credits >= cost
            line = line + "   Cost: " + cost.toStr() + " cr   [AFFORDABLE]"
        else
            line = line + "   Cost: " + cost.toStr() + " cr   (need " + (cost - credits).toStr() + " more)"
        end if

        text = text + line + chr(10) + chr(10)
    end for
    m.top.findNode("upgradeList").text = text

    ' Detail panel for current selection
    sel = m.catalog[m.selectedIndex]
    selLvl = levelFor(sel.key)
    detail = sel.name + " - " + sel.desc
    if selLvl >= sel.maxLevel
        detail = detail + "  (Fully upgraded.)"
    else
        detail = detail + "  Next level costs " + costFor(sel).toStr() + " credits."
    end if
    m.top.findNode("detailText").text = detail
end sub

function handleKey(key as string) as boolean
    if m.parentScene = invalid then return false
    if m.catalog = invalid then buildCatalog()

    if key = "up"
        if m.selectedIndex > 0
            m.selectedIndex = m.selectedIndex - 1
            updateUI()
        end if
        return true
    end if

    if key = "down"
        if m.selectedIndex < m.catalog.count() - 1
            m.selectedIndex = m.selectedIndex + 1
            updateUI()
        end if
        return true
    end if

    if key = "OK"
        purchaseSelected()
        return true
    end if

    return false
end function

sub purchaseSelected()
    item = m.catalog[m.selectedIndex]
    lvl = levelFor(item.key)

    if lvl >= item.maxLevel
        setStatus(item.name + " is already fully upgraded.")
        return
    end if

    cost = costFor(item)
    credits = m.parentScene.credits
    if credits < cost
        setStatus("Insufficient credits. Need " + cost.toStr() + ", have " + credits.toStr() + ".")
        return
    end if

    ' Deduct credits
    m.parentScene.credits = credits - cost

    ' Node fields are copy-on-access: read, mutate, assign back.
    counts = m.parentScene.upgradeCounts
    if counts = invalid then counts = {}
    if counts.doesExist(item.key)
        counts[item.key] = counts[item.key] + 1
    else
        counts[item.key] = 1
    end if
    m.parentScene.upgradeCounts = counts

    ' Apply the upgrade effect
    applyEffect(item.key)

    m.parentScene.callFunc("flushSave", invalid)
    m.parentScene.callFunc("addLog", "Purchased " + item.name + " Lv " + (lvl + 1).toStr() + " for " + cost.toStr() + " cr.")
    setStatus("Purchased " + item.name + " Lv " + (lvl + 1).toStr() + "!")
    updateUI()
end sub

sub applyEffect(key as string)
    if key = "income"
        ' Income multiplier is derived from upgradeLevel in MainScene
        m.parentScene.upgradeLevel = m.parentScene.upgradeLevel + 1
    else if key = "bandwidth"
        m.parentScene.throughput = clampVal(m.parentScene.throughput + 8, 0, 100)
    else if key = "armor"
        m.parentScene.networkHealth = clampVal(m.parentScene.networkHealth + 25, 0, 100)
    else if key = "battery"
        m.parentScene.power = clampVal(m.parentScene.power + 40, 0, 100)
    end if
    ' cooling and reactor are passive: read by MainScene onIncomeTick
end sub

sub setStatus(msg as string)
    m.top.findNode("statusText").text = msg
end sub

function onEvent(dummy = invalid as dynamic)
    updateUI()
    return invalid
end function

function clampVal(val, lo, hi) as integer
    if val < lo then return lo
    if val > hi then return hi
    return val
end function
