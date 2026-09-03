import AppKit

/// 轮询剪贴板：**连按两次 ⌘C（同一段文本 2 秒内复制两次）**才触发分析——
/// 普通的复制粘贴完全不打扰。
/// 隐私边界：文本只发往用户自己配置的分身服务；启发式过滤（见 looksLikeMessage）
/// 尽量避免把密码/代码这类内容发出去；菜单栏可随时暂停。
final class ClipboardWatcher {
    var onCopy: ((String) -> Void)?
    var enabled = true

    private var timer: Timer?
    private var lastChangeCount: Int
    /// 我们自己写进剪贴板的草稿——跳过，避免自触发循环
    private var suppressedTexts: Set<String> = []
    /// 双击复制检测：第一次复制的候选文本 + 时间
    private var candidate: String?
    private var candidateAt = Date.distantPast
    /// 同一段文本 5s 内只触发一次（连按三下 ⌘C 会落在两个轮询周期里）
    private var lastTriggered: String?
    private var lastTriggeredAt = Date.distantPast
    private static let retriggerCooldown: TimeInterval = 5.0

    private static let minLength = 2
    private static let maxLength = 500
    private static let doubleCopyWindow: TimeInterval = 2.0

    init() {
        lastChangeCount = NSPasteboard.general.changeCount
    }

    func start() {
        timer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [weak self] _ in
            self?.poll()
        }
    }

    func suppress(_ text: String) {
        suppressedTexts.insert(text)
    }

    private func poll() {
        let pb = NSPasteboard.general
        let delta = pb.changeCount - lastChangeCount
        guard delta != 0 else { return }
        lastChangeCount = pb.changeCount
        guard enabled else { return }
        guard let text = pb.string(forType: .string)?.trimmingCharacters(in: .whitespacesAndNewlines) else { return }
        if suppressedTexts.contains(text) {
            suppressedTexts.remove(text)
            return
        }
        guard Self.looksLikeMessage(text) else { return }

        if text == lastTriggered, Date().timeIntervalSince(lastTriggeredAt) < Self.retriggerCooldown {
            return // 刚触发过同一段，忽略多余的 ⌘C
        }
        // 快速连按两次 ⌘C：两次写入落在同一个轮询周期里（delta≥2），直接触发
        // 慢速两次：同一段文本在时间窗内第二次出现
        let slowDouble = text == candidate && Date().timeIntervalSince(candidateAt) < Self.doubleCopyWindow
        if delta >= 2 || slowDouble {
            candidate = nil
            lastTriggered = text
            lastTriggeredAt = Date()
            NSLog("NousHelper: 双击复制触发 (%d chars)", text.count)
            onCopy?(text)
            return
        }
        candidate = text
        candidateAt = Date()
    }

    /// 消息启发式：长度合理，且含中文或空白（密码/token/代码路径通常都不满足）
    static func looksLikeMessage(_ text: String) -> Bool {
        guard text.count >= minLength && text.count <= maxLength else { return false }
        let hasCJK = text.unicodeScalars.contains { $0.value >= 0x4E00 && $0.value <= 0x9FFF }
        let hasSpace = text.contains(" ")
        return hasCJK || hasSpace
    }
}
