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

    /// When unset, the overlay starts `tts/server.py` and speaks to loopback.
    static var managesLocalTts: Bool {
        let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        return raw == nil || raw?.isEmpty == true
    }

    static var ttsPort: Int {
        if let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_PORT"], let port = Int(raw), (1 ... 65535).contains(port) {
            return port
        }
        return 7041
    }

    static var ttsURL: URL {
        if let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_URL"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty,
           let url = URL(string: raw) {
            return url
        }
        return URL(string: "http://127.0.0.1:\(ttsPort)")!
    }

    static var ttsModel: String {
        let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_MODEL"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let raw, !raw.isEmpty { return raw }
        return "mlx-community/chatterbox-turbo-4bit"
    }

    static func ttsRefAudio() -> String? {
        ProcessInfo.processInfo.environment["BERNISE_TTS_REF_AUDIO"]?
            .trimmingCharacters(in: .whitespacesAndNewlines)
            .nilIfEmpty
    }

    static func ttsScript() -> URL? {
        if let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_SCRIPT"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty {
            return URL(fileURLWithPath: raw)
        }
        let fileManager = FileManager.default
        var roots = [URL(fileURLWithPath: fileManager.currentDirectoryPath)]
        if let executable = Bundle.main.executableURL?.deletingLastPathComponent() {
            var cursor = executable
            for _ in 0 ..< 8 {
                roots.append(cursor)
                cursor.deleteLastPathComponent()
            }
        }
        for root in roots {
            for relative in ["tts/server.py", "apps/macos/tts/server.py"] {
                let url = root.appendingPathComponent(relative)
                if fileManager.fileExists(atPath: url.path) {
                    return url
                }
            }
        }
        return nil
    }

    static func ttsPython(script: URL) -> URL? {
        let fileManager = FileManager.default
        if let raw = ProcessInfo.processInfo.environment["BERNISE_TTS_PYTHON"]?.trimmingCharacters(in: .whitespacesAndNewlines),
           !raw.isEmpty {
            let url = URL(fileURLWithPath: raw)
            if fileManager.isExecutableFile(atPath: url.path) {
                return url
            }
            return nil
        }
        let venv = script
            .deletingLastPathComponent()
            .deletingLastPathComponent()
            .appendingPathComponent(".venv/bin/python")
        if fileManager.isExecutableFile(atPath: venv.path) {
            return venv
        }
        return nil
    }

    static var t3OriginOverride: URL? {
        ProcessInfo.processInfo.environment["BERNISE_T3CODE_ORIGIN"].flatMap(URL.init(string:))
    }

    static var t3TokenOverride: String? {
        let token = ProcessInfo.processInfo.environment["BERNISE_T3CODE_TOKEN"]?.trimmingCharacters(in: .whitespacesAndNewlines)
        if let token, !token.isEmpty { return token }
        return nil
    }
}

private extension String {
    var nilIfEmpty: String? { isEmpty ? nil : self }
}
