# 詳細設計 横断レビュー（v3）

- **対象:** `detailed-design/v3-balance-ui.md` + 既存 v1-core / v2-barcode（参照）
- **レビュー日:** 2026-06-14
- **判定:** 条件付き合格

## サマリー

v3 削除 API（walks, summary/week, dashboard/today, recalculate-targets）と v1/v2 継続 API の境界が明確。DB 名 `kenko_kanri` は basic-design 人間修正と一致。

## 横断指摘

### Critical

なし

### Suggestion

| ID | 該当箇所 | 指摘 | 修正案 |
|----|----------|------|--------|
| X-01 | v1-core vs v3 | v1-core に walk / target 定義が残存 | 実装・OpenAPI 更新時に v3 を正とする注記を contract に追加 |
| X-02 | weight_logs | v1-core ER に bmi/lbm 未記載 | v3 migration 003 相当は v3-balance-ui §3.3 が正 |

## 段階全体判定

**条件付き合格**（Critical 0）
