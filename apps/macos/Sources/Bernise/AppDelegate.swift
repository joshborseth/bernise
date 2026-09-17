import AppKit

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
    private let overlay = OverlayPanel(
        contentRect: OverlayLayout.defaultFrame,
        styleMask: [.nonactivatingPanel, .borderless],
        backing: .buffered,
        defer: false
    )
    private let pet = PetWebView()
    private let status = StatusItemController()
    private let poller = T3CodePoller()
    private let queue = SpeakQueue()
    private var connected = false
    private var muted = false
    private var mood = "idle"
    private var speakKey = ""
    private var latestShell: Data?

    func applicationDidFinishLaunching(_: Notification) {
        overlay.level = .floating
        overlay.hidesOnDeactivate = false
        overlay.isOpaque = false
        overlay.backgroundColor = .clear
        overlay.hasShadow = false
        overlay.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]
        overlay.contentView = pet.webView
        overlay.onPerchChange = { [weak self] _ in
            self?.applyHost()
        }
        overlay.installInteraction(pet: pet)
        overlay.makeKeyAndOrderFront(nil)

        status.onMute = { [weak self] muted in
            self?.muted = muted
            self?.applyHost()
        }
        status.onReconnect = { [weak self] in
            self?.pet.resetAttention()
            self?.poller.start()
        }
        status.onQuit = {
            NSApp.terminate(nil)
        }
        status.onResetPosition = { [weak self] in
            self?.overlay.resetPosition()
        }
        status.onPlayAction = { [weak self] id in
            self?.pet.playAction(id)
        }

        queue.onStart = { [weak self] speakKey in
            self?.applyHost(mood: "speaking", speakKey: speakKey)
        }
        queue.onIdle = { [weak self] in
            self?.applyHost(mood: "idle", speakKey: "")
        }

        pet.onReady = { [weak self] in
            self?.applyHost()
            self?.poller.start()
        }
        pet.onTranscript = { [weak self] text, intent in
            self?.handleTranscript(text: text, intent: intent)
        }
        poller.onConnected = { [weak self] in
            self?.connected = true
            self?.status.setConnected(true)
            self?.applyHost()
        }
        poller.onDisconnected = { [weak self] in
            self?.connected = false
            self?.status.setConnected(false)
            self?.applyHost(mood: "idle", speakKey: "")
        }
        poller.onShell = { [weak self] data in
            self?.latestShell = data
            self?.handleShell(data)
        }

        pet.loadPet()
    }

    private func applyHost(mood: String? = nil, speakKey: String? = nil) {
        if let mood {
            self.mood = mood
        }
        if let speakKey {
            self.speakKey = speakKey
        }
        pet.setHostState(
            connected: connected,
            muted: muted,
            mood: self.mood,
            speakKey: self.speakKey,
            perch: overlay.perch.rawValue
        )
    }

    private func handleShell(_ data: Data) {
        pet.pushShell(data) { [weak self] events in
            guard let self else { return }
            for event in events {
                self.speak(event: event, shell: data)
            }
        }
    }

    private func speak(event: SpeakEvent, shell: Data) {
        switch event.kind {
        case .needsYou:
            let title = event.title ?? "A thread"
            let text = event.reason == "input"
                ? "\(title) is waiting on you."
                : "\(title) needs approval."
            queue.enqueue(SpeakJob(text: text, priority: .needsYou, speakKey: event.threadId ?? title))
        case .settled:
            let threadId = event.threadId
            Task { [weak self] in
                guard let self else { return }
                if let threadId, let detail = try? await self.poller.fetchThread(id: threadId) {
                    await self.enqueueSummary(detail, key: threadId, priority: .settled)
                    return
                }
                let title = event.title ?? "A thread"
                self.queue.enqueue(
                    SpeakJob(text: "\(title) settled.", priority: .settled, speakKey: title)
                )
            }
        case .settledMany:
            let count = event.count ?? 0
            let word = count == 2 ? "Two" : "\(count)"
            queue.enqueue(
                SpeakJob(text: "\(word) threads settled.", priority: .settled, speakKey: "many-\(count)")
            )
        }
        _ = shell
    }

    private func handleTranscript(text _: String, intent: String) {
        guard intent == "summarize" else {
            queue.enqueue(
                SpeakJob(
                    text: "I only summarize t3code threads right now.",
                    priority: .settled,
                    speakKey: "unknown"
                )
            )
            return
        }
        guard let shell = latestShell else {
            queue.enqueue(
                SpeakJob(text: "t3code is away.", priority: .needsYou, speakKey: "away")
            )
            return
        }
        Task { [weak self] in
            guard let self else { return }
            guard let detail = try? await self.poller.fetchPreferredThread(from: shell) else {
                self.queue.enqueue(
                    SpeakJob(text: "I do not see a thread to summarize.", priority: .settled, speakKey: "empty")
                )
                return
            }
            await self.enqueueSummary(detail, key: "summary", priority: .needsYou)
        }
    }

    private func enqueueSummary(_ detail: Data, key: String, priority: SpeakPriority) async {
        await withCheckedContinuation { continuation in
            pet.summarize(detail) { [weak self] brief in
                self?.queue.enqueue(SpeakJob(text: brief, priority: priority, speakKey: key))
                continuation.resume()
            }
        }
    }
}

@main
enum BerniseApp {
    private static var delegate: AppDelegate?

    static func main() {
        let app = NSApplication.shared
        app.setActivationPolicy(.accessory)
        let delegate = AppDelegate()
        BerniseApp.delegate = delegate
        app.delegate = delegate
        app.run()
    }
}
