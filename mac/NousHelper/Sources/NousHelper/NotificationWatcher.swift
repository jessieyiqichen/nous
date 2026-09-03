import AppKit
import ApplicationServices

/// 通知横幅监听：用已授予的辅助功能权限，轮询「通知中心」进程的横幅窗口，
/// 读出发件人（title）和消息内容（body）。微信/钉钉的新消息横幅由此自动感知，
/// 无需复制。横幅只在屏幕上停留几秒，所以 1s 轮询。
final class NotificationWatcher {
    var onNotification: ((_ sender: String, _ body: String) -> Void)?
    var enabled = true

    private var timer: Timer?
    /// 已处理横幅去重（同一横幅会被连续轮询命中多次）
    private var seen: [Int: Date] = [:]
    private static let dedupWindow: TimeInterval = 120
    private static let maxDepth = 10

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 1.0, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    private var loggedStatus = false
    private var lastFiredAt = Date.distantPast
    private static let fireCooldown: TimeInterval = 10

    private func poll() {
        guard enabled else { return }
        let trusted = PasteService.isTrusted(prompt: false)
        let app = NSRunningApplication
            .runningApplications(withBundleIdentifier: "com.apple.notificationcenterui").first
        if !loggedStatus {
            loggedStatus = true
            NSLog("NousHelper: 通知监听自检 AX信任=%d 通知中心进程=%@", trusted ? 1 : 0, app.map { String($0.processIdentifier) } ?? "未找到")
        }
        guard trusted, let app = app else { return }

        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        var winsRef: CFTypeRef?
        guard AXUIElementCopyAttributeValue(axApp, kAXWindowsAttribute as CFString, &winsRef) == .success,
              let windows = winsRef as? [AXUIElement]
        else { return }

        pruneSeen()
        for window in windows {
            var texts: [String] = []
            collectTexts(window, depth: 0, into: &texts)
            guard let parsed = Self.parseBanner(texts) else {
                if !texts.isEmpty {
                    NSLog("NousHelper: 横幅无法解析（%d 段）: %@", texts.count, texts.joined(separator: " ⧙ ").prefix(120) as CVarArg)
                }
                continue
            }

            let key = (parsed.sender + "|" + parsed.body).hashValue
            guard seen[key] == nil else { continue }
            seen[key] = Date()
            guard Date().timeIntervalSince(lastFiredAt) >= Self.fireCooldown else { continue }
            lastFiredAt = Date()
            NSLog("NousHelper: 通知横幅 [%@] %d chars", parsed.sender, parsed.body.count)
            onNotification?(parsed.sender, parsed.body)
        }
    }

    /// 通知中心列表视图/日期分组等会被误当横幅，这些"发件人"直接丢弃
    private static let senderStoplist: Set<String> = ["列表", "月", "通知中心", "今天", "昨天", "更早", "清除", "显示更少", "显示更多"]
    private static let maxSegments = 6

    /// 横幅文本 → (发件人, 内容)。多段：首段=发件人；单段：按换行/分隔符拆
    static func parseBanner(_ rawTexts: [String]) -> (sender: String, body: String)? {
        let texts = rawTexts
            .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
            .filter { !$0.isEmpty }
        // 段数太多 = 通知中心列表视图，不是单条横幅
        guard texts.count <= maxSegments else { return nil }
        if let first = texts.first, senderStoplist.contains(first) || first.count > 20 || first.allSatisfy({ $0.isNumber }) {
            return nil
        }
        if texts.count >= 2 {
            let sender = texts[0]
            let body = texts.dropFirst().joined(separator: " ")
            return body.isEmpty ? nil : (sender, body)
        }
        guard let single = texts.first else { return nil }
        // 单段形态：常见 "发件人\n内容" 或 "App、发件人、内容" 的合并串
        for sep in ["\n", "，", ", "] {
            if let range = single.range(of: sep) {
                let sender = String(single[..<range.lowerBound]).trimmingCharacters(in: .whitespaces)
                let body = String(single[range.upperBound...]).trimmingCharacters(in: .whitespaces)
                if sender.count <= 20, !body.isEmpty {
                    return (sender, body)
                }
            }
        }
        return nil
    }

    private func collectTexts(_ element: AXUIElement, depth: Int, into texts: inout [String]) {
        guard depth < Self.maxDepth else { return }
        var roleRef: CFTypeRef?
        AXUIElementCopyAttributeValue(element, kAXRoleAttribute as CFString, &roleRef)
        if (roleRef as? String) == (kAXStaticTextRole as String) {
            var valueRef: CFTypeRef?
            if AXUIElementCopyAttributeValue(element, kAXValueAttribute as CFString, &valueRef) == .success,
               let s = valueRef as? String, !s.isEmpty {
                texts.append(s)
            }
        } else {
            // 横幅有时把全部内容放在 button/group 的 title/description 里
            for attr in [kAXTitleAttribute, kAXDescriptionAttribute] {
                var ref: CFTypeRef?
                if AXUIElementCopyAttributeValue(element, attr as CFString, &ref) == .success,
                   let s = ref as? String, !s.isEmpty, !texts.contains(s) {
                    texts.append(s)
                }
            }
        }
        var childrenRef: CFTypeRef?
        if AXUIElementCopyAttributeValue(element, kAXChildrenAttribute as CFString, &childrenRef) == .success,
           let children = childrenRef as? [AXUIElement] {
            for child in children {
                collectTexts(child, depth: depth + 1, into: &texts)
            }
        }
    }

    private func pruneSeen() {
        let cutoff = Date().addingTimeInterval(-Self.dedupWindow)
        seen = seen.filter { $0.value > cutoff }
    }
}

/// 发件人 → 关系 映射（本地 UserDefaults，用户在详情里改一次关系就记住）
enum RelationStore {
    private static let key = "senderRelations"

    static func relation(for sender: String) -> String? {
        let dict = UserDefaults.standard.dictionary(forKey: key) as? [String: String]
        return dict?[sender]
    }

    static func set(_ relation: String, for sender: String) {
        var dict = (UserDefaults.standard.dictionary(forKey: key) as? [String: String]) ?? [:]
        dict[sender] = relation
        UserDefaults.standard.set(dict, forKey: key)
    }
}
