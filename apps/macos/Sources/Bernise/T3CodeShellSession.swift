import Foundation

/// Live `orchestration.subscribeShell` session. Replaces the one-second shell poll.
final class T3CodeShellSession {
    private let client = T3CodeClient()
    private let stateLock = NSLock()
    private let socketLock = NSLock()
    private var cursor = Cursor()
    private var socket: URLSessionWebSocketTask?
    private var runTask: Task<Void, Never>?

    var onItems: (([Any], Int, @escaping (ShellStreamPush) -> Void) -> Void)?
    var onDisconnected: (() -> Void)?
    var onConnected: (() -> Void)?

    func start() {
        let generation = bump(resetCursor: true)
        launch(generation)
    }

    func stop() {
        _ = bump(resetCursor: false)
        runTask?.cancel()
        runTask = nil
        cancelSocket()
    }

    func fetchThread(id: String) async throws -> Data {
        try await client.getThread(id: id)
    }

    func preferredThreadId() -> String? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return cursor.preferredThreadId
    }

    func notePush(_ push: ShellStreamPush, generation: Int) {
        stateLock.lock()
        defer { stateLock.unlock() }
        guard cursor.generation == generation else { return }
        cursor.snapshotSequence = push.snapshotSequence
        cursor.preferredThreadId = push.preferredThreadId
    }

    private func launch(_ generation: Int) {
        runTask?.cancel()
        cancelSocket()
        runTask = Task.detached { [weak self] in
            await self?.loop(generation: generation)
        }
    }

    private func loop(generation: Int) async {
        var attempt = 0
        while isCurrent(generation), !Task.isCancelled {
            let flags = ConnectFlags()
            var failure: Error?
            do {
                try await connect(generation: generation, flags: flags)
            } catch {
                failure = error
            }
            if !isCurrent(generation) || Task.isCancelled {
                return
            }
            await MainActor.run { [weak self] in
                self?.onDisconnected?()
            }
            if !isCurrent(generation) || Task.isCancelled {
                return
            }
            let delay = retryDelay(failure: failure, opened: flags.opened, attempt: &attempt)
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
        }
    }

    private func connect(generation: Int, flags: ConnectFlags) async throws {
        let ticket = try await client.webSocketTicket()
        guard isCurrent(generation) else { throw T3SocketEnded() }
        let url = try client.webSocketURL(ticket: ticket)
        let task = URLSession.shared.webSocketTask(with: url)
        install(task)
        guard isCurrent(generation) else {
            task.cancel(with: .goingAway, reason: nil)
            throw T3SocketEnded()
        }
        task.resume()
        guard let hello = T3Rpc.subscribeShell(requestId: Self.requestId, afterSequence: resumeSequence()) else {
            throw T3CodeClientError.badResponse
        }
        try await task.send(.string(hello))
        flags.opened = true
        await MainActor.run { [weak self] in
            guard self?.isCurrent(generation) == true else { return }
            self?.onConnected?()
        }
        let watch = PongWatch()
        try await withThrowingTaskGroup(of: Void.self) { group in
            group.addTask { [weak self] in
                guard let self else { return }
                try await self.receive(task: task, watch: watch, generation: generation)
            }
            group.addTask { [weak self] in
                guard let self else { return }
                try await self.watchPing(task: task, watch: watch, generation: generation)
            }
            do {
                try await group.next()
            } catch {
                group.cancelAll()
                try? await group.waitForAll()
                throw error
            }
            group.cancelAll()
            try? await group.waitForAll()
        }
    }

    private func receive(
        task: URLSessionWebSocketTask,
        watch: PongWatch,
        generation: Int
    ) async throws {
        while isCurrent(generation), !Task.isCancelled {
            let message: URLSessionWebSocketTask.Message
            do {
                message = try await task.receive()
            } catch {
                if Task.isCancelled || !isCurrent(generation) {
                    return
                }
                throw T3SocketEnded()
            }
            let text: String
            switch message {
            case let .string(value):
                text = value
            case let .data(data):
                guard let value = String(data: data, encoding: .utf8) else { continue }
                text = value
            @unknown default:
                continue
            }
            for inbound in T3Rpc.decode(text) {
                switch inbound {
                case .pong:
                    watch.received()
                case .ping:
                    if let frame = T3Rpc.pong() {
                        try await task.send(.string(frame))
                    }
                case let .chunk(requestId, values):
                    guard requestId == Self.requestId else { continue }
                    if let frame = T3Rpc.ack(requestId: requestId) {
                        try await task.send(.string(frame))
                    }
                    await deliver(values: values, generation: generation)
                case .exit, .defect:
                    throw T3SocketEnded()
                }
            }
        }
    }

    /// Effect's socket client pings every 5s and drops the connection if the previous ping was not answered.
    private func watchPing(
        task: URLSessionWebSocketTask,
        watch: PongWatch,
        generation: Int
    ) async throws {
        while isCurrent(generation), !Task.isCancelled {
            do {
                try await Task.sleep(nanoseconds: 5_000_000_000)
            } catch {
                return
            }
            guard isCurrent(generation), !Task.isCancelled else { return }
            if !watch.beginPing() {
                task.cancel(with: .goingAway, reason: nil)
                throw T3SocketEnded()
            }
            guard let frame = T3Rpc.ping() else { return }
            do {
                try await task.send(.string(frame))
            } catch {
                if Task.isCancelled || !isCurrent(generation) {
                    return
                }
                throw T3SocketEnded()
            }
        }
    }

    private func deliver(values: [Any], generation: Int) async {
        await withCheckedContinuation { continuation in
            Task { @MainActor [weak self] in
                guard let self, let onItems = self.onItems else {
                    continuation.resume()
                    return
                }
                onItems(values, generation) {
                    continuation.resume()
                }
            }
        }
    }

    private func retryDelay(failure: Error?, opened: Bool, attempt: inout Int) -> Double {
        if (failure as? T3CodeClientError) == .unauthorized {
            return 2
        }
        if opened {
            attempt = 0
            return 0.5
        }
        let delay = min(5, 0.5 * pow(2, Double(attempt)))
        attempt += 1
        return delay
    }

    private func bump(resetCursor: Bool) -> Int {
        stateLock.lock()
        defer { stateLock.unlock() }
        cursor.generation += 1
        if resetCursor {
            cursor.snapshotSequence = nil
            cursor.preferredThreadId = nil
        }
        return cursor.generation
    }

    private func isCurrent(_ generation: Int) -> Bool {
        stateLock.lock()
        defer { stateLock.unlock() }
        return cursor.generation == generation
    }

    private func resumeSequence() -> Int? {
        stateLock.lock()
        defer { stateLock.unlock() }
        return cursor.snapshotSequence
    }

    private func install(_ task: URLSessionWebSocketTask) {
        socketLock.lock()
        let previous = socket
        socket = task
        socketLock.unlock()
        previous?.cancel(with: .goingAway, reason: nil)
    }

    private func cancelSocket() {
        socketLock.lock()
        let previous = socket
        socket = nil
        socketLock.unlock()
        previous?.cancel(with: .goingAway, reason: nil)
    }

    private static let requestId = "1"
}

private struct Cursor {
    var generation = 0
    var snapshotSequence: Int?
    var preferredThreadId: String?
}

private struct T3SocketEnded: Error {}

private final class ConnectFlags: @unchecked Sendable {
    var opened = false
}

private final class PongWatch: @unchecked Sendable {
    private let lock = NSLock()
    private var awaiting = false

    func beginPing() -> Bool {
        lock.lock()
        defer { lock.unlock() }
        if awaiting {
            return false
        }
        awaiting = true
        return true
    }

    func received() {
        lock.lock()
        awaiting = false
        lock.unlock()
    }
}
