import AppKit

final class StatusItemController {
    private let item: NSStatusItem
    var muted = false
    var connected = false
    var onMute: ((Bool) -> Void)?
    var onReconnect: (() -> Void)?
    var onQuit: (() -> Void)?
    var onMove: (() -> Void)?

    init() {
        item = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        if let button = item.button {
            button.title = "Bernise"
        }
        rebuild()
    }

    func setConnected(_ value: Bool) {
        connected = value
        rebuild()
    }

    private func rebuild() {
        let menu = NSMenu()
        let status = NSMenuItem(
            title: connected ? "t3code connected" : "t3code is away",
            action: nil,
            keyEquivalent: ""
        )
        status.isEnabled = false
        menu.addItem(status)
        let mute = NSMenuItem(
            title: muted ? "Unmute" : "Mute",
            action: #selector(toggleMute),
            keyEquivalent: "m"
        )
        mute.target = self
        menu.addItem(mute)
        let move = NSMenuItem(title: "Allow drag", action: #selector(movePet), keyEquivalent: "")
        move.target = self
        menu.addItem(move)
        let reconnect = NSMenuItem(title: "Reconnect", action: #selector(reconnect), keyEquivalent: "r")
        reconnect.target = self
        menu.addItem(reconnect)
        menu.addItem(.separator())
        let quit = NSMenuItem(title: "Quit Bernise", action: #selector(quit), keyEquivalent: "q")
        quit.target = self
        menu.addItem(quit)
        item.menu = menu
    }

    @objc private func toggleMute() {
        muted.toggle()
        onMute?(muted)
        rebuild()
    }

    @objc private func reconnect() {
        onReconnect?()
    }

    @objc private func quit() {
        onQuit?()
    }

    @objc private func movePet() {
        onMove?()
    }
}
