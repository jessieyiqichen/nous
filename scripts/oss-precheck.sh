#!/bin/bash
# 开源推送前自检：在当前 git 跟踪文件里搜密钥/身份/本机路径的通用模式。任何命中都退出非 0。
# 用法：scripts/oss-precheck.sh   （在准备公开的仓库目录里跑）
set -uo pipefail
PATTERNS=(
  'sk-[A-Za-z0-9]{16,}'                 # OpenAI/DeepSeek/Anthropic 风格 key
  'cli_[0-9a-f]{12,}'                   # 飞书 App ID
  'eyJhbGci[A-Za-z0-9_-]{20,}'          # JWT（Supabase 等）
  'ou_[0-9a-f]{24,}'                    # 飞书 open_id
  'https://[a-z0-9]{15,}\.supabase\.co' # 真实 Supabase 项目地址
  '([0-9]{1,3}\.){3}[0-9]{1,3}:[0-9]{2,5}' # 裸 IP:端口
  'root@[0-9]'                          # 服务器登录串
  '/Users/[a-z]+/'                      # 本机用户路径
  'data/subjects/[a-z0-9]+/'            # 具名被试目录
)
EXCLUDE=(':!*package-lock.json' ':!examples/wildchat*' ':!scripts/oss-precheck.sh' ':!scripts/oss-export.sh')
fail=0
for p in "${PATTERNS[@]}"; do
  hits=$(git grep -n -I -E "$p" -- . "${EXCLUDE[@]}" | head -5)
  if [ -n "$hits" ]; then
    echo "✗ 命中 $p"; echo "$hits" | cut -c1-140; fail=1
  fi
done
for f in research/pilot-results research/conversation-insights.md data/subjects research/nous-showcase.html research/nous-interview-demo.html; do
  if git ls-files --error-unmatch "$f" >/dev/null 2>&1; then echo "✗ 仍在跟踪：$f（个人/第三方材料，公开版应剔除）"; fi
done
[ $fail -eq 0 ] && echo "✓ 模式检查通过（上面若有「仍在跟踪」提示请人工确认）"
exit $fail
