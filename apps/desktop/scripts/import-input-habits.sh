#!/usr/bin/env bash
# 检测本机输入法 → PoC 导入 → 可选搜狗官方 .bin 导出 Rime
# 用法: ./scripts/import-input-habits.sh [搜狗词库备份.bin]
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> 本机已安装 / 有数据的输入法"
npx tsx electron/input-habit-scanner/list-imes-cli.ts

echo ""
echo "==> PoC 一键导入 → ~/.zhigeng/input-habits.json"
npx tsx electron/input-habit-scanner/import-cli.ts

SOGOU_BIN="${1:-}"
if [[ -n "$SOGOU_BIN" && -f "$SOGOU_BIN" ]]; then
	echo ""
	echo "==> 搜狗官方备份 → Rime (~/.zhigeng/rime-export/)"
	npx tsx electron/input-habit-scanner/export-rime-cli.ts "$SOGOU_BIN"
else
	echo ""
	echo "（跳过搜狗→Rime；传入官方 .bin 路径作为第一个参数可一并导出）"
fi
