import AppKit
import WebKit

final class PetWebView: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    let webView: WKWebView
    var onReady: (() -> Void)?
    var onTranscript: ((String, String) -> Void)?
    private var ready = false

    override init() {
        let config = WKWebViewConfiguration()
        config.preferences.setValue(true, forKey: "developerExtrasEnabled")
        let controller = config.userContentController
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        controller.add(self, name: "bernise")
        webView.setValue(false, forKey: "drawsBackground")
        webView.underPageBackgroundColor = .clear
        webView.uiDelegate = self
        webView.navigationDelegate = self
        webView.allowsMagnification = false
    }

    func loadPet() {
        webView.load(URLRequest(url: BerniseConfig.petURL))
    }

    func setHostState(connected: Bool, muted: Bool, mood: String, speakKey: String, perch: String) {
        let payload: [String: Any] = [
            "connected": connected,
            "muted": muted,
            "mood": mood,
            "speakKey": speakKey,
            "perch": perch,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else { return }
        webView.evaluateJavaScript("window.__bernise && window.__bernise.setHostState(\(json))")
    }

    func pushShell(_ data: Data, completion: @escaping ([SpeakEvent]) -> Void) {
        let b64 = data.base64EncodedString()
        let script = "window.__bernise ? window.__bernise.pushShellBase64(\"\(b64)\") : '[]'"
        webView.evaluateJavaScript(script) { result, _ in
            let raw = result as? String ?? "[]"
            completion(SpeakEvent.parseList(from: raw))
        }
    }

    func summarize(_ data: Data, completion: @escaping (String) -> Void) {
        let b64 = data.base64EncodedString()
        let script = "window.__bernise ? window.__bernise.summarizeBase64(\"\(b64)\") : 'I could not read that thread.'"
        webView.evaluateJavaScript(script) { result, _ in
            completion(result as? String ?? "I could not read that thread.")
        }
    }

    func resetAttention() {
        webView.evaluateJavaScript("window.__bernise && window.__bernise.resetAttention()")
    }

    func hitTestBody(clientX: CGFloat, clientY: CGFloat, completion: @escaping (Bool) -> Void) {
        let script = String(
            format: "Boolean(window.__bernise && window.__bernise.hitTest(%.2f, %.2f))",
            Double(clientX),
            Double(clientY)
        )
        webView.evaluateJavaScript(script) { result, _ in
            completion(Self.jsBool(result))
        }
    }

    func setPointer(x: Double, y: Double) {
        let script = String(
            format: "window.__bernise && window.__bernise.setPointer(%.4f, %.4f)",
            x,
            y
        )
        webView.evaluateJavaScript(script, completionHandler: nil)
    }

    func requestAction(_ action: String) {
        webView.evaluateJavaScript(
            "window.__bernise && window.__bernise.requestAction(\"\(action)\")"
        )
    }

    private static func jsBool(_ result: Any?) -> Bool {
        if let value = result as? Bool {
            return value
        }
        if let number = result as? NSNumber {
            return number.boolValue
        }
        return false
    }

    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            return
        }
        if type == "ready" {
            ready = true
            onReady?()
            return
        }
        if type == "transcript", let text = body["text"] as? String {
            let intent = body["intent"] as? String ?? "unknown"
            onTranscript?(text, intent)
        }
    }

    func webView(
        _: WKWebView,
        requestMediaCapturePermissionFor _: WKSecurityOrigin,
        initiatedByFrame _: WKFrameInfo,
        type _: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        decisionHandler(.grant)
    }
}
