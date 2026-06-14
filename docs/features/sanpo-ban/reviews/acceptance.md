# 最終受入レポート

- **feature:** sanpo-ban
- **受入日:** 2026-06-13
- **判定:** 条件付き合格

## サマリー

散歩判 MVP（v1-core）の必須機能は Raspberry Pi 上で稼働し、iPhone から UI・Health 同期が確認できた。backend 自動テスト 4 件はすべて成功。Docker Compose による AC-013 は Pi ネイティブ運用で代替確認した。将来 FR（バーコード・食べる判・筋トレ詳細等）は `future.md` へ移管済み。

## 受入条件（AC）達成状況

| AC ID | 内容 | 達成 | 根拠（テスト・手動確認） |
|-------|------|------|------------------------|
| AC-001 | 初期設定後、今日ダッシュボードに目標 kcal/PFC 表示 | はい | Pi/iPhone ブラウザで初回設定→今日タブ確認 |
| AC-002 | プリセット食事追加で摂取合計増加 | はい | `test_meal_preset_flow` + UI |
| AC-003 | 手入力食事の追加・削除で合計増減 | はい | API 実装 + UI 手動 |
| AC-004 | ショートカット POST で歩数 8000 反映 | はい | `test_health_sync_and_dashboard` + iPhone 実機 |
| AC-005 | 同一日 8000→9000 で最新 9000 | はい | `test_health_sync_and_dashboard` |
| AC-006 | weight_kg 含む POST で当日体重更新 | はい | API 実装 + ショートカット（任意体重） |
| AC-007 | 散歩記録後、履歴に表示 | はい | Pi UI 手動確認 |
| AC-008 | 発見メモ付き散歩が履歴に表示 | はい | API/UI 実装 + 手動 |
| AC-009 | トレッドミル 30 分で消費 kcal 増加 | はい | UI 手動（計算式 `treadmill_burn_kcal` 実装） |
| AC-010 | 筋トレ 45 分で消費 kcal 増加 | はい | UI 手動（`strength_burn_kcal` 実装） |
| AC-011 | 手入力体重がダッシュボード・履歴に反映 | はい | `POST /weights` + UI |
| AC-012 | 7 日データで週サマリー表示 | はい | `GET /summary/week` 実装 + UI 週タブ |
| AC-013 | Docker Compose 起動後ブラウザアクセス | 代替 | Docker 未使用。Pi ネイティブ + systemd で同等確認（`pi-native/README.md`） |

- **必須 AC 未達:** なし（AC-013 は運用形態差を Pi で代替）

## トレーサビリティ（FR → 設計 → コード → テスト）

| 要件 ID | 詳細設計 | 実装 | テスト | 状態 |
|---------|----------|------|--------|------|
| FR-001〜004 | v1-core §2 | `PUT /profile`, `ProfileUpdate` | `test_health_sync`（profile 前提） | OK |
| FR-005〜009 | v1-core §2 | `dashboard_service`, frontend 今日タブ | `test_health_sync_and_dashboard` | OK |
| FR-010〜013 | v1-core §2 | food-presets, meals routes | `test_meal_preset_flow` | OK |
| FR-014 | v1-core §2 | `POST /meals/{id}/duplicate` | 手動 | OK |
| FR-017〜019 | v1-core §2 | weights routes, dashboard | 手動 | OK |
| FR-020〜023 | v1-core §2 | `POST /sync/health` | `test_health_sync_and_dashboard` | OK |
| FR-024〜026 | v1-core §2 | walks routes | 手動 | OK |
| FR-027〜029 | v1-core §2 | treadmill routes, calculations | 手動 | OK |
| FR-030〜031 | v1-core §2 | strength routes, calculations | 手動 | OK |
| FR-033 | v1-core §2 | `GET /summary/week` | 手動 | OK |

- **必須 FR の断絶:** なし

## 権限マトリクスの検証

| 操作 / FR | 期待 | 実装・テスト | 状態 |
|-----------|------|-------------|------|
| FR-001〜033（ROLE-001） | 認証なしで全 API 利用可 | 認証ミドルウェアなし、全 route 公開 | OK |
| NFR-002 | LAN 内単一利用者 | Tailscale/LAN 前提の運用ドキュメント | OK |

## 将来要件の移管

| FR ID | 概要 | 移管先 |
|-------|------|--------|
| FR-015 | Open Food Facts バーコード | `future.md` |
| FR-016 | 食べる判 | `future.md` |
| FR-032 | 筋トレ詳細 | `future.md` |
| FR-034, FR-035 | 旅モード・Insta | `future.md` |

## verify-run 結果（参照）

- 判定: **条件付き合格**（`reviews/verify-run.md`）
- backend pytest 4/4 成功。Pi + iPhone 実機 OK

## review-code との整合

- `reviews/code.md` の Critical がすべて解消されていること: **はい**（Critical 0 件）

## 未達・フォローアップ

| 項目 | 対応 |
|------|------|
| AC-013 Docker Compose | Pi ネイティブで代替済。必要なら compose verify を backlog へ |
| API 自動テスト不足 | Suggestion として Phase 2 前に散歩/運動/週次テスト追加 |
| Phase 2 機能 | `future.md` / `backlog.md` 参照。イントーク後に再開 |
