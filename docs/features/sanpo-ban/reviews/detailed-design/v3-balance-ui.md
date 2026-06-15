# 詳細設計書レビュー結果: v3-balance-ui

- **対象:** `docs/features/sanpo-ban/detailed-design/v3-balance-ui.md`
- **レビュー日:** 2026-06-14
- **判定:** 条件付き合格

## サマリー

v3 必須 FR（収支・9 カード・履歴・4 タブ・リネーム・廃止）が API/DB/画面に具体化されている。DB `kenko_kanri` 新規方針は人間承認済み。Critical なし。

## 指摘一覧

### Critical

なし

### Suggestion

| ID | 該当箇所 | 指摘 | 修正案 |
|----|----------|------|--------|
| S-01 | §3.1 Alembic | init から反映 vs 004 migration の二択記載 | 実装時に init  squash か 004 単独のどちらかに統一 |
| S-02 | §2.1 継続 API | v1 詳細への参照のみ | OpenAPI 契約段階で v3 統合 yaml を生成 |

## チェックリスト結果

| 区分 | 件数 |
|------|------|
| Critical | 0 |
| Suggestion | 2 |
