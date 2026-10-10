#!/bin/bash
# 双击启动五年级第5课《生活算法站》。端口8795。
cd "$(cd "$(dirname "$0")" && pwd)"
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
PORT=${PORT:-8795}
if ! command -v node >/dev/null; then
  echo '请先安装 Node.js 22.13 或更新版本（建议用官网 LTS 或 Homebrew），再打开本文件。'
  read -r -p '按回车退出' _
  exit 1
fi
if ! node -e 'const [a,b]=process.versions.node.split(".").map(Number);process.exit(a>22||(a===22&&b>=13)?0:1)'; then
  echo "当前 Node.js 为 $(node -v)，需要 22.13+（内置 SQLite）。"
  read -r -p '按回车退出' _
  exit 1
fi
if curl --silent --fail "http://localhost:$PORT/api/classes" >/dev/null 2>&1; then
  open "http://localhost:$PORT/teacher" 2>/dev/null || true
  echo "课堂服务已在运行：http://localhost:$PORT/teacher"
  read -r -p '按回车退出这个窗口' _
  exit 0
fi
PORT=$PORT node --no-warnings server.cjs &
lesson_pid=$!
trap 'kill $lesson_pid 2>/dev/null' EXIT INT TERM
for _ in $(seq 1 40); do
  if curl --silent --fail "http://localhost:$PORT/api/classes" >/dev/null 2>&1; then
    open "http://localhost:$PORT/teacher" 2>/dev/null || true
    echo "教师本机：http://localhost:$PORT/teacher"
    break
  fi
  if ! kill -0 $lesson_pid 2>/dev/null; then echo '启动失败'; read -r -p '按回车退出' _; exit 1; fi
  sleep 0.25
done
wait $lesson_pid
