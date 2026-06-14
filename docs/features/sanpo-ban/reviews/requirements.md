# 要件定義書 レビュー結果

- **対象:** `projects/sanpo-ban/docs/features/sanpo-ban/requirements.md`
- **レビュー日:** 2026-06-13
- **判定:** 条件付き合格

## サマリー

スコープ・機能要件・受入条件が揃っており、MySQL / PC 先行 / iPhone 同期 / 認証なしの制約も一貫している。Critical 指摘はない。Suggestion 2 件は基本設計で解消可能。

## 指摘一覧

### Critical

なし

### Suggestion

| ID | 該当箇所 | 指摘 | 修正案 |
|----|----------|------|--------|
| S-001 | OPN-001〜003 | 消費 kcal・TDEE の式が未決 | 基本設計で計算式セクションを必須とする |
| S-002 | FR-014 | 任意要件に AC がない | 基本設計または Phase 1 スコープ確定時に AC 追加を検討 |

## チェックリスト結果

| 区分 | 件数 |
|------|------|
| Critical | 0 |
| Suggestion | 2 |
