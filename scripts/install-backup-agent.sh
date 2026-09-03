#!/bin/bash
# 安装/更新 macOS launchd 代理 com.nous.backup：每天 09:30 + 登录时运行 scripts/backup-pull.sh。
# 用法：scripts/install-backup-agent.sh   （需要 NOUS_SERVER：环境变量或仓库根 .ops.env）
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$REPO/.ops.env" ] && . "$REPO/.ops.env"
: "${NOUS_SERVER:?请设置 NOUS_SERVER（如 root@your-host），可写在仓库根 .ops.env}"
LABEL=com.nous.backup
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs/nous"
cat > "$PLIST" <<PL
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$REPO/scripts/backup-pull.sh</string></array>
  <key>EnvironmentVariables</key><dict><key>NOUS_SERVER</key><string>$NOUS_SERVER</string></dict>
  <key>StartCalendarInterval</key><dict><key>Hour</key><integer>9</integer><key>Minute</key><integer>30</integer></dict>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/nous/backup.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/nous/backup.log</string>
</dict>
</plist>
PL
launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "✓ 已安装 $LABEL → ${PLIST}（日志 ~/Library/Logs/nous/backup.log）"
