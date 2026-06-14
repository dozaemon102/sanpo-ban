# コードレビュー結果

- **対象:** `projects/sanpo-ban/src/`
- **参照:**
  - `docs/features/sanpo-ban/detailed-design/v1-core.md`
  - `docs/features/sanpo-ban/requirements.md`
- **レビュー日:** 2026-06-13
- **判定:** 条件付き合格

## verify-run 連携

- **verify-run 判定:** 条件付き合格
- **整合:** verify-run の Pi 実機確認・backend テスト成功と矛盾なし

## サマリー

v1-core 詳細設計の REST API・MySQL スキーマ・消費 kcal 計算は backend に実装されている。認証なし LAN 利用（NFR-002）どおり。frontend は Notion 風 UI で 5 タブ構成。必須 FR の多くは API 層で実装済みだが、自動テストは health sync・食事フロー・計算式に偏り、散歩/トレッドミル/筋トレ/週次は手動確認依存。

## 設計との対応状況

| 詳細設計ファイル | API | DB | 画面 | 認可 |
|-----------------|-----|-----|------|------|
| `v1-core.md` | 対応済 | 対応済（Alembic 001） | 対応済 | 該当なし（認証なし） |

## テストの存在（概要）

| 領域 | 必須 FR にテストあり | 認可テスト（許可・拒否） |
|------|---------------------|------------------------|
| backend | 一部（FR-020〜022, FR-010〜013, FR-002） | 該当なし |
| frontend | いいえ | — |

## 指摘一覧

### Critical

| ID | 該当ファイル | 指摘 | 修正案 |
|----|-------------|------|--------|
| — | — | なし | — |

### Suggestion

| ID | 該当ファイル | 指摘 | 修正案 |
|----|-------------|------|--------|
| S-01 | `tests/test_api.py` | 散歩・トレッドミル・筋トレ・週次 API の自動テストなし | Phase 2 前に API テスト追加 |
| S-02 | `requirements.md` AC-013 | Docker Compose 手順と Pi ネイティブの二系統 | README に Pi を正と明記（済: pi-native） |

## チェックリスト結果

| 区分 | 件数 |
|------|------|
| Critical | 0 |
| Suggestion | 2 |
