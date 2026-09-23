import AppKit
import WebKit

final class PetWebView: NSObject, WKScriptMessageHandler, WKUIDelegate, WKNavigationDelegate {
    let webView: WKWebView
    var onReady: (() -> Void)?
    var onTranscript: ((String, String) -> Void)?
    private var ready = false
    private var pointerTimer: Timer?
    private var lastPointerKey: (Int, Int, Int, Int)?

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

    func pushShellStream(_ items: [Any], completion: @escaping (ShellStreamPush) -> Void) {
        let empty = ShellStreamPush(events: [], snapshotSequence: nil, preferredThreadId: nil)
        guard JSONSerialization.isValidJSONObject(items),
              let data = try? JSONSerialization.data(withJSONObject: items)
        else {
            completion(empty)
            return
        }
        let b64 = data.base64EncodedString()
        let fallback = #"{"events":[],"snapshotSequence":null,"preferredThreadId":null}"#
        let script = "window.__bernise ? window.__bernise.pushShellStreamBase64(\"\(b64)\") : '\(fallback)'"
        webView.evaluateJavaScript(script) { result, _ in
            completion(ShellStreamPush.parse(from: result as? String))
        }
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

    func playAction(_ id: String) {
        let escaped = id.replacingOccurrences(of: "\"", with: "")
        webView.evaluateJavaScript("window.__bernise && window.__bernise.playAction(\"\(escaped)\")")
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

    private func startPointerFollow() {
        guard pointerTimer == nil else {
            followMouse(at: NSEvent.mouseLocation)
            return
        }
        let timer = Timer(timeInterval: 1.0 / 60.0, repeats: true) { [weak self] _ in
            self?.followMouse(at: NSEvent.mouseLocation)
        }
        RunLoop.main.add(timer, forMode: .common)
        pointerTimer = timer
        followMouse(at: NSEvent.mouseLocation)
    }

    private func followMouse(at screenPoint: NSPoint) {
        guard ready, let window = webView.window else {
            return
        }
        let windowPoint = window.convertPoint(fromScreen: screenPoint)
        let viewPoint = webView.convert(windowPoint, from: nil)
        let clientX = Double(viewPoint.x)
        let clientY = webView.isFlipped
            ? Double(viewPoint.y)
            : Double(webView.bounds.height - viewPoint.y)
        let screen = NSScreen.screens.first { $0.frame.contains(screenPoint) }
            ?? window.screen
            ?? NSScreen.main
        let viewWidth = Double(screen?.frame.width ?? max(webView.bounds.width, 1))
        let viewHeight = Double(screen?.frame.height ?? max(webView.bounds.height, 1))
        let key = (
            Int((clientX / 2).rounded()),
            Int((clientY / 2).rounded()),
            Int(viewWidth.rounded()),
            Int(viewHeight.rounded())
        )
        if let lastPointerKey, lastPointerKey == key {
            return
        }
        lastPointerKey = key
        let payload: [String: Any] = [
            "clientX": clientX,
            "clientY": clientY,
            "viewWidth": viewWidth,
            "viewHeight": viewHeight,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload),
              let json = String(data: data, encoding: .utf8)
        else {
            return
        }
        webView.evaluateJavaScript("window.__bernise && window.__bernise.setPointer(\(json))")
    }

    func userContentController(_: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else {
            return
        }
        if type == "ready" {
            ready = true
            startPointerFollow()
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
