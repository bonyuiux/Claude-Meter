// Claude Meter — a floating pixel widget that shows how much of your Claude plan is left
// and when it resets, so you never have to open the usage page by hand.
//
// How it works:
//   1. Claude Code writes the token count of every reply to ~/.claude/projects/**/*.jsonl.
//      This file reads those logs and adds up what you've burned in the current window.
//   2. The exact plan numbers (percent used + reset time) live in ~/.claude-meter/sync.json.
//      They're written by the /sync-meter skill or by "Enter numbers…" in the right-click menu.
//      Each sync also teaches the meter how many log tokens equal 1% of your plan.
//   3. Between syncs the meter estimates: last synced % + tokens burned since ÷ tokens-per-1%.
//   4. The face is plain HTML in ui/ ("Loud Retro" pixel style). This file pushes data into it.
//
// Build with ./build.sh. No Xcode project needed.

import Cocoa
import ServiceManagement
import WebKit

// MARK: - Paths and constants

let fm = FileManager.default
let home = fm.homeDirectoryForCurrentUser
let projectsDir = home.appendingPathComponent(".claude/projects")
let stateDir = home.appendingPathComponent(".claude-meter")
let syncURL = stateDir.appendingPathComponent("sync.json")
let prefs = UserDefaults.standard

let sessionLength: TimeInterval = 5 * 3600
let weekLength: TimeInterval = 7 * 86400

// Measured on 2 Oct 2026 by comparing the logs with the app's usage card (Pro plan):
// the 5-hour window went 7% → 13% while the logs grew by ~716k units.
// Only used until two syncs in the same window teach the meter your own rate.
let defaultUnitsPerPercent = ["session": 119_000.0, "weekly": 300_000.0]

let isoFrac: ISO8601DateFormatter = {
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return f
}()
let isoPlain = ISO8601DateFormatter()
func parseISO(_ s: String) -> Date? { isoFrac.date(from: s) ?? isoPlain.date(from: s) }
func isoString(_ d: Date) -> String { isoFrac.string(from: d) }
func ms(_ d: Date) -> Double { (d.timeIntervalSince1970 * 1000).rounded() }

// MARK: - Reading the local logs

struct Entry { let time: Date; let units: Double; let tokens: Double }

/// Reads Claude Code's session logs incrementally (only new bytes each time).
final class UsageLog {
    private var offsets: [String: UInt64] = [:]
    private var entries: [String: Entry] = [:]   // keyed by message+request id, because the logs repeat each reply
    private let keep: TimeInterval = 9 * 86400   // a week plus slack is all the weekly window needs
    private let usageTag = "\"usage\"".data(using: .utf8)!

    func scan() {
        let cutoff = Date().addingTimeInterval(-keep)
        let keys: [URLResourceKey] = [.contentModificationDateKey, .fileSizeKey]
        guard let walker = fm.enumerator(at: projectsDir, includingPropertiesForKeys: keys) else { return }
        for case let url as URL in walker where url.pathExtension == "jsonl" {
            guard let v = try? url.resourceValues(forKeys: Set(keys)),
                  let mod = v.contentModificationDate, mod > cutoff,
                  let size = v.fileSize else { continue }
            var start = offsets[url.path] ?? 0
            if UInt64(size) < start { start = 0 }       // file was rewritten
            if UInt64(size) == start { continue }
            guard let h = try? FileHandle(forReadingFrom: url) else { continue }
            defer { try? h.close() }
            try? h.seek(toOffset: start)
            // Only take complete lines; a half-written last line is picked up next time.
            guard let data = try? h.readToEnd(), let lastNL = data.lastIndex(of: 0x0A) else { continue }
            let chunk = data[data.startIndex...lastNL]
            offsets[url.path] = start + UInt64(chunk.count)
            for line in chunk.split(separator: 0x0A) where line.range(of: usageTag) != nil { parse(line) }
        }
        entries = entries.filter { $0.value.time > cutoff }
    }

