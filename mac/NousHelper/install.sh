#!/bin/bash
# 构建 release 并安装为 /Applications/NousHelper.app，重启 launchd 服务。
# 注意：二进制变了 macOS 会收回辅助功能授权，装完需在 系统设置→隐私与安全性→辅助功能 里重新勾选 NousHelper。
set -euo pipefail
cd "$(dirname "$0")"
swift build -c release
APP="/Applications/NousHelper.app"
mkdir -p "$APP/Contents/MacOS"
cp .build/release/NousHelper "$APP/Contents/MacOS/NousHelper"
[ -f "$APP/Contents/Info.plist" ] || cp Info.plist "$APP/Contents/Info.plist"
# 有稳定签名身份就用它（重编不再掉辅助功能授权），否则 ad-hoc
if security find-identity -v -p codesigning 2>/dev/null | grep -q '"Nous Dev"'; then
  codesign --force --deep -s "Nous Dev" --identifier com.nous.helper "$APP" && echo "签名：Nous Dev（稳定身份）"
else
  codesign --force --deep -s - "$APP" && echo "签名：ad-hoc（重编后需重新授权辅助功能）"
fi
launchctl kickstart -k "gui/$(id -u)/com.nous.helper" 2>/dev/null || true
echo "✅ 已安装并重启：$APP（若弹辅助功能授权，去系统设置重新勾选）"
