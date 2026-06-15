#!/usr/bin/env bash
# 健康管理（kenko-kanri）— Raspberry Pi ネイティブセットアップ
set -euo pipefail

APP_USER="${APP_USER:-$USER}"
APP_DIR="${APP_DIR:-/home/$APP_USER/kenko-kanri}"
REPO_SRC="${REPO_SRC:-}"
MYSQL_ROOT_PASS="${MYSQL_ROOT_PASS:-}"
DB_NAME="kenko_kanri"
DB_USER="sanpo"
DB_PASS="${DB_PASS:-sanpo}"

echo "==> 健康管理 Pi セットアップ"
echo "    APP_DIR=$APP_DIR"

if [[ -z "$REPO_SRC" ]]; then
  REPO_SRC="$(cd "$(dirname "$0")/../../.." && pwd)"
fi

# --- 1. パッケージ ---
echo "==> パッケージインストール"
sudo apt-get update
sudo apt-get install -y mysql-server python3 python3-venv git curl build-essential pkg-config

# Node.js（フロントビルド用。18+）
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
  sudo apt-get install -y nodejs
fi

# uv
if ! command -v uv >/dev/null 2>&1; then
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
fi

# --- 2. アプリ配置 ---
echo "==> アプリを $APP_DIR に配置"
mkdir -p "$(dirname "$APP_DIR")"
if [[ ! -d "$APP_DIR/.git" ]] && [[ "$REPO_SRC" != "$APP_DIR" ]]; then
  rsync -a --exclude .venv --exclude node_modules --exclude dist \
    "$REPO_SRC/" "$APP_DIR/"
fi
cd "$APP_DIR/src/backend"

# --- 3. MySQL ---
echo "==> MySQL 設定"
sudo systemctl enable mysql
sudo systemctl start mysql

if [[ -n "$MYSQL_ROOT_PASS" ]]; then
  MYSQL_ADMIN=(mysql -u root -p"$MYSQL_ROOT_PASS")
else
  MYSQL_ADMIN=(sudo mysql)
fi

"${MYSQL_ADMIN[@]}" -e "CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
"${MYSQL_ADMIN[@]}" -e "CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';"
"${MYSQL_ADMIN[@]}" -e "GRANT ALL PRIVILEGES ON ${DB_NAME}.* TO '${DB_USER}'@'localhost';"
"${MYSQL_ADMIN[@]}" -e "FLUSH PRIVILEGES;"

# --- 4. .env ---
cat > .env <<EOF
DATABASE_URL=mysql+pymysql://${DB_USER}:${DB_PASS}@localhost:3306/${DB_NAME}
TZ=Asia/Tokyo
EOF

# --- 5. Python 依存 & DB マイグレーション ---
uv sync
uv run alembic upgrade head

# --- 6. フロントビルド ---
echo "==> フロントエンドビルド"
cd "$APP_DIR/src/frontend"
npm ci 2>/dev/null || npm install
npm run build

UV_BIN="$(command -v uv)"
sudo tee /etc/systemd/system/kenko-kanri.service >/dev/null <<EOF
[Unit]
Description=Kenko-kanri health dashboard API
After=mysql.service
Requires=mysql.service

[Service]
Type=simple
User=${APP_USER}
WorkingDirectory=${APP_DIR}/src/backend
EnvironmentFile=${APP_DIR}/src/backend/.env
ExecStart=${UV_BIN} run uvicorn app.main:app --host 0.0.0.0 --port 8080
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable kenko-kanri
sudo systemctl restart kenko-kanri

PI_IP=$(hostname -I | awk '{print $1}')
echo ""
echo "============================================"
echo " セットアップ完了"
echo " ブラウザ: http://${PI_IP}:8080"
echo " iPhone:   http://${PI_IP}:8080/api/v1/sync/health"
echo " 状態確認: sudo systemctl status kenko-kanri"
echo " ログ:     journalctl -u kenko-kanri -f"
echo "============================================"
