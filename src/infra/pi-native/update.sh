#!/usr/bin/env bash
# 健康管理 — Pi 更新デプロイ（git pull 後に実行）
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/kenko-kanri}"
SERVICE="${SERVICE:-kenko-kanri}"

echo "==> 更新: $APP_DIR"
cd "$APP_DIR"

git pull origin main

cd src/backend
uv sync
uv run alembic upgrade head

cd ../frontend
npm ci 2>/dev/null || npm install
npm run build

echo "==> 再起動: $SERVICE"
if systemctl list-unit-files | grep -q "^${SERVICE}.service"; then
  sudo systemctl restart "$SERVICE"
elif systemctl list-unit-files | grep -q "^sanpo-ban.service"; then
  echo "WARN: kenko-kanri.service がありません。旧 sanpo-ban を再起動します。"
  sudo systemctl restart sanpo-ban
  SERVICE=sanpo-ban
else
  echo "ERROR: systemd サービスが見つかりません。"
  echo "  sudo systemctl list-unit-files | grep -E 'kenko|sanpo'"
  exit 1
fi

PI_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "============================================"
echo " 更新完了"
echo " 確認: curl -s http://localhost:8080/api/v1/meta"
echo " 確認: curl -sI http://localhost:8080/api/v1/foods/barcode/4901234567890 | head -1"
echo " ブラウザ: http://${PI_IP}:8080 （強制再読み込み）"
echo " サービス: sudo systemctl status $SERVICE"
echo "============================================"
