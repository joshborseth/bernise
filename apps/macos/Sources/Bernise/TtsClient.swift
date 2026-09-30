import Foundation

enum TtsClientError: Error, CustomStringConvertible {
    case failed(String)

    var description: String {
        switch self {
        case let .failed(detail):
            detail
        }
    }
}

final class TtsClient {
    func speak(_ text: String) async throws -> Data {
        let clipped = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20_000))
        guard !clipped.isEmpty else {
            throw TtsClientError.failed("Nothing to speak.")
        }
        try await LocalTtsServer.shared.ensureReady()
        var request = URLRequest(url: BerniseConfig.ttsURL.appendingPathComponent("speak"))
        request.httpMethod = "POST"
        request.timeoutInterval = 120
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("audio/wav", forHTTPHeaderField: "Accept")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "text": clipped,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "Speech failed."
            throw TtsClientError.failed(detail)
        }
        return data
    }
}
