// Captures the REAL Claude Meter UI (~/Desktop/Claude Meter/ui) as crisp loops and stills for the case study.
// Hidden web views slow their timers down, so a "virtual clock" is injected into each page: the page's
// setInterval/setTimeout/Date.now are replaced, and this tool advances time exactly one frame at a time.
// Run: ./capture.sh   Output: ../assets/
import Cocoa
import WebKit
import AVFoundation

let uiDir = URL(fileURLWithPath: CommandLine.arguments[1])
let outDir = URL(fileURLWithPath: CommandLine.arguments[2])
let FPS: Int32 = 15
let ZOOM: CGFloat = 2
let STAGE_BG = CGColor(red: 0x14 / 255, green: 0x11 / 255, blue: 0x22 / 255, alpha: 1)   // the meter's --bg-2

let virtualClock = """
(() => {
  const start = Date.now(); let now = 0, nextId = 1; const timers = new Map();
  const add = (fn, ms, rep, args) => { const id = nextId++; const step = Math.max(1, ms || 0);
    timers.set(id, { fn, step, next: now + step, rep, args }); return id; };
  window.setInterval = (fn, ms, ...a) => add(fn, ms, true, a);
  window.setTimeout = (fn, ms, ...a) => add(fn, ms, false, a);
  window.clearInterval = window.clearTimeout = id => timers.delete(id);
  window.requestAnimationFrame = fn => add(() => fn(now), 16, false, []);
  const RealDate = Date; Date.now = () => start + now;
  performance.now = () => now;
  window.__advance = ms => {
    const target = now + ms;
    for (;;) {
      let pick = null;
      for (const [id, t] of timers) if (t.next <= target && (!pick || t.next < pick[1].next)) pick = [id, t];
      if (!pick) break;
      const [id, t] = pick; now = t.next;
      if (t.rep) t.next += t.step; else timers.delete(id);
      try { t.fn(...t.args); } catch (e) {}
    }
    now = target;
  };
})();
"""

// ---------- run-loop helpers (keeps the code top-to-bottom) ----------
func spin(_ seconds: Double) { RunLoop.main.run(until: Date().addingTimeInterval(seconds)) }
func waitFor(_ done: () -> Bool) { while !done() { RunLoop.main.run(until: Date().addingTimeInterval(0.005)) } }

final class Page: NSObject, WKNavigationDelegate {
    let web: WKWebView
    var loaded = false
    init(width: CGFloat, height: CGFloat) {
        let cfg = WKWebViewConfiguration()
        cfg.userContentController.addUserScript(WKUserScript(source: virtualClock, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: width, height: height), configuration: cfg)
        super.init()
        web.setValue(false, forKey: "drawsBackground")
        web.pageZoom = ZOOM
        web.navigationDelegate = self
    }
    func webView(_ w: WKWebView, didFinish n: WKNavigation!) { loaded = true }

    func open(_ file: String, _ query: String) {
        loaded = false
        let url = URL(string: uiDir.appendingPathComponent(file).absoluteString + "?" + query)!
        web.loadFileURL(url, allowingReadAccessTo: uiDir)
        waitFor { loaded }
        spin(1.8)                      // fonts arrive from Google Fonts in real time
        advance(400)
    }
    func js(_ code: String) -> Any? {
        var out: Any?, done = false
        web.evaluateJavaScript(code) { v, _ in out = v; done = true }
        waitFor { done }
        return out
    }
    func advance(_ ms: Double) { _ = js("window.__advance(\(ms)); 1") }
    /// Bounds of an element in snapshot pixels, padded for its hard shadow (and the bubble's tail).
    func bounds(_ id: String, padRight: CGFloat, padBottom: CGFloat) -> CGRect {
        let r = js("(r => [r.left, r.top, r.width, r.height])(document.getElementById('\(id)').getBoundingClientRect())") as! [Double]
        return CGRect(x: r[0] * ZOOM, y: r[1] * ZOOM, width: r[2] * ZOOM + padRight, height: r[3] * ZOOM + padBottom).integral
    }
    func snapshot() -> CGImage {
        var image: NSImage?, done = false
        let conf = WKSnapshotConfiguration()
        conf.snapshotWidth = NSNumber(value: Double(web.frame.width))     // 1 image pixel per point
        web.takeSnapshot(with: conf) { img, _ in image = img; done = true }
        waitFor { done }
        var rect = CGRect(origin: .zero, size: image!.size)
        return image!.cgImage(forProposedRect: &rect, context: nil, hints: nil)!
    }
}

// ---------- output ----------
final class Clip {
    let writer: AVAssetWriter, input: AVAssetWriterInput, adaptor: AVAssetWriterInputPixelBufferAdaptor
    let size: CGSize
    var frame: Int64 = 0
    init(_ name: String, _ size: CGSize) {
        self.size = size
        let url = outDir.appendingPathComponent(name)
        try? FileManager.default.removeItem(at: url)
        writer = try! AVAssetWriter(outputURL: url, fileType: .mp4)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: Int(size.width), AVVideoHeightKey: Int(size.height),
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 3_000_000],
        ])
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: Int(size.width), kCVPixelBufferHeightKey as String: Int(size.height),
        ])
        writer.add(input); writer.startWriting(); writer.startSession(atSourceTime: .zero)
    }
    func add(_ image: CGImage) {
        var pb: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pb)
        CVPixelBufferLockBaseAddress(pb!, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb!), width: Int(size.width), height: Int(size.height), bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb!), space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
        ctx.draw(image, in: CGRect(origin: .zero, size: size))
        CVPixelBufferUnlockBaseAddress(pb!, [])
        waitFor { input.isReadyForMoreMediaData }
        adaptor.append(pb!, withPresentationTime: CMTime(value: frame, timescale: FPS))
        frame += 1
    }
    func finish() {
        input.markAsFinished()
        var done = false
        writer.finishWriting { done = true }
        waitFor { done }
        print("saved \(writer.outputURL.lastPathComponent) (\(Double(frame) / Double(FPS))s)")
    }
}

