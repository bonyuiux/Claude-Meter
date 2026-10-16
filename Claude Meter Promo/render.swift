// Renders index.html to an MP4, frame by frame (no screen recording, so every frame is exact).
// Run ./render.sh
import Cocoa
import WebKit
import AVFoundation

let folder = URL(fileURLWithPath: CommandLine.arguments[1])
let output = folder.appendingPathComponent("claude-meter-promo.mp4")
let W = 1080, H = 1350, FPS: Int32 = 30, DURATION = 20

final class Renderer: NSObject, WKNavigationDelegate {
    let web: WKWebView
    var writer: AVAssetWriter!
    var input: AVAssetWriterInput!
    var adaptor: AVAssetWriterInputPixelBufferAdaptor!
    var frame = 0
    let total = Int(FPS) * DURATION

    override init() {
        let cfg = WKWebViewConfiguration()
        // tells promo.js not to start its own playback loop
        cfg.userContentController.addUserScript(WKUserScript(source: "window.__export = true", injectionTime: .atDocumentStart, forMainFrameOnly: true))
        web = WKWebView(frame: NSRect(x: 0, y: 0, width: W, height: H), configuration: cfg)
        super.init()
        web.navigationDelegate = self
    }

    func start() {
        try? FileManager.default.removeItem(at: output)
        writer = try! AVAssetWriter(outputURL: output, fileType: .mp4)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.h264, AVVideoWidthKey: W, AVVideoHeightKey: H,
            AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 14_000_000,
                                              AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel],
        ])
        input.expectsMediaDataInRealTime = false
        adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [
            kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
            kCVPixelBufferWidthKey as String: W, kCVPixelBufferHeightKey as String: H,
        ])
        writer.add(input)
        writer.startWriting()
        writer.startSession(atSourceTime: .zero)
        let page = folder.appendingPathComponent("index.html")
        web.loadFileURL(page, allowingReadAccessTo: folder)
    }

    func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
        web.callAsyncJavaScript("await window.__ready; return 1", arguments: [:], in: nil, in: .page) { _ in
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { self.next() }   // let the fonts settle
        }
    }

    func next() {
        if frame >= total { finish(); return }
        web.callAsyncJavaScript("return window.__frame(i)", arguments: ["i": frame], in: nil, in: .page) { result in
            guard case .success(let value) = result, let url = value as? String,
                  let comma = url.firstIndex(of: ","), let data = Data(base64Encoded: String(url[url.index(after: comma)...])),
                  let src = CGImageSourceCreateWithData(data as CFData, nil),
                  let image = CGImageSourceCreateImageAtIndex(src, 0, nil) else { print("frame \(self.frame) failed"); exit(1) }
            self.append(image)
            self.frame += 1
            if self.frame % 60 == 0 { print("rendered \(self.frame / Int(FPS))s of \(DURATION)s") }
            self.next()
        }
    }

    func append(_ image: CGImage) {
        var buffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &buffer)
        guard let pb = buffer else { return }
        CVPixelBufferLockBaseAddress(pb, [])
        let ctx = CGContext(data: CVPixelBufferGetBaseAddress(pb), width: W, height: H, bitsPerComponent: 8,
                            bytesPerRow: CVPixelBufferGetBytesPerRow(pb), space: CGColorSpaceCreateDeviceRGB(),
                            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue)!
        ctx.draw(image, in: CGRect(x: 0, y: 0, width: W, height: H))
        CVPixelBufferUnlockBaseAddress(pb, [])
        while !input.isReadyForMoreMediaData { RunLoop.current.run(until: Date().addingTimeInterval(0.005)) }
        adaptor.append(pb, withPresentationTime: CMTime(value: CMTimeValue(frame), timescale: FPS))
    }

    func finish() {
        input.markAsFinished()
        writer.finishWriting {
            print(self.writer.status == .completed ? "Saved \(output.path)" : "Failed: \(String(describing: self.writer.error))")
            exit(self.writer.status == .completed ? 0 : 1)
        }
    }
}

let app = NSApplication.shared
app.setActivationPolicy(.prohibited)
let renderer = Renderer()
renderer.start()
app.run()
