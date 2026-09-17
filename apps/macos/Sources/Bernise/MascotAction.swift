import AppKit

enum MascotAction: String, CaseIterable {
    case sleep
    case wake
    case litter
    case bite
    case hiss

    var title: String {
        switch self {
        case .sleep:
            return "Sleep"
        case .wake:
            return "Wake"
        case .litter:
            return "Litter box"
        case .bite:
            return "Bite"
        case .hiss:
            return "Hiss"
        }
    }

    static func menu(handler: @escaping (MascotAction) -> Void) -> NSMenu {
        let menu = NSMenu()
        menu.autoenablesItems = false
        for action in MascotAction.allCases {
            let item = NSMenuItem(title: action.title, action: nil, keyEquivalent: "")
            item.representedObject = action.rawValue
            item.target = MenuTrampoline.shared
            item.action = #selector(MenuTrampoline.pick(_:))
            menu.addItem(item)
        }
        MenuTrampoline.shared.handler = handler
        return menu
    }
}

private final class MenuTrampoline: NSObject {
    static let shared = MenuTrampoline()
    var handler: ((MascotAction) -> Void)?

    @objc func pick(_ sender: NSMenuItem) {
        guard let raw = sender.representedObject as? String, let action = MascotAction(rawValue: raw) else {
            return
        }
        handler?(action)
    }
}
