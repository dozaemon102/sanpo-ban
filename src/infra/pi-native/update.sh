#!/usr/bin/env bash
# 健康管理 — Pi 更新デプロイ（git pull 後に実行）
set -euo pipefail

APP_DIR="${APP_DIR:-$HOME/kenko-kanri}"
SERVICE="${SERVICE:-kenko-kanri}"

echo "==> 更新: $APP_DIR"
cd "$APP_DIR"

git pull origin main

cd src/backend
if [[ ! -f .env ]]; then
  echo "WARN: .env がありません。install.sh を実行するか .env を作成してください。"
fi
uv sync
uv run alembic upgrade head

cd ../frontend
npm ci 2>/dev/null || npm install
npm run build

restart_service() {
  echo "==> 再起動: $SERVICE"
  sudo systemctl restart "$SERVICE"
}

if systemctl list-unit-files 2>/dev/null | grep -q "^${SERVICE}.service"; then
  restart_service
elif systemctl list-unit-files 2>/dev/null | grep -q "^sanpo-ban.service"; then
  echo "WARN: kenko-kanri.service がありません。旧 sanpo-ban を再起動します。"
  SERVICE=sanpo-ban
  restart_service
else
  echo "WARN: systemd サービス未登録。install-service.sh を実行します。"
  chmod +x "$APP_DIR/src/infra/pi-native/install-service.sh"
  "$APP_DIR/src/infra/pi-native/install-service.sh"
  restart_service
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
