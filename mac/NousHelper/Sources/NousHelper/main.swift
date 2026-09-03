import AppKit

// 菜单栏应用：不出现在 Dock，只有状态栏图标
let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.setActivationPolicy(.accessory)
app.run()
