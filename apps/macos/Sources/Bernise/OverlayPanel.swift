import AppKit
import WebKit

final class OverlayPanel: NSPanel {
    var onPerchChange: ((OverlayPerch) -> Void)?
    var onPetAction: ((String) -> Void)?
    private(set) var perch: OverlayPerch = .none
    private weak var pet: PetWebView?
    private var globalMonitor: Any?
    private var localMonitor: Any?
    private var dragStartMouse: NSPoint?
    private var dragStartOrigin: NSPoint?
    private var isDragging = false
    private var grabbedCursor = false
    private var overBody = false
    private var probeGeneration = 0
    private var lastPointer = (x: 99.0, y: 99.0)

    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { false }

    override func constrainFrameRect(_ frameRect: NSRect, to _: NSScreen?) -> NSRect {
        frameRect
    }

    func installInteraction(pet: PetWebView) {
        guard globalMonitor == nil else {
            return
        }
        self.pet = pet
        acceptsMouseMovedEvents = true
        isMovable = false
        isMovableByWindowBackground = false
        ignoresMouseEvents = true
        applySavedPosition()

        globalMonitor = NSEvent.addGlobalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDown, .leftMouseDragged, .leftMouseUp, .rightMouseDown]
        ) { [weak self] event in
            self?.handleGlobal(event)
        }
        localMonitor = NSEvent.addLocalMonitorForEvents(
            matching: [.mouseMoved, .leftMouseDown, .leftMouseDragged, .leftMouseUp, .rightMouseDown]
        ) { [weak self] event in
            guard let self else {
                return event
            }
            return self.handleLocal(event)
        }
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(screenParametersChanged),
            name: NSApplication.didChangeScreenParametersNotification,
            object: nil
        )
    }

    func resetPosition() {
        endDrag(save: false)
        setPerch(.none)
        let next = OverlayPosition.clamp(
            NSRect(origin: OverlayLayout.defaultFrame.origin, size: OverlayLayout.defaultFrame.size)
        )
        setFrame(next, display: true)
        OverlayPosition.save(OverlayPlacement(origin: next.origin, perch: .none))
        updateClickThrough(at: NSEvent.mouseLocation)
    }

    deinit {
        if let globalMonitor {
            NSEvent.removeMonitor(globalMonitor)
        }
        if let localMonitor {
            NSEvent.removeMonitor(localMonitor)
        }
        NotificationCenter.default.removeObserver(self)
    }

    private func applySavedPosition() {
        let placement = OverlayPosition.load() ?? OverlayPlacement(
            origin: OverlayLayout.defaultFrame.origin,
            perch: .none
        )
        let next = OverlayPosition.frame(from: placement, size: OverlayLayout.defaultFrame.size)
        setFrame(next, display: true)
        setPerch(placement.perch)
    }

    private func handleLocal(_ event: NSEvent) -> NSEvent? {
        let mouse = NSEvent.mouseLocation
        pushPointer(at: mouse)
        switch event.type {
        case .mouseMoved:
            updateClickThrough(at: mouse)
        case .leftMouseDown:
            beginDrag(at: mouse)
        case .leftMouseDragged:
            drag(to: mouse)
            if isDragging {
                return nil
            }
        case .leftMouseUp:
            endDrag(save: true)
            updateClickThrough(at: mouse)
        case .rightMouseDown:
            if overBody {
                showPetMenu(at: mouse)
                return nil
            }
        default:
            break
        }
        return event
    }

    private func handleGlobal(_ event: NSEvent) {
        let mouse = NSEvent.mouseLocation
        pushPointer(at: mouse)
        switch event.type {
        case .mouseMoved, .leftMouseDown:
            updateClickThrough(at: mouse)
        case .leftMouseDragged:
            drag(to: mouse)
        case .leftMouseUp:
            endDrag(save: true)
            updateClickThrough(at: mouse)
        case .rightMouseDown:
            if overBody {
                showPetMenu(at: mouse)
            }
        default:
            break
        }
    }

    private func beginDrag(at mouse: NSPoint) {
        guard overBody else {
            return
        }
        dragStartMouse = mouse
        dragStartOrigin = frame.origin
        isDragging = false
        ignoresMouseEvents = false
    }

    private func drag(to mouse: NSPoint) {
        guard var startMouse = dragStartMouse, var startOrigin = dragStartOrigin else {
            updateClickThrough(at: mouse)
            return
        }
        let dx = mouse.x - startMouse.x
        let dy = mouse.y - startMouse.y
        if !isDragging {
            guard hypot(dx, dy) >= 8 else {
                return
            }
            isDragging = true
            NSCursor.closedHand.push()
            grabbedCursor = true
            cancelWebPointer()
            if perch != .none {
                let unpinned = OverlayPosition.unpin(frame, perch: perch, mouse: mouse)
                setFrame(unpinned, display: true)
                startOrigin = unpinned.origin
                startMouse = mouse
                dragStartOrigin = startOrigin
                dragStartMouse = startMouse
                setPerch(.none)
            }
        }
        ignoresMouseEvents = false
        let next = OverlayPosition.clampDrag(
            NSRect(
                origin: NSPoint(x: startOrigin.x + (mouse.x - startMouse.x), y: startOrigin.y + (mouse.y - startMouse.y)),
                size: frame.size
            ),
            mouse: mouse
        )
        setFrame(next, display: true)
        setPerch(OverlayPosition.detectPerch(next, mouse: mouse))
    }

    private func endDrag(save: Bool) {
        let moved = isDragging
        if grabbedCursor {
            NSCursor.pop()
            grabbedCursor = false
        }
        dragStartMouse = nil
        dragStartOrigin = nil
        isDragging = false
        guard save, moved else {
            return
        }
        let mouse = NSEvent.mouseLocation
        let detected = OverlayPosition.detectPerch(frame, mouse: mouse)
        if detected != .none {
            let pinned = OverlayPosition.pinnedFrame(
                perch: detected,
                along: OverlayPosition.along(for: frame, perch: detected),
                size: frame.size,
                mouse: mouse,
                hint: frame
            )
            setFrame(pinned, display: true, animate: true)
            setPerch(detected)
        } else {
            setPerch(.none)
            let rest = OverlayPosition.clamp(frame, mouse: mouse)
            if rest != frame {
                setFrame(rest, display: true, animate: true)
            }
        }
        OverlayPosition.save(OverlayPlacement(origin: frame.origin, perch: perch))
    }

    private func setPerch(_ next: OverlayPerch) {
        guard next != perch else {
            return
        }
        perch = next
        onPerchChange?(next)
    }

    private func pushPointer(at screenPoint: NSPoint) {
        let goal = OverlayPosition.lookGoal(mouse: screenPoint, frame: frame)
        guard abs(goal.x - lastPointer.x) > 0.012 || abs(goal.y - lastPointer.y) > 0.012 else {
            return
        }
        lastPointer = goal
        pet?.setPointer(x: goal.x, y: goal.y)
    }

    private func showPetMenu(at mouse: NSPoint) {
        ignoresMouseEvents = false
        let menu = NSMenu()
        menu.addItem(petMenuItem("Litter box", action: #selector(menuLitter)))
        menu.addItem(petMenuItem("Sleep", action: #selector(menuSleep)))
        menu.addItem(petMenuItem("Wake up", action: #selector(menuWake)))
        menu.addItem(.separator())
        menu.addItem(petMenuItem("Reset position", action: #selector(menuReset)))
        let point = convertPoint(fromScreen: mouse)
        menu.popUp(positioning: nil, at: point, in: contentView)
        updateClickThrough(at: NSEvent.mouseLocation)
    }

    private func petMenuItem(_ title: String, action: Selector) -> NSMenuItem {
        let item = NSMenuItem(title: title, action: action, keyEquivalent: "")
        item.target = self
        return item
    }

    @objc private func menuLitter() {
        onPetAction?("litter")
    }

    @objc private func menuSleep() {
        onPetAction?("sleep")
    }

    @objc private func menuWake() {
        onPetAction?("wake")
    }

    @objc private func menuReset() {
        resetPosition()
    }

    private func updateClickThrough(at screenPoint: NSPoint) {
        if isDragging {
            ignoresMouseEvents = false
            return
        }
        guard let pet, frame.contains(screenPoint) else {
            overBody = false
            ignoresMouseEvents = true
            return
        }
        let windowPoint = convertPoint(fromScreen: screenPoint)
        var viewPoint = pet.webView.convert(windowPoint, from: nil)
        viewPoint.y = pet.webView.bounds.height - viewPoint.y
        probeGeneration += 1
        let generation = probeGeneration
        pet.hitTestBody(clientX: viewPoint.x, clientY: viewPoint.y) { [weak self] hit in
            guard let self, generation == self.probeGeneration else {
                return
            }
            self.overBody = hit
            if self.isDragging {
                self.ignoresMouseEvents = false
                return
            }
            self.ignoresMouseEvents = !hit
        }
    }

    private func cancelWebPointer() {
        guard let webView = contentView as? WKWebView else {
            return
        }
        webView.evaluateJavaScript(
            """
            window.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true }));
            window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
            """
        )
    }

    @objc private func screenParametersChanged() {
        let mouse = NSEvent.mouseLocation
        let next: NSRect
        if perch == .none {
            next = OverlayPosition.clamp(frame, mouse: mouse)
        } else {
            next = OverlayPosition.pinnedFrame(
                perch: perch,
                along: OverlayPosition.along(for: frame, perch: perch),
                size: frame.size,
                mouse: mouse,
                hint: frame
            )
        }
        setFrame(next, display: true)
        OverlayPosition.save(OverlayPlacement(origin: next.origin, perch: perch))
        updateClickThrough(at: mouse)
    }
}
