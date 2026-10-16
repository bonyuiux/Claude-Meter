import Cocoa
import WebKit
let html = "<html><body style='margin:0;background:#000'><div id=f style='color:#fff;font:40px sans-serif'>0</div><script>let n=0;setInterval(()=>{n++;f.textContent=n},150)</script></body></html>"
final class D: NSObject, WKNavigationDelegate {
  let web = WKWebView(frame: NSRect(x: 0, y: 0, width: 300, height: 100))
  func go() { web.navigationDelegate = self; web.loadHTMLString(html, baseURL: nil) }
  func webView(_ w: WKWebView, didFinish n: WKNavigation!) {
    DispatchQueue.main.asyncAfter(deadline: .now() + 3) {
      self.web.evaluateJavaScript("n") { v, _ in
        print("frames after 3s (expect ~20):", v ?? "nil")
        self.web.takeSnapshot(with: nil) { img, err in print("snapshot:", img != nil ? "ok \(img!.size)" : "fail \(String(describing: err))"); exit(0) }
      }
    }
  }
}
let app = NSApplication.shared; app.setActivationPolicy(.prohibited)
let d = D(); d.go(); app.run()
