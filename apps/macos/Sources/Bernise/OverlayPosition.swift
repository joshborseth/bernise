import AppKit

enum OverlayPerch: String {
    case none
    case left
    case right
    case top
    case bottom
}

enum OverlayLayout {
    static let defaultFrame = NSRect(x: 40, y: 80, width: 360, height: 420)
    /// How close the cat has to be to a screen edge before that edge wins.
    static let snapDistance: CGFloat = 120
    /// Keep this much of the panel on-screen while dragging so he can reach the bezel.
    static let minVisible: CGFloat = 88
    /// Fraction of the panel that stays on-screen when perched.
    static let peekOnscreen: CGFloat = 0.46
}

struct OverlayPlacement {
    var origin: NSPoint
    var perch: OverlayPerch
}

enum OverlayPosition {
    static var file: URL {
        BerniseConfig.stateDir.appendingPathComponent("overlay.json")
    }

    static func load() -> OverlayPlacement? {
        guard let data = try? Data(contentsOf: file),
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let x = number(obj["x"]),
              let y = number(obj["y"])
        else {
            return nil
        }
        let perch = OverlayPerch(rawValue: obj["perch"] as? String ?? "") ?? .none
        return OverlayPlacement(origin: NSPoint(x: x, y: y), perch: perch)
    }

    static func save(_ placement: OverlayPlacement) {
        try? FileManager.default.createDirectory(at: BerniseConfig.stateDir, withIntermediateDirectories: true)
        let payload: [String: Any] = [
            "x": placement.origin.x,
            "y": placement.origin.y,
            "perch": placement.perch.rawValue,
        ]
        guard let data = try? JSONSerialization.data(withJSONObject: payload) else {
            return
        }
        try? data.write(to: file, options: .atomic)
    }

    static func clamp(_ frame: NSRect, mouse: NSPoint? = nil) -> NSRect {
        clamp(frame, mouse: mouse, hang: false)
    }

    static func clampDrag(_ frame: NSRect, mouse: NSPoint? = nil) -> NSRect {
        clamp(frame, mouse: mouse, hang: true)
    }

    static func detectPerch(_ frame: NSRect, mouse: NSPoint? = nil) -> OverlayPerch {
        guard let bounds = screenBounds(for: frame, mouse: mouse) else {
            return .none
        }
        let cat = catCenter(in: frame)
        let distances: [(OverlayPerch, CGFloat)] = [
            (.left, cat.x - bounds.minX),
            (.right, bounds.maxX - cat.x),
            (.bottom, cat.y - bounds.minY),
            (.top, bounds.maxY - cat.y),
        ]
        guard let best = distances.min(by: { $0.1 < $1.1 }), best.1 <= OverlayLayout.snapDistance else {
            return .none
        }
        return best.0
    }

    static func pinnedFrame(
        perch: OverlayPerch,
        along: CGFloat,
        size: NSSize,
        mouse: NSPoint? = nil,
        hint: NSRect? = nil
    ) -> NSRect {
        guard perch != .none else {
            return clamp(NSRect(origin: OverlayLayout.defaultFrame.origin, size: size), mouse: mouse)
        }
        let probe = hint ?? NSRect(origin: NSPoint(x: along, y: along), size: size)
        guard let bounds = screenBounds(for: probe, mouse: mouse) else {
            return NSRect(origin: .zero, size: size)
        }
        let hang = sizeAlong(perch: perch, size: size) * (1 - OverlayLayout.peekOnscreen)
        var next = NSRect(origin: .zero, size: size)
        switch perch {
        case .left:
            next.origin.x = bounds.minX - hang
            next.origin.y = clampOrigin(along, min: bounds.minY, max: bounds.maxY - size.height)
        case .right:
            next.origin.x = bounds.maxX - size.width + hang
            next.origin.y = clampOrigin(along, min: bounds.minY, max: bounds.maxY - size.height)
        case .bottom:
            next.origin.y = bounds.minY - hang
            next.origin.x = clampOrigin(along, min: bounds.minX, max: bounds.maxX - size.width)
        case .top:
            next.origin.y = bounds.maxY - size.height + hang
            next.origin.x = clampOrigin(along, min: bounds.minX, max: bounds.maxX - size.width)
        case .none:
            break
        }
        return next
    }

    static func along(for frame: NSRect, perch: OverlayPerch) -> CGFloat {
        switch perch {
        case .left, .right, .none:
            return frame.minY
        case .top, .bottom:
            return frame.minX
        }
    }

    static func unpin(_ frame: NSRect, perch: OverlayPerch, mouse: NSPoint? = nil) -> NSRect {
        guard perch != .none, let bounds = screenBounds(for: frame, mouse: mouse) else {
            return clamp(frame, mouse: mouse)
        }
        var next = frame
        switch perch {
        case .left:
            next.origin.x = bounds.minX
        case .right:
            next.origin.x = bounds.maxX - frame.width
        case .bottom:
            next.origin.y = bounds.minY
        case .top:
            next.origin.y = bounds.maxY - frame.height
        case .none:
            break
        }
        return clampDrag(next, mouse: mouse)
    }

    static func frame(from placement: OverlayPlacement, size: NSSize, mouse: NSPoint? = nil) -> NSRect {
        if placement.perch == .none {
            return clamp(NSRect(origin: placement.origin, size: size), mouse: mouse)
        }
        let hint = NSRect(origin: placement.origin, size: size)
        return pinnedFrame(
            perch: placement.perch,
            along: along(for: hint, perch: placement.perch),
            size: size,
            mouse: mouse,
            hint: hint
        )
    }

    private static func sizeAlong(perch: OverlayPerch, size: NSSize) -> CGFloat {
        switch perch {
        case .left, .right:
            return size.width
        case .top, .bottom:
            return size.height
        case .none:
            return 0
        }
    }

    private static func clamp(_ frame: NSRect, mouse: NSPoint?, hang: Bool) -> NSRect {
        guard let bounds = screenBounds(for: frame, mouse: mouse) else {
            return frame
        }
        let inset = hang ? OverlayLayout.minVisible : min(frame.width, frame.height)
        var next = frame
        next.origin.x = clampOrigin(
            next.origin.x,
            min: bounds.minX - (hang ? frame.width - inset : 0),
            max: bounds.maxX - (hang ? inset : frame.width)
        )
        next.origin.y = clampOrigin(
            next.origin.y,
            min: bounds.minY - (hang ? frame.height - inset : 0),
            max: bounds.maxY - (hang ? inset : frame.height)
        )
        return next
    }

    private static func catCenter(in frame: NSRect) -> NSPoint {
        NSPoint(x: frame.minX + frame.width * 0.5, y: frame.minY + frame.height * 0.44)
    }

    private static func screenBounds(for frame: NSRect, mouse: NSPoint?) -> NSRect? {
        let screens = NSScreen.screens
        let screen = screenFor(frame: frame, mouse: mouse, screens: screens) ?? NSScreen.main
        return screen?.frame
    }

    private static func screenFor(frame: NSRect, mouse: NSPoint?, screens: [NSScreen]) -> NSScreen? {
        if let mouse, let hit = screens.first(where: { $0.frame.contains(mouse) }) {
            return hit
        }
        if let hit = screens.first(where: { $0.frame.intersects(frame) }) {
            return hit
        }
        return nil
    }

    private static func clampOrigin(_ value: CGFloat, min: CGFloat, max: CGFloat) -> CGFloat {
        if max < min {
            return min
        }
        return Swift.min(Swift.max(value, min), max)
    }

    private static func number(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }
}