    private func parse(_ line: Data) {
        guard let obj = try? JSONSerialization.jsonObject(with: line) as? [String: Any],
              obj["type"] as? String == "assistant",
              let msg = obj["message"] as? [String: Any],
              let u = msg["usage"] as? [String: Any],
              let ts = obj["timestamp"] as? String, let t = parseISO(ts) else { return }
        let model = (msg["model"] as? String ?? "").lowercased()
        if model == "<synthetic>" { return }
        func n(_ k: String) -> Double { (u[k] as? NSNumber)?.doubleValue ?? 0 }
        let input = n("input_tokens"), output = n("output_tokens")
        let cacheWrite = n("cache_creation_input_tokens"), cacheRead = n("cache_read_input_tokens")
        // Plan limits are weighted by cost, not raw tokens: output costs ~5× input,
        // cache reads ~0.1×, and smaller models count for less.
        let modelWeight = model.contains("haiku") ? 0.2 : model.contains("sonnet") ? 0.6 : 1.0
        let units = (input + cacheWrite * 1.25 + cacheRead * 0.1 + output * 5) * modelWeight
        let id = "\(msg["id"] as? String ?? "")|\(obj["requestId"] as? String ?? obj["uuid"] as? String ?? "")"
        entries[id] = Entry(time: t, units: units, tokens: input + output + cacheWrite)
    }

    func sum(from a: Date, to b: Date) -> (units: Double, tokens: Double) {
        var u = 0.0, t = 0.0
        for e in entries.values where e.time >= a && e.time <= b { u += e.units; t += e.tokens }
        return (u, t)
    }

    func firstActivity(after d: Date) -> Date? {
        entries.values.lazy.filter { $0.time >= d }.map(\.time).min()
    }

    /// A 5-hour window starts with the first message after the previous one ended.
    /// Walks forward from `cursor` to find the window that contains `now`, or nil if idle.
    func currentBlockStart(from cursor: Date, length: TimeInterval, now: Date) -> Date? {
        var c = cursor
        while let first = firstActivity(after: c) {
            if first + length > now { return first }
            c = first + length
        }
        return nil
    }
}

// MARK: - Exact numbers from a sync

struct SyncWindow { var percent: Double; var resetsAt: Date }
struct SyncData { var syncedAt: Date; var plan: String?; var windows: [String: SyncWindow] }

func loadSync() -> SyncData? {
    guard let d = try? Data(contentsOf: syncURL),
          let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
          let at = (o["syncedAt"] as? String).flatMap(parseISO) else { return nil }
    var wins: [String: SyncWindow] = [:]
    for w in o["windows"] as? [[String: Any]] ?? [] {
        guard let kind = w["kind"] as? String,
              let pct = (w["percentUsed"] as? NSNumber)?.doubleValue,
              let r = (w["resetsAt"] as? String).flatMap(parseISO) else { continue }
        wins[kind] = SyncWindow(percent: pct, resetsAt: r)
    }
    return SyncData(syncedAt: at, plan: o["plan"] as? String, windows: wins)
}

func saveSync(_ s: SyncData, source: String) {
    try? fm.createDirectory(at: stateDir, withIntermediateDirectories: true)
    let o: [String: Any] = [
        "syncedAt": isoString(s.syncedAt),
        "plan": s.plan ?? NSNull(),
        "source": source,
        "windows": s.windows.map { ["kind": $0.key, "percentUsed": $0.value.percent, "resetsAt": isoString($0.value.resetsAt)] },
    ]
    if let d = try? JSONSerialization.data(withJSONObject: o, options: [.prettyPrinted, .sortedKeys]) {
        try? d.write(to: syncURL)
    }
}

// MARK: - The meter maths

final class Meter {
    let log = UsageLog()

    func unitsPerPercent(_ kind: String) -> Double {
        let v = prefs.double(forKey: "upp.\(kind)")
        return v > 0 ? v : defaultUnitsPerPercent[kind]!
    }

