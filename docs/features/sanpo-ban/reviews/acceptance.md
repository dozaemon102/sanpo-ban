# 最終受入レポート

- **feature:** 健康管理（kenko-kanri）v3 UI 刷新
- **受入日:** 2026-06-14
- **判定:** 条件付き合格

## サマリー

v3（収支ダッシュボード・4 タブ UI・DB `kenko_kanri`・散歩廃止）を実装し、自動テスト 16 件・frontend ビルドで検証した。必須 AC のうち API 系は pytest で達成。UI 表示名・PFC 合計のみ・Pi 実機は**人間デプロイ後**に最終確認が必要。

v1/v2 機能（食事・バーコード・運動・Health 同期）は v3 上で継続。旧 AC-001〜018 の回帰は pytest で部分確認（食事・削除・バーコード）。

## 受入条件（AC）達成状況

### v3 スコープ

| AC ID | 内容 | 達成 | 根拠 |
|-------|------|------|------|
| AC-019 | LBM 同期後、収支式一致 | **はい** | `test_balance_with_lbm` |
| AC-020 | LBM 未同期時 `--` | **はい** | `test_health_sync_and_dashboard_top` |
| AC-021 | カードタップで日/週/月/年 | **部分** | API `test_dashboard_history`。UI セグメント実装済、Pi 手動要 |
| AC-022 | 散歩 UI/API なし | **はい** | `test_walk_api_removed` |
| AC-023 | 表示名「健康管理」 | **はい** | dist/index.html, manifest, `main.ts` |
| AC-024 | 食事タブ PFC 合計 g のみ | **部分** | `main.ts` 実装。Pi UI 手動要 |
| AC-025 | NEAT/TEF 変更 → 収支反映 | **はい** | `test_neat_tef_affects_balance` |

- **必須 AC 未達:** なし（AC-021/024 は API/コード達成、実機 UI は Pi デプロイ後確認）

### v1/v2 スコープ（継続）

AC-002〜018 は v1/v2 受入済。v3 で廃止した AC-001/007/008/012 は **意図的廃止**（目標 kcal・散歩・週タブ）。AC-014〜017（バーコード）は `test_barcode.py` で回帰確認。

## トレーサビリティ（FR → 設計 → コード → テスト）

| 要件 ID | 詳細設計 | 実装 | テスト | 状態 |
|---------|----------|------|--------|------|
| FR-040 | v3-balance-ui §3.1 | manifest, main.ts, pyproject | build grep | OK（repo フォルダ名は未 rename） |
| FR-041〜047 | §2.2 dashboard/top | `dashboard_service.py` | test_balance_* | OK |
| FR-044, FR-045 | §4.1 TOP | `main.ts` | test_dashboard_history | OK |
| FR-048 | 4 タブ | `main.ts` | 手動 | OK |
| FR-049, FR-043 | profile NEAT/TEF | migration 004, routes | test_neat_tef_* | OK |
| FR-050, FR-051 | Myセット / PFC | `main.ts` | 手動 | OK |
| FR-052, FR-053 | PWA / notion | manifest, notion.css | build | OK |
| FR-015〜039 | v2-barcode | 継続 | test_barcode.py | OK |
| FR-024〜026, FR-033 | 廃止 | routes 削除 | test_walk_api_removed | OK（廃止） |

- **必須 FR の断絶:** なし

## 権限マトリクスの検証

認証なし（NFR-002）。v3 新 API も同一 — **OK**。

## 将来要件の移管

変更なし（`future.md` 参照）。v3 で FR-016/032/034/035 は引き続き将来。

## verify-run 結果（参照）

- **判定:** 条件付き合格（`reviews/verify-run.md`）
- pytest 16 passed、build OK。Docker/Pi smoke 未実施

## review-code との整合

- Critical: **0 件**
- Suggestion 5 件（infra README 旧名、dead code 等）— 受入阻害なし

## 未達・フォローアップ

| 項目 | 対応 |
|------|------|
| Pi デプロイ | `kenko_kanri` DB + migration + systemd `kenko-kanri` |
| AC-021/024 実機 | Pi 上で TOP 履歴・食事タブを目視確認 |
| infra README | S-01: sanpo-ban 表記更新 |
| リポジトリ rename | FR-040 完全化（任意） |
