# 実行検証結果（verify-run）

- **feature:** sanpo-ban v3 収支ダッシュボード・UI 刷新
- **検証日:** 2026-06-14
- **判定:** 条件付き合格

## 実行コマンドと結果

| 領域 | コマンド | 結果 | ログ要点 |
|------|---------|------|----------|
| backend テスト | `cd src/backend && uv run pytest -v` | **成功** | 16 passed |
| frontend テスト | — | 未実行 | package.json に test スクリプトなし |
| frontend ビルド | `cd src/frontend && npm run build` | **成功** | tsc + vite build。dist に「健康管理」確認 |
| 起動確認 | `TestClient` + ローカル MySQL | **未実行** | ローカル MySQL 未起動（Plugin 1524）。Docker Compose smoke は未実施 |
| ブラウザ実機 | — | 未実行 | Pi / Tailscale 上での UI 確認は人間ゲート後 |

## AC 自動検証（pytest 対応）

| AC | テスト / 確認 |
|----|---------------|
| AC-019 | `test_balance_with_lbm` |
| AC-020 | `test_health_sync_and_dashboard_top` |
| AC-021 | `test_dashboard_history` |
| AC-022 | `test_walk_api_removed` |
| AC-025 | `test_neat_tef_affects_balance` |
| AC-023/024 | frontend build（dist title/manifest「健康管理」）。PFC 残量なしは UI 手動要 |

## サマリー

必須の backend テスト・frontend ビルドは成功。v3 API（`/dashboard/top`, `/dashboard/history`）と walk 廃止はテストで確認済み。ローカル MySQL / Docker 起動 smoke と Pi 実機 UI は未実施のため**条件付き合格**。Pi デプロイ時に `kenko_kanri` DB 作成 + migration + 設定タブ初回セットアップを実施すること。

## 指摘（不合格時）

該当なし（不合格ではない）。

## Pi デプロイチェックリスト（人間）

- [ ] `DROP DATABASE sanpo_ban; CREATE DATABASE kenko_kanri;`
- [ ] `uv run alembic upgrade head`
- [ ] `systemctl restart kenko-kanri`
- [ ] 設定タブで初回セットアップ
- [ ] Health ショートカットで LBM 同期 → TOP 収支表示
- [ ] PWA 再追加（白背景アイコン）