    /// Learns "log units per 1%" by comparing two syncs in the same window. Runs once per sync.
    /// It uses the *change* between syncs, not the total, because some usage never reaches
    /// these logs (claude.ai chats, other devices). That hidden part cancels out in a difference.
    func calibrate(_ s: SyncData) {
        let stamp = isoString(s.syncedAt)
        guard prefs.string(forKey: "calibratedFor") != stamp else { return }
        for (kind, w) in s.windows {
            let key = "baseline.\(kind)"
            let reset = w.resetsAt.timeIntervalSince1970
            if let b = prefs.dictionary(forKey: key),
               let bPct = b["pct"] as? Double, let bAt = b["at"] as? Double, let bReset = b["reset"] as? Double,
               abs(bReset - reset) < 300 {                       // same window as last time
                let dPct = w.percent - bPct
                // Percentages arrive as whole numbers, so small changes are mostly rounding noise.
                if dPct >= 0 && dPct < (kind == "weekly" ? 3 : 4) { continue }   // keep the older baseline and wait
                if dPct > 0 {
                    let units = log.sum(from: Date(timeIntervalSince1970: bAt), to: s.syncedAt).units
                    if units > 0 {
                        let fresh = units / dPct
                        let learned = prefs.double(forKey: "upp.\(kind)")
                        prefs.set(learned > 0 ? (learned + fresh) / 2 : fresh, forKey: "upp.\(kind)")
                    }
                }
            }
            prefs.set(["pct": w.percent, "at": s.syncedAt.timeIntervalSince1970, "reset": reset], forKey: key)
        }
        prefs.set(stamp, forKey: "calibratedFor")
    }

    /// Where one limit window stands right now.
    func window(_ kind: String, sync: SyncData?, now: Date) -> [String: Any] {
        let len = kind == "weekly" ? weekLength : sessionLength
        var start: Date?
        var basePct = 0.0
        var baseTime = now

        if let s = sync, let w = s.windows[kind] {
            if now < w.resetsAt {                       // still inside the synced window
                start = w.resetsAt - len
                basePct = w.percent
                baseTime = s.syncedAt
            } else if kind == "weekly" {                // the week rolls on a fixed schedule
                var r = w.resetsAt
                while r <= now { r += len }
                start = r - len
                baseTime = start!
            } else {                                    // a new 5-hour window opens with your next message
                start = log.currentBlockStart(from: w.resetsAt, length: len, now: now)
                baseTime = start ?? now
            }
        } else if kind == "session" {
            start = log.currentBlockStart(from: now - 86400, length: len, now: now)
            baseTime = start ?? now
        } else {
            return ["kind": kind, "known": false]       // weekly reset day is unknown until the first sync
        }

        guard let st = start else { return ["kind": kind, "known": true, "idle": true, "percentUsed": 0] }
        let reset = st + len
        let upp = unitsPerPercent(kind)
        let used = min(100, max(0, basePct + log.sum(from: baseTime, to: now).units / upp))
        let perMin = log.sum(from: now - 1800, to: now).units / upp / 30   // burn rate over the last half hour
        var out: [String: Any] = [
            "kind": kind, "known": true, "idle": false,
            "percentUsed": used, "startsAt": ms(st), "resetsAt": ms(reset),
            "tokens": log.sum(from: st, to: now).tokens, "pctPerMin": perMin,
        ]
        if perMin > 0.005 && used < 100 {
            let empty = now + (100 - used) / perMin * 60
            if empty < reset { out["emptyAt"] = ms(empty) }
        }
        return out
    }

    func snapshot() -> [String: Any] {
        log.scan()
        let now = Date()
        let sync = loadSync()
        if let s = sync { calibrate(s) }
        return [
            "now": ms(now),
            "plan": sync?.plan ?? NSNull(),
            "syncedAt": sync.map { ms($0.syncedAt) } ?? NSNull(),
            "session": window("session", sync: sync, now: now),
            "weekly": window("weekly", sync: sync, now: now),
        ]
    }
}

