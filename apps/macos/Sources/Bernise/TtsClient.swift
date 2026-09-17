import Foundation

enum TtsClientError: Error {
    case missingKey
    case failed(String)
}

final class TtsClient {
    func speak(_ text: String) async throws -> Data {
        let clipped = String(text.trimmingCharacters(in: .whitespacesAndNewlines).prefix(20_000))
        guard !clipped.isEmpty else {
            throw TtsClientError.failed("Nothing to speak.")
        }
        guard let key = BerniseConfig.ttsKey() else {
            throw TtsClientError.missingKey
        }
        var request = URLRequest(url: BerniseConfig.ttsURL.appendingPathComponent("speak"))
        request.httpMethod = "POST"
        request.timeoutInterval = 60
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("audio/wav", forHTTPHeaderField: "Accept")
        request.setValue(key, forHTTPHeaderField: "X-API-Key")
        request.httpBody = try JSONSerialization.data(withJSONObject: [
            "text": clipped,
            "voice": BerniseConfig.ttsVoice,
        ])
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, (200 ..< 300).contains(http.statusCode) else {
            let detail = String(data: data, encoding: .utf8) ?? "TTS failed"
            throw TtsClientError.failed(detail)
        }
        return data
    }
}
