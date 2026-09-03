import AppKit
import ApplicationServices

/// 零动作反馈：「填入」之后盯住焦点输入框，内容被清空（= 已发送）的瞬间，
/// 把清空前的最后内容记为"你实际发的"。和草稿一样 → adopted；改过 → edited。
/// 用户什么都不用多做——改就是反馈，不改就是采纳。
final class SendWatcher {
    private var timer: Timer?
    private var element: AXUIElement?
    private var lastNonEmpty: String
    private var ticks = 0
    private let onFinal: (String) -> Void

    private static let pollInterval: TimeInterval = 0.3
    private static let maxTicks = Int(600 / 0.3) // 10 分钟没发就放弃，不上报

    init(draft: String, onFinal: @escaping (String) -> Void) {
        self.lastNonEmpty = draft
        self.onFinal = onFinal
    }

    /// 返回 false = 拿不到焦点输入框的内容（该 App 不支持 AX 读值），调用方退回旧逻辑
    func start() -> Bool {
        guard let el = Self.focusedElement(), let v = Self.value(of: el) else { return false }
        element = el
        let t = v.trimmingCharacters(in: .whitespacesAndNewlines)
        if !t.isEmpty { lastNonEmpty = t }
        timer = Timer.scheduledTimer(withTimeInterval: Self.pollInterval, repeats: true) { [weak self] _ in
            self?.poll()
        }
        return true
    }

    private var lastLen = -1

    private func poll() {
        ticks += 1
        guard let el = element else { stop(); return }
        guard let v = Self.value(of: el) else {
            // 元素失效（窗口关了 / 会话切走 / 编辑器重建）——按发送了最后内容处理
            NSLog("NousHelper: 输入框元素失效，按已发送处理")
            finish(); return
        }
        let t = v.trimmingCharacters(in: .whitespacesAndNewlines)
        if t.count != lastLen {
            NSLog("NousHelper: 输入框长度 %d → %d", lastLen, t.count)
            lastLen = t.count
        }
        // 发送判据：清空；或占位级短文本；或从较长内容骤缩到三成以下
        let shrank = lastNonEmpty.count >= 6 && t.count * 10 < lastNonEmpty.count * 3
        if t.isEmpty || t.count <= 1 || shrank { finish(); return }
        lastNonEmpty = t
        if ticks >= Self.maxTicks {
            NSLog("NousHelper: 发送监听超时，放弃")
            stop()
        }
    }

    private func finish() {
        let final = lastNonEmpty
        stop()
        onFinal(final)
    }

    private func stop() {
        timer?.invalidate()
        timer = nil
        element = nil
    }

    static func focusedElement() -> AXUIElement? {
        let system = AXUIElementCreateSystemWide()
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(system, kAXFocusedUIElementAttribute as CFString, &ref) == .success,
              let r = ref else { return nil }
        return (r as! AXUIElement)
    }

    static func value(of element: AXUIElement) -> String? {
        var ref: CFTypeRef?
        guard AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &ref) == .success else { return nil }
        return ref as? String
    }
}