// MARK: - Web view that lets you drag the whole widget

/// WKWebView swallows mouse events, so dragging is done by hand here.
/// Buttons in the UI send "nodrag" on pointerdown so they still click normally.
final class DragWebView: WKWebView {
    var dragAllowed = true
    var onMoved: (() -> Void)?
    var onRightClick: ((NSEvent) -> Void)?
    private var startMouse = NSPoint.zero, startOrigin = NSPoint.zero, moved = false

    override func acceptsFirstMouse(for event: NSEvent?) -> Bool { true }

    override func mouseDown(with e: NSEvent) {
        startMouse = NSEvent.mouseLocation
        startOrigin = window?.frame.origin ?? .zero
        moved = false
        dragAllowed = true
        super.mouseDown(with: e)
    }

    override func mouseDragged(with e: NSEvent) {
        let p = NSEvent.mouseLocation
        let dx = p.x - startMouse.x, dy = p.y - startMouse.y
        if dragAllowed && (moved || abs(dx) + abs(dy) > 3) {
            moved = true
            window?.setFrameOrigin(NSPoint(x: startOrigin.x + dx, y: startOrigin.y + dy))
        } else {
            super.mouseDragged(with: e)
        }
    }

    override func mouseUp(with e: NSEvent) {
        super.mouseUp(with: e)
        if moved { onMoved?() }
    }

    override func rightMouseDown(with e: NSEvent) { onRightClick?(e) }
}

