# コードレビュー結果（v3）

- **対象:** `src/backend/`, `src/frontend/`, `src/infra/`（v3 実装）
- **参照:** `detailed-design/v3-balance-ui.md`, `contract/openapi.yaml`, `reviews/verify-run.md`
- **レビュー日:** 2026-06-14
- **verify-run:** 条件付き合格（pytest 16 / build OK、Docker・Pi 未実施）
- **判定:** 条件付き合格

## サマリー

v3 詳細設計の主要 API・DB 変更・UI 刷新が実装されている。収支計算（Katch–McArdle + NEAT + TEF）、walk 廃止、4 タブ UI、NEAT/TEF 設定は設計と一致。Critical なし。infra README の旧名称残存などは Pi デプロイ前に整理推奨。

## 設計対応（v3-balance-ui）

| 項目 | 状態 |
|------|------|
| GET /dashboard/top | ✓ `routes.py`, `dashboard_service.py` |
| GET /dashboard/history/{metric} | ✓ |
| Profile NEAT/TEF | ✓ migration 004, schemas |
| walk / today / summary 削除 | ✓ |
| DB kenko_kanri | ✓ compose, config, install.sh |
| Frontend 4 タブ + 9 カード | ✓ `main.ts` |
| PWA 健康管理・白背景 | ✓ manifest, index.html |

## 指摘一覧

### Critical

なし

### Suggestion

| ID | 該当箇所 | 指摘 | 修正案 |
|----|----------|------|--------|
| S-01 | `infra/README.md`, `pi-native/README.md` | 旧名 sanpo-ban / systemd 手順が残存 | kenko-kanri に更新（NFR-012） |
| S-02 | `calculations.py` | `suggest_targets` / Mifflin BMR が未使用 dead code | v3 移行完了後に削除 |
| S-03 | `routes.py` put_profile | 設定保存のたびに WeightLog 追加 | 体重変更時のみ INSERT に限定可 |
| S-04 | `package-lock.json` | name が sanpo-ban-web のまま | `npm install` で lock 更新 |
| S-05 | リポジトリ slug | フォルダ `sanpo-ban` のまま | FR-040 完全対応はリポジトリ rename（別 PR 可） |

## テスト

| 領域 | 概要 |
|------|------|
| backend | 16 tests — 収支・履歴・walk 404・NEAT/TEF・バーコード |
| frontend | ビルドのみ（単体テストなし） |

## チェックリスト結果

| 区分 | 件数 |
|------|------|
| Critical | 0 |
| Suggestion | 5 |
