import Foundation

final class T3CodePoller {
    private let client = T3CodeClient()
    private var timer: Timer?
    private var lastThreadId: String?
    var onShell: ((Data) -> Void)?
    var onDisconnected: (() -> Void)?
    var onConnected: (() -> Void)?

    func start() {
        stop()
        let timer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { [weak self] _ in
            self?.tick()
        }
        RunLoop.main.add(timer, forMode: .common)
        self.timer = timer
        tick()
    }

    func stop() {
        timer?.invalidate()
        timer = nil
    }

    func fetchThread(id: String) async throws -> Data {
        lastThreadId = id
        return try await client.getThread(id: id)
    }

    func fetchPreferredThread(from shellData: Data) async throws -> Data? {
        if let lastThreadId {
            return try await client.getThread(id: lastThreadId)
        }
        if let id = firstThreadId(in: shellData) {
            return try await client.getThread(id: id)
        }
        return nil
    }

    private func tick() {
        Task { [weak self] in
            guard let self else { return }
            do {
                let data = try await self.client.getShell()
                await MainActor.run {
                    self.onConnected?()
                    self.remember(from: data)
                    self.onShell?(data)
                }
            } catch {
                await MainActor.run {
                    self.onDisconnected?()
                }
            }
        }
    }

    private func remember(from data: Data) {
        guard let threads = threadObjects(in: data) else { return }
        if let blocked = threads.first(where: { thread in
            (thread["hasPendingApprovals"] as? Bool) == true
                || (thread["hasPendingUserInput"] as? Bool) == true
        }), let id = threadId(blocked) {
            lastThreadId = id
            return
        }
        if lastThreadId == nil, let first = threads.first, let id = threadId(first) {
            lastThreadId = id
        }
    }

    private func firstThreadId(in data: Data) -> String? {
        threadObjects(in: data).flatMap(\.first).flatMap(threadId)
    }

    private func threadObjects(in data: Data) -> [[String: Any]]? {
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return nil
        }
        return json["threads"] as? [[String: Any]]
    }

    private func threadId(_ thread: [String: Any]) -> String? {
        (thread["id"] as? String) ?? (thread["threadId"] as? String)
    }
}
