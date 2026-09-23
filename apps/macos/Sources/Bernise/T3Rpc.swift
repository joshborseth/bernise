import Foundation

/// Effect RPC JSON frames for `orchestration.subscribeShell`.
/// Field names match `@bernise/t3link` (`subscribeShellFrame`, `ackFrame`, `pingFrame`).
enum T3Rpc {
    enum Inbound {
        case chunk(String, [Any])
        case exit(String)
        case pong
        case ping
        case defect
    }

    static func subscribeShell(requestId: String, afterSequence: Int?) -> String? {
        var payload: [String: Any] = [:]
        if let afterSequence {
            payload["afterSequence"] = afterSequence
        }
        return stringify([
            "_tag": "Request",
            "id": requestId,
            "tag": "orchestration.subscribeShell",
            "payload": payload,
            "headers": [String](),
        ])
    }

    static func ack(requestId: String) -> String? {
        stringify([
            "_tag": "Ack",
            "requestId": requestId,
        ])
    }

    static func ping() -> String? {
        stringify(["_tag": "Ping"])
    }

    static func pong() -> String? {
        stringify(["_tag": "Pong"])
    }

    static func decode(_ text: String) -> [Inbound] {
        guard let data = text.data(using: .utf8),
              let json = try? JSONSerialization.jsonObject(with: data)
        else {
            return []
        }
        let frames = json as? [Any] ?? [json]
        return frames.compactMap(decodeFrame)
    }

    private static func decodeFrame(_ value: Any) -> Inbound? {
        guard let object = value as? [String: Any], let tag = object["_tag"] as? String else {
            return nil
        }
        switch tag {
        case "Chunk":
            guard let requestId = requestId(object["requestId"]),
                  let values = object["values"] as? [Any]
            else {
                return nil
            }
            return .chunk(requestId, values)
        case "Exit":
            guard let requestId = requestId(object["requestId"]) else {
                return nil
            }
            return .exit(requestId)
        case "Pong":
            return .pong
        case "Ping":
            return .ping
        case "Defect", "ClientProtocolError":
            return .defect
        default:
            return nil
        }
    }

    private static func requestId(_ value: Any?) -> String? {
        if let text = value as? String, !text.isEmpty {
            return text
        }
        if let number = value as? NSNumber {
            return number.stringValue
        }
        return nil
    }

    private static func stringify(_ body: [String: Any]) -> String? {
        guard JSONSerialization.isValidJSONObject(body),
              let data = try? JSONSerialization.data(withJSONObject: body)
        else {
            return nil
        }
        return String(data: data, encoding: .utf8)
    }
}