func savePNG(_ image: CGImage, _ name: String) {
    let rep = NSBitmapImageRep(cgImage: image)
    try! rep.representation(using: .png, properties: [:])!.write(to: outDir.appendingPathComponent(name))
    print("saved \(name)")
}

/// Places one or more layers (image + top-left position) centred on the stage colour.
func compose(_ size: CGSize, _ layers: [(CGImage, CGRect)]) -> CGImage {
    let ctx = CGContext(data: nil, width: Int(size.width), height: Int(size.height), bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedFirst.rawValue)!
    ctx.setFillColor(STAGE_BG); ctx.fill(CGRect(origin: .zero, size: size))
    ctx.interpolationQuality = .none
    for (img, r) in layers {      // r is in top-left coordinates
        ctx.draw(img, in: CGRect(x: r.minX, y: size.height - r.maxY, width: r.width, height: r.height))
    }
    return ctx.makeImage()!
}

// ---------- the shots ----------
let meter = Page(width: 800, height: 640)      // ×2 zoom: room for the full card at 2×
let bubblePage = Page(width: 640, height: 300)
let frameMS = 1000.0 / Double(FPS)

func meterFrame(_ crop: CGRect) -> CGImage { meter.snapshot().cropping(to: crop)! }

/// A single meter state as a loop + a still at `stillAt` seconds.
func meterShot(_ query: String, name: String, seconds: Double, stage: CGSize, stillAt: Double = 1.0) {
    meter.open("index.html", query)
    let crop = meter.bounds("card", padRight: 8 * ZOOM, padBottom: 8 * ZOOM)
    let clip = Clip("\(name).mp4", stage)
    for i in 0..<Int(seconds * Double(FPS)) {
        let card = meterFrame(crop)
        let pos = CGRect(x: (stage.width - crop.width) / 2, y: (stage.height - crop.height) / 2, width: crop.width, height: crop.height)
        let img = compose(stage, [(card, pos)])
        clip.add(img)
        if i == Int(stillAt * Double(FPS)) { savePNG(img, "\(name).png") }
        meter.advance(frameMS)
    }
    clip.finish()
}

func run() {
    try? FileManager.default.createDirectory(at: outDir, withIntermediateDirectories: true)
    let wide = CGSize(width: 1200, height: 900)

    // Feature 01: live numbers (full size, then mini)
    meterShot("state=ok", name: "01-live", seconds: 4, stage: wide)
    meterShot("state=ok&mini=1", name: "01-live-mini", seconds: 4, stage: CGSize(width: 1200, height: 400))

    // Feature 02: the race. Safe → fire close → caught → out, 2 s each, one clip
    let race = Clip("02-race.mp4", wide)
    for (state, still) in [("ok", "02-race-1-safe"), ("close", "02-race-2-close"), ("warn", "02-race-3-caught"), ("out", "02-race-4-out")] {
        meter.open("index.html", "state=\(state)")
        let crop = meter.bounds("card", padRight: 8 * ZOOM, padBottom: 8 * ZOOM)
        for i in 0..<Int(2 * FPS) {
            let pos = CGRect(x: (wide.width - crop.width) / 2, y: (wide.height - crop.height) / 2, width: crop.width, height: crop.height)
            let img = compose(wide, [(meterFrame(crop), pos)])
            race.add(img)
            if i == 12 { savePNG(img, "\(still).png") }
            meter.advance(frameMS)
        }
    }
    race.finish()

    // Feature 03: Thinking ×2 → Done (Chat), the bubble popping out of the meter, 3 s each
    let tall = CGSize(width: 1200, height: 1000)
    let status = Clip("03-thinking-done.mp4", tall)
    meter.open("index.html", "state=ok")
    let crop = meter.bounds("card", padRight: 8 * ZOOM, padBottom: 8 * ZOOM)
    for (query, still) in [("state=working&count=2", "03-thinking"), ("state=done&label=Chat", "03-done")] {
        bubblePage.open("bubble.html", query)
        let bcrop = bubblePage.bounds("bubble", padRight: 4 * ZOOM, padBottom: 14 * ZOOM)
        for i in 0..<Int(3 * FPS) {
            let cardPos = CGRect(x: (tall.width - crop.width) / 2, y: tall.height - crop.height - 110, width: crop.width, height: crop.height)
            let bubblePos = CGRect(x: cardPos.minX, y: cardPos.minY - bcrop.height + 6 * ZOOM, width: bcrop.width, height: bcrop.height)
            let img = compose(tall, [(meterFrame(crop), cardPos), (bubblePage.snapshot().cropping(to: bcrop)!, bubblePos)])
            status.add(img)
            if i == 20 { savePNG(img, "\(still).png") }
            meter.advance(frameMS); bubblePage.advance(frameMS)
        }
    }
    status.finish()
    exit(0)
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
// Start from a run-loop timer, not a main-queue block: WebKit answers on the main queue, so waiting inside one would deadlock.
Timer.scheduledTimer(withTimeInterval: 0.1, repeats: false) { _ in run() }
app.run()
