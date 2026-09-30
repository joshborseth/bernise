import Foundation

/// Starts the on-Mac Chatterbox Turbo process and waits until `/health` is ready.
final class LocalTtsServer: @unchecked Sendable {
    static let shared = LocalTtsServer()

    private let lock = NSLock()
    private var process: Process?
    private var ownsProcess = false
    private var becameReady = false
    private var startTask: Task<Void, Error>?

    private init() {}

    func prepare() {
        _ = readyTask()
    }

    func ensureReady() async throws {
        if shouldRestart() {
            lock.lock()
            startTask = nil
            becameReady = false
            lock.unlock()
        }
        try await readyTask().value
    }

    func stop() {
        lock.lock()
        let owned = ownsProcess ? process : nil
        ownsProcess = false
        process = nil
        lock.unlock()
        owned?.terminate()
    }

    private func readyTask() -> Task<Void, Error> {
        lock.lock()
        if startTask == nil {
            startTask = Task { try await self.boot() }
        }
        let task = startTask!
        lock.unlock()
        return task
    }

    private func boot() async throws {
        if await healthy() {
            return
        }
        guard BerniseConfig.managesLocalTts else {
            throw TtsClientError.failed("Local speech is not running.")
        }
        guard let script = BerniseConfig.ttsScript() else {
            throw TtsClientError.failed("Could not find apps/macos/tts/server.py.")
        }
        guard let python = BerniseConfig.ttsPython(script: script) else {
            throw TtsClientError.failed(
                "Create the speech environment with: python3 -m venv apps/macos/.venv && apps/macos/.venv/bin/pip install -r apps/macos/tts/requirements.txt"
            )
        }

        let process = Process()
        process.executableURL = python
        process.arguments = [script.path]
        var env = ProcessInfo.processInfo.environment
        env["BERNISE_TTS_PORT"] = String(BerniseConfig.ttsPort)
        env["BERNISE_TTS_MODEL"] = BerniseConfig.ttsModel
        env["BERNISE_TTS_WATCH_PARENT"] = "1"
        if let ref = BerniseConfig.ttsRefAudio() {
            env["BERNISE_TTS_REF_AUDIO"] = ref
        } else {
            env.removeValue(forKey: "BERNISE_TTS_REF_AUDIO")
        }
        env.removeValue(forKey: "BERNISE_TTS_FAKE")
        process.environment = env

        print("Bernise speech: starting \(python.path)")
        do {
            try process.run()
        } catch {
            throw TtsClientError.failed("Could not start local speech: \(error.localizedDescription)")
        }

        lock.lock()
        self.process = process
        self.ownsProcess = true
        lock.unlock()

        let deadline = Date().addingTimeInterval(600)
        while Date() < deadline {
            if !process.isRunning {
                throw TtsClientError.failed("Local speech exited before it was ready.")
            }
            if await healthy() {
                self.markReady()
                return
            }
            try await Task.sleep(nanoseconds: 500_000_000)
        }
        throw TtsClientError.failed("Local speech did not become ready.")
    }

    private func markReady() {
        lock.lock()
        becameReady = true
        lock.unlock()
    }

    /// Relaunch only after a server we started has already served speech and then exited.
    private func shouldRestart() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        guard becameReady, ownsProcess else { return false }
        return process?.isRunning != true
    }

    private func healthy() async -> Bool {
        var request = URLRequest(url: BerniseConfig.ttsURL.appendingPathComponent("health"))
        request.httpMethod = "GET"
        request.timeoutInterval = 2
        guard let (_, response) = try? await URLSession.shared.data(for: request),
              let http = response as? HTTPURLResponse
        else {
            return false
        }
        return (200 ..< 300).contains(http.statusCode)
    }
}
