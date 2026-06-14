# プロジェクトバックログ

プロジェクト横断の将来要件・保留事項を集約する。
feature 固有の将来 FR は `docs/features/sanpo-ban/future.md` に置き、ここからリンクする。

## 将来要件

| ID | feature | 概要 | 由来（FR ID） | 優先度 | 状態 |
|----|---------|------|--------------|--------|------|
| BL-001 | sanpo-ban | バーコード + Open Food Facts 連携 | FR-012 | 将来 | 未着手 |
| BL-002 | sanpo-ban | 食べる判（○△×）と残りカロリー連動 | FR-013 | 将来 | 未着手 |
| BL-003 | sanpo-ban | 筋トレ詳細（種目・重量・セット×回） | FR-021 | 将来 | 未着手 |
| BL-004 | sanpo-ban | 旅モード・Instagram タグメモ連携 | FR-031 | 将来 | 未着手 |
| BL-005 | sanpo-ban | Raspberry Pi 本番デプロイ手順・SSD 構成 | NFR-004 | 将来 | 未着手 |

## 保留・未決

| 項目 | feature | 内容 | 次のアクション |
|------|---------|------|---------------|
| トレッドミル中の歩数二重計上 | sanpo-ban | ジム中は歩数由来消費を抑制するか | 基本設計でルール確定 |
| 消費カロリー計算式 | sanpo-ban | MET 係数・歩数 kcal 換算の精度 | 基本設計で式を定義 |

## feature 別 future.md

| feature | パス |
|---------|------|
| sanpo-ban | `docs/features/sanpo-ban/future.md`（Phase 6 で作成） |
