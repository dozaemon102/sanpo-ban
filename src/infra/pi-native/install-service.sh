#!/usr/bin/env bash
# kenko-kanri の systemd ユニットのみ登録（初回 install.sh 未実施環境向け）
set -euo pipefail

APP_USER="${APP_USER:-$USER}"
APP_DIR="${APP_DIR:-$HOME/kenko-kanri}"

if [[ ! -d "$APP_DIR/src/backend" ]]; then
  echo "ERROR: $APP_DIR/src/backend がありません。APP_DIR を確認してください。"
  exit 1
fi

if ! command -v uv >/dev/null 2>&1; then
  echo "ERROR: uv が見つかりません。PATH に ~/.local/bin を追加するか install.sh を実行してください。"
  exit 1
fi

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
echo "==> kenko-kanri.service を登録しました"
echo "    起動: sudo systemctl start kenko-kanri"
