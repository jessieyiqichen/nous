import AppKit
import ApplicationServices

/// 写侧：把草稿放进剪贴板并向前台应用（微信/钉钉等）模拟 ⌘V。
/// 需要「辅助功能」权限（系统设置 → 隐私与安全性 → 辅助功能），首次调用会弹授权引导。
enum PasteService {
    static func isTrusted(prompt: Bool) -> Bool {
        let key = kAXTrustedCheckOptionPrompt.takeUnretainedValue() as String
        let options = [key: prompt] as CFDictionary
        return AXIsProcessTrustedWithOptions(options)
    }

    private static let editableRoles: Set<String> = ["AXTextArea", "AXTextField", "AXComboBox"]

    private static func attr(_ el: AXUIElement, _ name: String) -> CFTypeRef? {
        var ref: CFTypeRef?
        return AXUIElementCopyAttributeValue(el, name as CFString, &ref) == .success ? ref : nil
    }

    private static func role(_ el: AXUIElement) -> String { (attr(el, kAXRoleAttribute) as? String) ?? "" }

    private static func topY(_ el: AXUIElement) -> CGFloat {
        guard let v = attr(el, kAXPositionAttribute) else { return -1 }
        var pt = CGPoint.zero
        // swiftlint:disable:next force_cast
        return AXValueGetValue(v as! AXValue, .cgPoint, &pt) ? pt.y : -1
    }

    /// Electron/Chromium 应用（飞书、钉钉）默认不暴露完整 AX 树，要先设这个标志"敲门"
    static func enableManualAccessibility(_ axApp: AXUIElement) {
        AXUIElementSetAttributeValue(axApp, "AXManualAccessibility" as CFString, kCFBooleanTrue)
        AXUIElementSetAttributeValue(axApp, "AXEnhancedUserInterface" as CFString, kCFBooleanTrue)
    }

    private static func collectEditable(_ el: AXUIElement, depth: Int, into out: inout [AXUIElement]) {
        guard depth < 28 else { return }
        if editableRoles.contains(role(el)) { out.append(el) }
        if let kids = attr(el, kAXChildrenAttribute) as? [AXUIElement] {
            for k in kids { collectEditable(k, depth: depth + 1, into: &out) }
        }
    }

    /// 前台应用的焦点若不在输入框（飞书等复制消息后焦点停在消息列表），
    /// 在焦点窗口里找最靠下的可编辑文本区（聊天输入框在底部）并主动聚焦。
    @discardableResult
    static func focusChatInput() -> Bool {
        guard let app = NSWorkspace.shared.frontmostApplication else { return false }
        let axApp = AXUIElementCreateApplication(app.processIdentifier)
        enableManualAccessibility(axApp)
        if let focusedRef = attr(axApp, kAXFocusedUIElementAttribute) {
            let focused = focusedRef as! AXUIElement
            if editableRoles.contains(role(focused)) { return true }
        }
        guard let winRef = attr(axApp, kAXFocusedWindowAttribute) ?? attr(axApp, kAXMainWindowAttribute) else { return false }
        let window = winRef as! AXUIElement
        var candidates: [AXUIElement] = []
        collectEditable(window, depth: 0, into: &candidates)
        guard let target = candidates.max(by: { topY($0) < topY($1) }) else {
            NSLog("NousHelper: 前台窗口未找到可编辑输入框（%@）", app.localizedName ?? "?")
            return false
        }
        let ok = AXUIElementSetAttributeValue(target, kAXFocusedAttribute as CFString, kCFBooleanTrue) == .success
        NSLog("NousHelper: 聚焦输入框 %@（%@，候选 %d）", ok ? "成功" : "失败", role(target), candidates.count)
        return ok
    }

    /// 返回 false 表示无辅助功能权限（已弹系统授权引导）
    @discardableResult
    static func pasteIntoFrontmostApp(_ text: String, watcher: ClipboardWatcher) -> Bool {
        guard isTrusted(prompt: true) else {
            NSLog("NousHelper: 辅助功能权限未授予，已请求")
            return false
        }
        if let app = NSWorkspace.shared.frontmostApplication {
            enableManualAccessibility(AXUIElementCreateApplication(app.processIdentifier))
        }
        watcher.suppress(text)
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)

        // 0.35s：给 Electron 应用建 AX 树的时间 → 聚焦输入框 → 模拟 ⌘V（面板非激活，不抢焦点）
        // 首次没找到输入框（Chromium 树还没建好）就 0.8s 后再试一次
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) {
            if focusChatInput() {
                postPaste()
            } else {
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.8) {
                    focusChatInput()
                    postPaste()
                }
            }
        }
        return true
    }

    private static func postPaste() {
        let source = CGEventSource(stateID: .combinedSessionState)
        let vKey: CGKeyCode = 9
        guard
            let keyDown = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: true),
            let keyUp = CGEvent(keyboardEventSource: source, virtualKey: vKey, keyDown: false)
        else {
            NSLog("NousHelper: CGEvent 创建失败")
            return
        }
        keyDown.flags = .maskCommand
        keyUp.flags = .maskCommand
        keyDown.post(tap: .cghidEventTap)
        keyUp.post(tap: .cghidEventTap)
        NSLog("NousHelper: 已填入前台应用")
    }

    /// 仅复制草稿（不粘贴）
    static func copyOnly(_ text: String, watcher: ClipboardWatcher) {
        watcher.suppress(text)
        let pb = NSPasteboard.general
        pb.clearContents()
        pb.setString(text, forType: .string)
    }
}
