#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
用法：./scripts/local-deploy.sh [dev|preview]

  dev      启动支持热更新的开发服务（默认，端口 5173）
  preview  构建并预览生产版本（端口 4173）

需要 Node.js 24 和 npm。首次运行及后续运行均通过 npm ci 安装锁定依赖。
可通过 HOST 和 PORT 设置地址和端口，默认仅监听 127.0.0.1。
示例：PORT=5174 ./scripts/local-deploy.sh
      HOST=0.0.0.0 ./scripts/local-deploy.sh dev
按 Ctrl+C 停止服务。
默认每分钟同步原表；LOCAL_AUTO_SYNC=0 可关闭自动同步。
EOF
}

mode="${1:-dev}"
if [[ $# -gt 1 ]]; then
  usage >&2
  exit 1
fi
case "$mode" in
  -h|--help) usage; exit 0 ;;
  dev) default_port=5173 ;;
  preview) default_port=4173 ;;
  *) usage >&2; exit 1 ;;
esac

cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.."
if ! command -v node >/dev/null || ! command -v npm >/dev/null; then
  echo '请先安装 Node.js 24（包含 npm）。' >&2
  exit 1
fi
if [[ "$(node -p 'process.versions.node.split(".")[0]')" != 24 ]]; then
  echo '本项目要求 Node.js 24，请切换版本后重试。' >&2
  exit 1
fi

host="${HOST:-127.0.0.1}"
port="${PORT:-$default_port}"
if [[ ! "$port" =~ ^[0-9]{1,5}$ ]] || (( 10#$port < 1 || 10#$port > 65535 )); then
  echo 'PORT 必须是 1 到 65535 之间的整数。' >&2
  exit 1
fi

npm ci
export LOCAL_AUTO_SYNC="${LOCAL_AUTO_SYNC:-1}"
if [[ "$LOCAL_AUTO_SYNC" == 1 ]]; then
  npx playwright install chromium
fi
if [[ "$mode" == preview ]]; then
  npm run build
fi
echo '服务地址见下方 Vite 输出；按 Ctrl+C 停止。'
exec npm run "$mode" -- --host "$host" --port "$port" --strictPort
