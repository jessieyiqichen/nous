import AppKit

final class AppDelegate: NSObject, NSApplicationDelegate {
    private var statusItem: NSStatusItem!
    private let watcher = ClipboardWatcher()
    private let notifWatcher = NotificationWatcher()
    private let panelController = PanelController()
    /// 填入后的发送监听（同一时刻只盯一条）
    private var sendWatcher: SendWatcher?
    private var toggleItem: NSMenuItem!
    private var notifToggleItem: NSMenuItem!

    func applicationDidFinishLaunching(_ notification: Notification) {
        setupStatusItem()
        wirePanel()

        watcher.onCopy = { [weak self] text in
            self?.handleCopiedText(text)
        }
        watcher.start()
        notifWatcher.onNotification = { [weak self] sender, body in
            self?.handleNotification(sender: sender, body: body)
        }
        notifWatcher.start()
        NSLog("NousHelper: 已启动，监听剪贴板 + 通知横幅（服务器：%@）", TwinClient.baseURL)
    }

    // ── 菜单栏 ───────────────────────────────────────────────

    private func setupStatusItem() {
        statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
        statusItem.button?.title = "N·"

        let menu = NSMenu()
        toggleItem = NSMenuItem(title: "暂停剪贴板监听", action: #selector(toggleWatch), keyEquivalent: "")
        toggleItem.target = self
        menu.addItem(toggleItem)
        notifToggleItem = NSMenuItem(title: "暂停通知监听", action: #selector(toggleNotifWatch), keyEquivalent: "")
        notifToggleItem.target = self
        menu.addItem(notifToggleItem)
        let serverItem = NSMenuItem(title: "服务器地址…", action: #selector(configureServer), keyEquivalent: "")
        serverItem.target = self
        menu.addItem(serverItem)
        menu.addItem(.separator())
        let usageItem = NSMenuItem(title: "用法：同一段文字连按两次⌘C 触发", action: nil, keyEquivalent: "")
        usageItem.isEnabled = false
        menu.addItem(usageItem)
        menu.addItem(.separator())
        let quitItem = NSMenuItem(title: "退出", action: #selector(NSApplication.terminate(_:)), keyEquivalent: "q")
        menu.addItem(quitItem)
        statusItem.menu = menu
    }

    @objc private func toggleWatch() {
        watcher.enabled.toggle()
        toggleItem.title = watcher.enabled ? "暂停剪贴板监听" : "恢复剪贴板监听"
        updateStatusIcon()
    }

    @objc private func toggleNotifWatch() {
        notifWatcher.enabled.toggle()
        notifToggleItem.title = notifWatcher.enabled ? "暂停通知监听" : "恢复通知监听"
        updateStatusIcon()
    }

    private func updateStatusIcon() {
        let anyOn = watcher.enabled || notifWatcher.enabled
        statusItem.button?.title = anyOn ? "N·" : "N∘"
        if !anyOn { panelController.hide() }
    }

    @objc private func configureServer() {
        NSApp.activate(ignoringOtherApps: true)
        let alert = NSAlert()
        alert.messageText = "分身服务地址"
        alert.informativeText = "本地开发填 http://localhost:3999，线上填 Vercel 域名"
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 300, height: 24))
        field.stringValue = TwinClient.baseURL
        alert.accessoryView = field
        alert.addButton(withTitle: "保存")
        alert.addButton(withTitle: "取消")
        if alert.runModal() == .alertFirstButtonReturn {
            let url = field.stringValue.trimmingCharacters(in: .whitespaces)
            if !url.isEmpty { TwinClient.setBaseURL(url) }
        }
    }

    // ── 分析流程 ─────────────────────────────────────────────

    private func handleCopiedText(_ text: String) {
        let (relation, content) = parseRelationPrefix(text)
        analyze(relation: relation, content: content)
    }

    /// 通知横幅：title=发件人，body=消息。过滤系统噪音和隐藏详情的占位文案。
    private func handleNotification(sender: String, body: String) {
        guard sender != "NousHelper" else { return }
        guard ClipboardWatcher.looksLikeMessage(body) else { return }
        let placeholders = ["你收到", "条新消息", "新消息", "条未读"]
        if body.count < 20, placeholders.contains(where: { body.contains($0) }) { return }
        let relation = RelationStore.relation(for: sender) ?? UNKNOWN_RELATION
        analyze(relation: relation, content: body, display: "\(sender)：\(body)", sender: sender, unsolicited: true)
    }

    /// unsolicited = 横幅自动触发：判「不回」就不打扰（不弹面板），有事要做才出现
    private func analyze(relation: String, content: String, display: String? = nil, sender: String? = nil, unsolicited: Bool = false) {
        let model = panelController.model
        model.relation = relation
        model.relationGuessed = false
        model.content = display ?? content
        model.rawContent = content
        model.sender = sender
        model.state = .loading
        model.showDetails = false
        if !unsolicited { panelController.show() }

        TwinClient.analyze(relation: relation, content: content) { [weak self] result in
            switch result {
            case .success(let analysis):
                // 关系未知时采用模型的推断：chips 高亮 + 后续采纳/改写上报带上猜测的关系
                if relation == UNKNOWN_RELATION, let guess = analysis.relation_guess, !guess.isEmpty {
                    model.relation = guess
                    model.relationGuessed = true
                }
                model.state = .result(analysis)
                NSLog("NousHelper: 分析完成 triage=%@ relation=%@%@", analysis.triage.action, model.relation, model.relationGuessed ? "(猜)" : "")
                if unsolicited {
                    if analysis.triage.action == "ignore" { return }
                    self?.panelController.show()
                }
            case .failure(let message):
                model.state = .error(message)
                NSLog("NousHelper: 分析失败 %@", message)
            }
            self?.panelController.applySize()
        }
    }

    /// 填入后 0.6s（粘贴已落）开始盯输入框：发送时按 原样/改过 上报 adopted/edited
    private func watchSend(relation: String, incoming: String, draft: String) {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.6) { [weak self] in
            guard let self = self else { return }
            let watcher = SendWatcher(draft: draft) { [weak self] final in
                let action = final == draft ? "adopted" : "edited"
                TwinClient.report(relation: relation, incoming: incoming, draft: draft, final: final, action: action)
                NSLog("NousHelper: 发送捕获 %@（%d 字）", action, final.count)
                self?.sendWatcher = nil
            }
            if watcher.start() {
                self.sendWatcher = watcher
            } else {
                // 该 App 的输入框读不到值：退回"填入即采纳"
                TwinClient.report(relation: relation, incoming: incoming, draft: draft, final: draft, action: "adopted")
                NSLog("NousHelper: 输入框不可读，按采纳记录")
            }
        }
    }

    private func wirePanel() {
        let model = panelController.model
        model.onLayoutChange = { [weak self] in self?.panelController.applySize() }
        model.onClose = { [weak self] in self?.panelController.hide() }
        model.onReanalyze = { [weak self] relation in
            guard let self = self else { return }
            // 用户手动改关系 = 一条映射记忆，下次这个发件人直接用对
            if let sender = model.sender {
                RelationStore.set(relation, for: sender)
            }
            self.analyze(relation: relation, content: model.rawContent, display: model.content, sender: model.sender)
        }
        model.onFill = { [weak self] draft in
            guard let self = self else { return }
            let ok = PasteService.pasteIntoFrontmostApp(draft, watcher: self.watcher)
            if ok {
                self.panelController.hide()
                self.watchSend(relation: model.relation, incoming: model.rawContent, draft: draft)
            }
            // 未授权时面板留着，系统会弹辅助功能引导
        }
        model.onCopy = { [weak self] draft in
            guard let self = self else { return }
            PasteService.copyOnly(draft, watcher: self.watcher)
            TwinClient.report(relation: model.relation, incoming: model.rawContent, draft: draft, final: draft, action: "adopted")
            self.panelController.hide()
        }
    }
}
