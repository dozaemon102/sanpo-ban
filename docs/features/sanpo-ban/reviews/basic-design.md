# 基本設計書レビュー結果（v3）

- **対象:**
  - `docs/features/sanpo-ban/basic-design.md`
  - `docs/architecture/tech-stack.md`
  - `docs/architecture/system-context.md`
- **レビュー日:** 2026-06-14
- **判定:** 条件付き合格

## サマリー

v3 要件（収支モデル・9 カード TOP・4 タブ・リネーム・散歩/週タブ廃止）が Balance / CardHistory / Settings モジュールと §10 計算方針に反映されている。OPN-008 は DB 名維持方針で解消。architecture 3 ファイル間に矛盾なし。

## 指摘一覧

### Critical

なし

### Suggestion

| ID | 該当箇所 | 指摘 | 修正案 |
|----|----------|------|--------|
| S-01 | §10.1 target_* 列 | 移行期間の DB 列扱いが概要のみ | 詳細設計 DD-008 で nullable / 削除順序を確定 |
| S-02 | §10.2 CardHistory | 週/月/年の集計定義未記載 | 詳細設計 OPN-010 で週起点（月曜）等を固定 |
| S-03 | §3 画面表 | v1 画面一覧が v3 と並存 | 実装時に Frontend Shell 差し替え。詳細設計で画面一覧 v3 版を主とする |

## チェックリスト結果

| 区分 | 件数 |
|------|------|
| Critical | 0 |
| Suggestion | 3 |
