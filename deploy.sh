#!/usr/bin/env bash
# cyk666-blog 一键部署脚本
# 用法: ./deploy.sh [--skip-build]
#   --skip-build  跳过本地构建（只同步已有 dist/）
#
# 流程: 构建 -> rsync 全量同步(dist 与服务器严格一致) -> 本地链路验证 -> 公网验证

set -euo pipefail

SERVER="root@101.132.167.178"
REMOTE_DIR="/var/www/testweb-dist-new"
SKIP_BUILD=0
[[ "${1:-}" == "--skip-build" ]] && SKIP_BUILD=1

cd "$(dirname "$0")"

echo "==> [1/4] 构建 Astro 站点"
if [[ $SKIP_BUILD -eq 1 ]]; then
  echo "    (跳过构建，使用现有 dist/)"
else
  npm run build
fi

echo "==> [2/4] rsync 全量同步到 $SERVER:$REMOTE_DIR"
# --delete: 服务器与本地 dist 严格一致，清除旧 hash 残留文件
rsync -az --delete -e "ssh -o ConnectTimeout=20 -o ServerAliveInterval=10" \
  dist/ "${SERVER}:${REMOTE_DIR}/"
echo "    同步完成"

echo "==> [3/4] 本地链路验证（Host: cyk666.top 直连 nginx）"
CSS_FILES=$(grep -o '_astro/[^"]*\.css' dist/index.html | sort -u)
FAILED=0
for CSS in $CSS_FILES; do
  CODE=$(ssh -o ConnectTimeout=15 "$SERVER" "curl -s -o /dev/null -w '%{http_code}' -H 'Host: cyk666.top' http://127.0.0.1/$CSS")
  if [[ "$CODE" == "200" ]]; then
    echo "    OK: /$CSS -> 200"
  else
    echo "    FAIL: /$CSS -> HTTP $CODE"
    FAILED=1
  fi
done
[[ $FAILED -eq 1 ]] && exit 1

echo "==> [4/4] 公网验证"
PUB_FAILED=0
for CSS in $CSS_FILES; do
  PUB=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://cyk666.top/$CSS" 2>/dev/null || true)
  if [[ "$PUB" == "200" ]]; then
    echo "    OK: https://cyk666.top/$CSS -> 200"
  else
    echo "    WARN: $CSS 公网返回 $PUB（可能是 Cloudflare 缓存延迟）"
    PUB_FAILED=1
  fi
done
if [[ $PUB_FAILED -eq 0 ]]; then
  echo ""
  echo "✅ 部署成功"
else
  echo "⚠️  部署完成但部分资源公网未即时生效"
fi