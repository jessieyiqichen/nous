#!/bin/bash
# 生成可公开的干净副本：从当前 HEAD 导出（不带历史）→ 剔除个人材料 → 自检 → 单次提交的新仓库。
# 用法：scripts/oss-export.sh <目标目录>        然后到目标目录 git remote add origin … && git push -u origin main
set -euo pipefail
REPO="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${1:?用法: scripts/oss-export.sh <空目标目录>}"
[ -e "$DEST" ] && [ -n "$(ls -A "$DEST" 2>/dev/null)" ] && { echo "目标目录非空：$DEST"; exit 1; }
mkdir -p "$DEST"

# 只导出已提交内容（工作区未提交/未跟踪文件一律不带）
git -C "$REPO" archive --format=tar HEAD | tar -x -C "$DEST"

# 个人 / 第三方 / 许可未定的材料，不进公开版
EXCLUDE=(
  research/conversation-insights.md      # 本人心理侧写
  research/pilot-results                 # 被试 S01（无同意记录）
  research/nous-showcase.html            # 含真实模型输出
  research/nous-interview-demo.html      # 含真实模型输出
  examples/wildchat_sample.json          # WildChat 再分发，许可待核；用 ml/download_and_sample.py 自取
  examples/wildchat_results.json
  design/chats                           # 设计咨询原始对话
  .codex
)
for p in "${EXCLUDE[@]}"; do rm -rf "$DEST/$p"; done

cd "$DEST" && git init -q -b main && git add -A
if ! "$REPO/scripts/oss-precheck.sh"; then
  echo "✗ 自检未通过，未提交。修好后重跑。"; exit 1
fi
git commit -q -m "Nous: cognitive-layer AI twin (self-hosted) — public snapshot" && echo "✓ 干净副本已就绪：${DEST}（单次提交，无历史）"
