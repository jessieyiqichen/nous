#!/bin/bash
# 部署分身服务到自己的服务器（/opt/nous-web，pm2 nous-web，nginx 反代到 3999）。
# 需要 NOUS_SERVER（root@host）和 NOUS_PUBLIC_BASE（外网 API 根，如 https://host:8443/nous）：环境变量或仓库根 .ops.env。
# 服务器内存 1.6G 不够跑 next build，所以在本地构建后 rsync 产物上去。
# 用法：cd web && ./scripts/deploy-aliyun.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
[ -f "$REPO/.ops.env" ] && . "$REPO/.ops.env"
: "${NOUS_SERVER:?请设置 NOUS_SERVER}"; : "${NOUS_PUBLIC_BASE:?请设置 NOUS_PUBLIC_BASE}"
HOST="$NOUS_SERVER"
REMOTE_DIR="/opt/nous-web"
WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"

echo "[1/4] 本地生产构建"
cd "$WEB_DIR" && npm run build > /dev/null

echo "[2/4] rsync 到 ${HOST}:${REMOTE_DIR}（不含 node_modules / .env* / .vercel）"
rsync -az --delete \
  --exclude node_modules --exclude .next/cache --exclude '.env*' --exclude .vercel --exclude .git \
  ./ "$HOST:$REMOTE_DIR/"

echo "[3/4] 服务器安装生产依赖 + 重启"
ssh "$HOST" "cd $REMOTE_DIR && npm ci --omit=dev --no-audit --no-fund >/dev/null 2>&1 && pm2 restart nous-web --update-env >/dev/null && sleep 5 && pm2 ls | grep nous-web | awk -F'│' '{print \$3,\$10,\$12}'"

echo "[4/4] 外网健康检查"
# 用无需鉴权的模型快照接口探活（webhook 有 token 校验，不适合当探针）
curl -sf -m 20 -o /dev/null "$NOUS_PUBLIC_BASE/api/model" \
  && echo "✅ 部署完成，线上健康"
