import Foundation

struct T3CodeSettings: Codable {
    var origin: String?
    var accessToken: String?
}

struct SpeakEvent: Equatable {
    enum Kind: String {
        case needsYou
        case settled
        case settledMany
    }

    var kind: Kind
    var threadId: String?
    var title: String?
    var reason: String?
    var count: Int?
}

enum T3CodeClientError: Error, Equatable {
    case disconnected
    case unauthorized
    case badResponse
}

final class T3CodeClient {
    private let session: URLSession
    private let decoder = JSONDecoder()

    init(session: URLSession = .shared) {
        self.session = session
    }

    func loadSettings() -> T3CodeSettings {
        let url = BerniseConfig.stateDir.appendingPathComponent("t3code.json")
        guard let data = try? Data(contentsOf: url),
              let settings = try? decoder.decode(T3CodeSettings.self, from: data)
        else {
            return T3CodeSettings()
        }
        return settings
    }

    func origin(settings: T3CodeSettings) -> URL {
        if let override = BerniseConfig.t3OriginOverride {
            return override
        }
        if let raw = settings.origin, let url = URL(string: raw) {
            return url
        }
        if let runtime = readRuntimeOrigin() {
            return runtime
        }
        return URL(string: "http://127.0.0.1:3773")!
    }

    func token(settings: T3CodeSettings) -> String? {
        BerniseConfig.t3TokenOverride ?? settings.accessToken?.nilIfEmpty
    }

    func getThread(id: String) async throws -> Data {
        let encoded = id.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed) ?? id
        return try await request(method: "GET", path: "/api/orchestration/threads/\(encoded)")
    }

    func webSocketTicket() async throws -> String {
        let data = try await request(method: "POST", path: "/api/auth/websocket-ticket")
        guard let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ticket = json["ticket"] as? String,
              !ticket.isEmpty
        else {
            throw T3CodeClientError.badResponse
        }
        return ticket
    }

    /// Matches `shellSocketURL` in `@bernise/t3link`.
    func webSocketURL(ticket: String) throws -> URL {
        let settings = loadSettings()
        let origin = origin(settings: settings)
        guard var components = URLComponents(url: origin, resolvingAgainstBaseURL: false) else {
            throw T3CodeClientError.disconnected
        }
        switch components.scheme?.lowercased() {
        case "https", "wss":
            components.scheme = "wss"
        default:
            components.scheme = "ws"
        }
        components.path = "/ws"
        components.queryItems = [URLQueryItem(name: "wsTicket", value: ticket)]
        guard let url = components.url else {
            throw T3CodeClientError.disconnected
        }
        return url
    }

    private func request(method: String, path: String) async throws -> Data {
        let settings = loadSettings()
        let origin = origin(settings: settings)
        guard var components = URLComponents(url: origin, resolvingAgainstBaseURL: false) else {
            throw T3CodeClientError.disconnected
        }
        components.path = path
        guard let url = components.url else {
            throw T3CodeClientError.disconnected
        }
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 5
        if method == "POST" {
            request.httpBody = Data()
        }
        if let token = token(settings: settings) {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }
        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await session.data(for: request)
        } catch {
            throw T3CodeClientError.disconnected
        }
        guard let http = response as? HTTPURLResponse else {
            throw T3CodeClientError.disconnected
        }
        if http.statusCode == 401 || http.statusCode == 403 {
            throw T3CodeClientError.unauthorized
        }
        guard (200 ..< 300).contains(http.statusCode) else {
            throw T3CodeClientError.badResponse
        }
        return data
    }

    private func readRuntimeOrigin() -> URL? {
        let envDir = ProcessInfo.processInfo.environment["T3CODE_STATE_DIR"]
        let base: URL
        if let envDir {
            base = URL(fileURLWithPath: envDir, isDirectory: true)
        } else {
            base = FileManager.default.homeDirectoryForCurrentUser
                .appendingPathComponent(".t3", isDirectory: true)
                .appendingPathComponent("userdata", isDirectory: true)
        }
        let file = base.appendingPathComponent("server-runtime.json")
        guard let data = try? Data(contentsOf: file),
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return nil
        }
        if let origin = json["origin"] as? String, let url = URL(string: origin) {
            return url
        }
        if let port = json["port"] as? Int {
            return URL(string: "http://127.0.0.1:\(port)")
        }
        return nil
    }
}

extension SpeakEvent {
    static func parseList(from json: String) -> [SpeakEvent] {
        guard let data = json.data(using: .utf8),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [Any]
        else {
            return []
        }
        return raw.compactMap { item in
            guard let object = item as? [String: Any], let kindRaw = object["kind"] as? String,
                  let kind = Kind(rawValue: kindRaw)
            else {
                return nil
            }
            return SpeakEvent(
                kind: kind,
                threadId: object["threadId"] as? String,
                title: object["title"] as? String,
                reason: object["reason"] as? String,
                count: object["count"] as? Int
            )
        }
    }
}

struct ShellStreamPush {
    var events: [SpeakEvent]
    var snapshotSequence: Int?
    var preferredThreadId: String?

    static func parse(from json: String?) -> ShellStreamPush {
        guard let json,
              let data = json.data(using: .utf8),
              let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any]
        else {
            return ShellStreamPush(events: [], snapshotSequence: nil, preferredThreadId: nil)
        }
        let events: [SpeakEvent]
        if let raw = object["events"],
           JSONSerialization.isValidJSONObject(raw),
           let encoded = try? JSONSerialization.data(withJSONObject: raw),
           let text = String(data: encoded, encoding: .utf8)
        {
            events = SpeakEvent.parseList(from: text)
        } else {
            events = []
        }
        let sequence = object["snapshotSequence"] as? NSNumber
        let preferred = object["preferredThreadId"] as? String
        return ShellStreamPush(
            events: events,
            snapshotSequence: sequence?.intValue,
            preferredThreadId: preferred
        )
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
