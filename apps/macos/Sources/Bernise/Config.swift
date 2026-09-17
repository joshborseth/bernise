import AppKit

enum BerniseConfig {
    static var petURL: URL {
        if let raw = ProcessInfo.processInfo.environment["BERNISE_PET_URL"], let url = URL(string: raw) {
            return url
        }
        return URL(string: "http://127.0.0.1:5733")!
    }

    static var stateDir: URL {
        if let raw = ProcessInfo.processInfo.environment["BERNISE_STATE_DIR"] {
            return URL(fileURLWithPath: raw, isDirectory: true)
        }
        return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".bernise", isDirectory: true)
    }

    static var ttsURL: URL {
        if let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_URL"], let url = URL(string: raw) {
            return url
        }
        return URL(string: "http://borseth.ddns.net:7040")!
    }

    static var ttsVoice: String {
        ProcessInfo.processInfo.environment["BERNISE_TTS_VOICE"] ?? "benny2"
    }

    static var t3OriginOverride: URL? {
        ProcessInfo.processInfo.environment["BERNISE_T3CODE_ORIGIN"].flatMap(URL.init(string:))
    }

    static var t3TokenOverride: String? {
        let token = ProcessInfo.processInfo.environment["BERNISE_T3CODE_TOKEN"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let token, !token.isEmpty { return token }
        return nil
    }

    static func ttsKey() -> String? {
        if let env = ProcessInfo.processInfo.environment["BERNISE_TTS_API_KEY"]?.trimmingCharacters(in: .whitespacesAndNewlines), !env.isEmpty {
            return env
        }
        let file = stateDir.appendingPathComponent("tts.key")
        return (try? String(contentsOf: file, encoding: .utf8))?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
