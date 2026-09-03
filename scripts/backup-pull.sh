#!/bin/bash
# 把服务器上的分身数据快照（/opt/nous-data/backups，每 6h 一份、留 14 天）拉回本机。
# 由 launchd com.nous.backup（scripts/install-backup-agent.sh 安装）每天 09:30 + 每次登录时运行。
# 需要 NOUS_SERVER（如 root@your-host）：环境变量，或仓库根 .ops.env（gitignored）。
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
[ -f "$REPO/.ops.env" ] && . "$REPO/.ops.env"
: "${NOUS_SERVER:?请设置 NOUS_SERVER（如 root@your-host），可写在仓库根 .ops.env}"
DEST="${NOUS_BACKUP_DIR:-$HOME/nous-backups}"
mkdir -p "$DEST"
/usr/bin/rsync -az --timeout=60 -e "/usr/bin/ssh -o BatchMode=yes -o ConnectTimeout=15" \
  "$NOUS_SERVER:/opt/nous-data/backups/" "$DEST/"
latest=$(ls -t "$DEST"/nous-*.db.gz 2>/dev/null | head -1 || true)
echo "$(date '+%F %T') 拉取完成：$(ls "$DEST" | wc -l | tr -d ' ') 份，最新 $(basename "${latest:-无}")"