// MARK: - App

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var panel: NSPanel!
    var web: DragWebView!
    let meter = Meter()
    let work = DispatchQueue(label: "meter.work")   // log reading stays off the main thread
    var timer: Timer?
    var lastPayload: [String: Any] = [:]

    var theme: String {
        get { prefs.string(forKey: "theme") ?? "dark" }
        set { prefs.set(newValue, forKey: "theme"); push(); if bubbleState != "idle" { showBubble() } }
    }
    var mini: Bool {
        get { prefs.bool(forKey: "mini") }
        set { prefs.set(newValue, forKey: "mini"); push() }
    }

    func applicationDidFinishLaunching(_ n: Notification) {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.add(self, name: "meter")
        let size = NSSize(width: 360, height: 260)
        web = DragWebView(frame: NSRect(origin: .zero, size: size), configuration: cfg)
        web.setValue(false, forKey: "drawsBackground")
        web.navigationDelegate = self
        web.onMoved = { [weak self] in self?.savePosition(); self?.placeBubble() }
        web.onRightClick = { [weak self] e in self?.showMenu(e) }

        panel = NSPanel(contentRect: NSRect(origin: .zero, size: size),
                        styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        panel.isFloatingPanel = true
        panel.level = .floating
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        panel.backgroundColor = .clear
        panel.isOpaque = false
        panel.hasShadow = false
        panel.hidesOnDeactivate = false
        panel.becomesKeyOnlyIfNeeded = true
        panel.contentView = web
        restorePosition()
        panel.orderFrontRegardless()

        let ui = (Bundle.main.resourceURL ?? URL(fileURLWithPath: "."))
            .appendingPathComponent("ui/index.html")
        web.loadFileURL(ui, allowingReadAccessTo: ui.deletingLastPathComponent())

        timer = Timer.scheduledTimer(withTimeInterval: 15, repeats: true) { [weak self] _ in self?.refresh() }
        setUpBubble()
    }

    // MARK: Status bubble (what Claude is doing right now)
    //
    // Claude Code hooks (see hooks/claude-meter-hook.sh) write ~/.claude-meter/activity/<session>.json
    // whenever a prompt starts, a tool runs, or a prompt finishes. Once a second we read those tiny
    // files and pop a bubble out of the meter: Thinking… / Done! / Needs you.

    let activityDir = stateDir.appendingPathComponent("activity")
    var bubblePanel: NSPanel!
    var bubbleWeb: WKWebView!
    let bubbleSize = NSSize(width: 230, height: 84)
    var seenAt: [String: Double] = [:]
    var firstPoll = true
    var celebrateUntil = Date.distantPast
    var bubbleState = "idle"

    func setUpBubble() {
        bubbleWeb = WKWebView(frame: NSRect(origin: .zero, size: bubbleSize))
        bubbleWeb.setValue(false, forKey: "drawsBackground")
        bubblePanel = NSPanel(contentRect: NSRect(origin: .zero, size: bubbleSize),
                              styleMask: [.borderless, .nonactivatingPanel], backing: .buffered, defer: false)
        bubblePanel.level = .floating
        bubblePanel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary]
        bubblePanel.backgroundColor = .clear
        bubblePanel.isOpaque = false
        bubblePanel.hasShadow = false
        bubblePanel.ignoresMouseEvents = true      // purely visual; clicks go to whatever is behind it
        bubblePanel.contentView = bubbleWeb
        let page = (Bundle.main.resourceURL ?? URL(fileURLWithPath: ".")).appendingPathComponent("ui/bubble.html")
        bubbleWeb.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
        Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in self?.pollActivity() }
    }

    func pollActivity() {
        let now = Date().timeIntervalSince1970
        var working = false, waiting = false, justDone = false
        let files = (try? fm.contentsOfDirectory(at: activityDir, includingPropertiesForKeys: nil)) ?? []
        for url in files where url.pathExtension == "json" {
            guard let d = try? Data(contentsOf: url),
                  let o = try? JSONSerialization.jsonObject(with: d) as? [String: Any],
                  let state = o["state"] as? String, let at = (o["at"] as? NSNumber)?.doubleValue else { continue }
            let age = now - at
            if age > 86400 { try? fm.removeItem(at: url); continue }   // tidy up old chats
            let isNew = seenAt[url.path] != at
            seenAt[url.path] = at
            switch state {
            case "working": if age < 600 { working = true }            // no sign of life for 10 min = stopped
            case "waiting": if age < 1800 { waiting = true }
            case "done":    if isNew && !firstPoll && age < 30 { justDone = true }
            default: break
            }
        }
        firstPoll = false
        if justDone { celebrateUntil = Date().addingTimeInterval(6) }
        let next = waiting ? "waiting" : celebrateUntil > Date() ? "done" : working ? "working" : "idle"
        if next != bubbleState { bubbleState = next; showBubble() }
    }

    func showBubble() {
        if bubbleState == "idle" {
            panel.removeChildWindow(bubblePanel)
            bubblePanel.orderOut(nil)
            return
        }
        let side = placeBubble()
        if bubblePanel.parent == nil { panel.addChildWindow(bubblePanel, ordered: .above) }   // follows the meter when dragged
        bubbleWeb.evaluateJavaScript("window.bubble && window.bubble.show('\(bubbleState)', '\(theme)', '\(side)')")
    }

    /// Puts the bubble just above the meter, or just below it when the meter is at the top of the screen.
    @discardableResult
    func placeBubble() -> String {
        guard bubblePanel != nil else { return "above" }
        let f = panel.frame
        let vis = (panel.screen ?? NSScreen.main)?.visibleFrame ?? f
        let above = f.maxY + bubbleSize.height - 6 <= vis.maxY
        var origin = NSPoint(x: f.minX, y: above ? f.maxY - 6 : f.minY + 8 - bubbleSize.height)
        origin.x = min(max(origin.x, vis.minX), vis.maxX - bubbleSize.width)
        bubblePanel.setFrameOrigin(origin)
        let side = above ? "above" : "below"
        if bubbleState != "idle" {
            bubbleWeb.evaluateJavaScript("window.bubble && window.bubble.show('\(bubbleState)', '\(theme)', '\(side)')")
        }
        return side
    }

    func webView(_ w: WKWebView, didFinish nav: WKNavigation!) { refresh() }

    func refresh() {
        work.async { [weak self] in
            guard let self else { return }
            let p = self.meter.snapshot()
            DispatchQueue.main.async { self.lastPayload = p; self.push() }
        }
    }

    func push() {
        var p = lastPayload
        p["theme"] = theme
        p["mini"] = mini
        guard let data = try? JSONSerialization.data(withJSONObject: p),
              let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.meter && window.meter.update(\(json))")
    }

    // Messages from the UI: its size, the size toggle, and "don't drag, I'm a button".
    func userContentController(_ c: WKUserContentController, didReceive m: WKScriptMessage) {
        guard let body = m.body as? [String: Any], let type = body["type"] as? String else { return }
        switch type {
        case "nodrag": web.dragAllowed = false
        case "mini": mini = (body["value"] as? Bool) ?? false
        case "size":
            guard let w = body["w"] as? Double, let h = body["h"] as? Double else { return }
            let old = panel.frame
            let vis = (panel.screen ?? NSScreen.main)?.visibleFrame ?? old
            var f = old
            f.size = NSSize(width: w, height: h)
            // Grow away from the nearest screen edge: parked bottom-right, it grows up and left.
            f.origin.y = old.midY < vis.midY ? old.minY : old.maxY - h
            f.origin.x = old.midX > vis.midX ? old.maxX - w : old.minX
            // And never leave any of it off screen.
            f.origin.x = min(max(f.origin.x, vis.minX), vis.maxX - w)
            f.origin.y = min(max(f.origin.y, vis.minY), vis.maxY - h)
            panel.setFrame(f, display: true)
            savePosition()
            placeBubble()
        default: break
        }
    }

    // MARK: Position

    func savePosition() {
        prefs.set(panel.frame.minX, forKey: "x")
        prefs.set(panel.frame.maxY, forKey: "top")
    }

    func restorePosition() {
        let vis = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        var x = vis.maxX - panel.frame.width - 24, top = vis.maxY - 24   // default: top-right corner
        if prefs.object(forKey: "x") != nil {
            let sx = prefs.double(forKey: "x"), st = prefs.double(forKey: "top")
            if NSScreen.screens.contains(where: { $0.visibleFrame.insetBy(dx: -20, dy: -20).contains(NSPoint(x: sx + 20, y: st - 20)) }) {
                x = sx; top = st
            }
        }
        panel.setFrameTopLeftPoint(NSPoint(x: x, y: top))
    }

    // MARK: Right-click menu

    func showMenu(_ e: NSEvent) {
        let m = NSMenu()
        m.addItem(item("Enter numbers from Claude's usage card…", #selector(enterNumbers)))
        m.addItem(item("How to sync exactly", #selector(howToSync)))
        m.addItem(.separator())
        for (title, key) in [("Dark theme", "dark"), ("Light theme", "light"), ("Match macOS", "auto")] {
            let i = item(title, #selector(pickTheme(_:)))
            i.representedObject = key
            i.state = theme == key ? .on : .off
            m.addItem(i)
        }
        let s = item("Mini size", #selector(toggleMini))
        s.state = mini ? .on : .off
        m.addItem(s)
        m.addItem(item("Refresh now", #selector(refreshNow)))
        let login = item("Open at login", #selector(toggleLogin))
        login.state = SMAppService.mainApp.status == .enabled ? .on : .off
        m.addItem(login)
        m.addItem(.separator())
        m.addItem(item("About Claude Meter", #selector(about)))
        m.addItem(item("Quit Claude Meter", #selector(quit)))
        NSMenu.popUpContextMenu(m, with: e, for: web)
    }

    func item(_ t: String, _ a: Selector) -> NSMenuItem {
        let i = NSMenuItem(title: t, action: a, keyEquivalent: "")
        i.target = self
        return i
    }

    @objc func pickTheme(_ i: NSMenuItem) { theme = i.representedObject as? String ?? "dark" }
    @objc func toggleMini() { mini.toggle() }
    @objc func refreshNow() { refresh() }
    @objc func quit() { NSApp.terminate(nil) }

    @objc func about() {
        let a = NSAlert()
        a.messageText = "Claude Meter"
        a.informativeText = "Made by Bon Yeung · github.com/bonyuiux\nCopyright © 2026 Bon Yeung\n\nA floating pixel meter that shows how much of your Claude plan is left and when it resets. An unofficial fan-made tool."
        NSApp.activate(ignoringOtherApps: true)
        a.runModal()
    }

    /// Adds or removes the meter from macOS Login Items so it starts by itself.
    @objc func toggleLogin() {
        let service = SMAppService.mainApp
        do {
            if service.status == .enabled { try service.unregister() } else { try service.register() }
            if service.status == .requiresApproval { SMAppService.openSystemSettingsLoginItems() }   // macOS wants a yes from you
        } catch {
            NSApp.activate(ignoringOtherApps: true)
            NSAlert(error: error).runModal()
        }
    }

    @objc func howToSync() {
        let a = NSAlert()
        a.messageText = "Sync the exact numbers"
        a.informativeText = """
        In any Claude Code chat, type /sync-meter. Claude reads your plan's real usage and updates this meter. \
        Each sync also teaches the meter how fast you burn, so the estimate stays close between syncs.

        No chat open? Right-click and choose "Enter numbers from Claude's usage card…", \
        then copy the two percentages from Claude's usage screen.
        """
        NSApp.activate(ignoringOtherApps: true)
        a.runModal()
    }

    @objc func enterNumbers() {
        let a = NSAlert()
        a.messageText = "How much have you used?"
        a.informativeText = "Copy the \"% used\" numbers from Claude's usage screen."
        a.addButton(withTitle: "Save")
        a.addButton(withTitle: "Cancel")
        let session = NSTextField(frame: NSRect(x: 130, y: 34, width: 80, height: 24))
        let weekly = NSTextField(frame: NSRect(x: 130, y: 2, width: 80, height: 24))
        let box = NSView(frame: NSRect(x: 0, y: 0, width: 240, height: 60))
        for (y, t) in [(38.0, "5-hour limit %"), (6.0, "Weekly limit %")] {
            let l = NSTextField(labelWithString: t)
            l.frame = NSRect(x: 0, y: y, width: 125, height: 18)
            box.addSubview(l)
        }
        let s = lastPayload["session"] as? [String: Any], w = lastPayload["weekly"] as? [String: Any]
        session.stringValue = String(Int(((s?["percentUsed"] as? Double) ?? 0).rounded()))
        weekly.stringValue = String(Int(((w?["percentUsed"] as? Double) ?? 0).rounded()))
        box.addSubview(session); box.addSubview(weekly)
        a.accessoryView = box
        NSApp.activate(ignoringOtherApps: true)
        guard a.runModal() == .alertFirstButtonReturn else { return }

        let now = Date()
        var data = loadSync() ?? SyncData(syncedAt: now, plan: nil, windows: [:])
        data.syncedAt = now
        if let p = Double(session.stringValue) {
            // Keep the current window's reset time; if none is running, the window starts now.
            let r = (s?["resetsAt"] as? Double).map { Date(timeIntervalSince1970: $0 / 1000) } ?? now + sessionLength
            data.windows["session"] = SyncWindow(percent: p, resetsAt: r)
        }
        if let p = Double(weekly.stringValue), let r = w?["resetsAt"] as? Double {
            data.windows["weekly"] = SyncWindow(percent: p, resetsAt: Date(timeIntervalSince1970: r / 1000))
        }
        saveSync(data, source: "manual")
        refresh()
    }
}

// `ClaudeMeter --dump` prints what the widget would show, for troubleshooting.
if CommandLine.arguments.contains("--dump") {
    let d = try! JSONSerialization.data(withJSONObject: Meter().snapshot(), options: [.prettyPrinted, .sortedKeys])
    print(String(data: d, encoding: .utf8)!)
    exit(0)
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)   // no Dock icon; it's a widget
app.run()
