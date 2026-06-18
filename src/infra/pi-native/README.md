# Raspberry Pi ネイティブ運用（Docker 不要）

**この PC に Docker を入れず**、ラズパイだけで API + MySQL + Web UI を動かす手順です。

## 前提

| 項目 | 内容 |
|------|------|
| 機材 | Raspberry Pi 4/5 推奨 |
| OS | Raspberry Pi OS（64bit） |
| ストレージ | **USB SSD 推奨**（SD のみでも可。MySQL 書込み多め） |
| ネットワーク | Pi と iPhone / PC が **同じ Wi‑Fi（LAN）** |

## 1. コードを Pi に置く

### 方法 A: git（おすすめ）

PC で `projects/sanpo-ban` を GitHub 等に push し、Pi で:

```bash
git clone <your-repo-url> ~/sanpo-ban
cd ~/sanpo-ban
git checkout feature/sanpo-ban   # 作業ブランチ
```

### 方法 B: scp（Windows PowerShell）

```powershell
scp -r C:\Users\ie\Desktop\workspace\projects\sanpo-ban pi@<PiのIP>:~/sanpo-ban
```

## 2. Pi で一括セットアップ

Pi に SSH して:

```bash
cd ~/sanpo-ban
chmod +x src/infra/pi-native/install.sh
./src/infra/pi-native/install.sh
```

初回 MySQL root にパスワードがある場合:

```bash
MYSQL_ROOT_PASS='your-root-password' ./src/infra/pi-native/install.sh
```

**systemd のみ後から登録**（コードは既に `~/kenko-kanri` にある場合）:

```bash
chmod +x src/infra/pi-native/install-service.sh
./src/infra/pi-native/install-service.sh
sudo systemctl start kenko-kanri
```

DB パスワードを変える場合:

```bash
DB_PASS='strong-password' ./src/infra/pi-native/install.sh
```

## 3. 確認

Pi の IP を調べる:

```bash
hostname -I
```

| 確認 | URL |
|------|-----|
| **スマホ / PC ブラウザ** | `http://<PiのIP>:8080` |
| API ドキュメント | `http://<PiのIP>:8080/docs` |
| 疎通 | `curl http://localhost:8080/api/v1/profile` |

初回は **初回設定画面** → 身長・体重など入力 → 「今日」タブでダッシュボード。

## 4. iPhone ショートカット（歩数自動）

1. ショートカット → 自動化 → 1時間ごと（など）
2. 「ヘルスケアの値を取得」→ 歩数（今日）
3. 「URL の内容を取得」
   - URL: `http://<PiのIP>:8080/api/v1/sync/health`
   - メソッド: POST
   - 本文（JSON）:
     ```json
     {"date":"2026-06-13","steps":8000}
     ```
   - ※ 日付はショートカットの「現在の日付」変数を使う
4. Wi‑Fi 設定で **ローカルネットワーク** を許可

体重も送る場合は `"weight_kg":72.4` を追加。

## 5. USB SSD（推奨）

SD への MySQL 書込みを減らすため、**500GB クラスの USB SSD** を推奨します。

### 最小構成（データだけ SSD）

1. SSD を `/mnt/ssd` にマウント（`/etc/fstab` に UUID 登録）
2. MySQL データ移行:

```bash
sudo systemctl stop mysql
sudo rsync -av /var/lib/mysql/ /mnt/ssd/mysql/
sudo mv /var/lib/mysql /var/lib/mysql.bak
echo 'datadir=/mnt/ssd/mysql' | sudo tee /etc/mysql/mysql.conf.d/sanpo-ssd.cnf
sudo systemctl start mysql
```

### 理想構成

Pi Imager で **USB SSD から OS 起動**（Pi 4/5 対応）。以降 SD は使わない。

## 6. 日常操作

```bash
# コード更新（推奨）
chmod +x src/infra/pi-native/update.sh
./src/infra/pi-native/update.sh

# 手動の場合
sudo systemctl restart kenko-kanri
```

**サービス名:** 新規インストールは `kenko-kanri`。旧環境は `sanpo-ban` のままのことがあります。

```bash
# どちらが動いているか確認
sudo systemctl status kenko-kanri
sudo systemctl status sanpo-ban
```

**デプロイ確認:**

```bash
curl -s http://localhost:8080/api/v1/meta
# {"app":"kenko-kanri","version":"3.0.1",...}

curl -sI http://localhost:8080/api/v1/foods/barcode/4901234567890 | grep -i content-type
# application/json であること（text/html なら API が壊れている）
```

設定タブ下部に `API 3.0.1` と表示されれば新バージョンです。

```bash
# 起動 / 停止 / 再起動
sudo systemctl start kenko-kanri
sudo systemctl stop kenko-kanri
sudo systemctl restart kenko-kanri

# ログ
journalctl -u sanpo-ban -f

# コード更新後
cd ~/sanpo-ban/src/backend && uv sync && uv run alembic upgrade head
cd ~/sanpo-ban/src/frontend && npm run build
sudo systemctl restart sanpo-ban
```

## 7. この PC でやること（Docker 不要）

| やること | 必要？ |
|----------|--------|
| Docker | **不要** |
| 動作確認 | ブラウザで `http://<PiのIP>:8080` を開くだけ |
| コード編集 | Cursor で編集 → git push → Pi で pull & restart |
| npm（PC） | 任意。Pi 上で `npm run build` すれば PC に Node 不要 |

## トラブルシュート

| 症状 | 対処 |
|------|------|
| 8080 に繋がらない | `sudo systemctl status kenko-kanri`（旧名 `sanpo-ban` も確認） / ファイアウォール |
| バーコード検索不可 | `curl -sI http://localhost:8080/api/v1/foods/barcode/4901234567890` が `application/json` か確認。`text/html` なら `npm run build` 後に再起動 |
| グラフが古い | ブラウザ強制再読み込み。設定タブに `Web 3.0.1-2 · API 3.0.1` 表示を確認 |
| Tailscale から古い UI | **スマホの PWA を削除**して再追加。Safari のサイトデータ削除。Pi で `curl -s http://\$(tailscale ip -4):8080/ \| grep assets` が新しい JS 名か確認 |
| 502 / DB エラー | `sudo systemctl status mysql` / `.env` の DATABASE_URL |
| iPhone から POST 失敗 | 同一 Wi‑Fi か、URL が Pi の IP か、ローカルネットワーク許可 |

## Docker Compose について

`src/infra/docker-compose.yml` は **PC 向け** の選択肢です。Pi 確認には **本手順（pi-native）を使ってください**。
