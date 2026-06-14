# 技術スタック

## 1. 概要

個人向け LAN 内 Web アプリとして、Phase 1 は PC 上 Docker Compose で開発・検証し、同一構成を Raspberry Pi + USB SSD へ移行する。認証なし・単一利用者・MySQL 永続化を前提とする。

## 2. 技術選定

| レイヤ | 技術 | 選定理由 |
|--------|------|----------|
| フロントエンド | HTML + CSS + TypeScript（Vite ビルド） | スマホブラウザ優先。フレームワーク最小で PWA 化しやすい（NFR-008） |
| バックエンド | Python 3.12 + FastAPI | ワークスペース規約（Python 優先）、REST API・OpenAPI 自動生成（NFR-007） |
| ORM | SQLAlchemy 2.x | MySQL との型安全なマッピング、マイグレーション拡張しやすい |
| データベース | MySQL 8.0.x | ユーザー指定。Pi 移行時も同一エンジン（NFR-005） |
| インフラ（開発） | Docker Compose | API + MySQL を一括起動（NFR-004, AC-013） |
| インフラ（本番） | Raspberry Pi OS + Docker Compose + USB SSD | SD 寿命対策。MySQL datadir を SSD に配置（NFR-006） |

## 3. 開発・運用ツール

| 用途 | ツール |
|------|--------|
| Python パッケージ管理 | uv |
| Node パッケージ管理 | npm |
| DB マイグレーション | Alembic |
| API 契約 | OpenAPI 3（FastAPI 生成 + 手整備） |
| テスト | pytest（backend）、Vitest（frontend 任意） |
| CI/CD | Phase 1 ではローカル verify-run のみ。Pi デプロイ手順は infra README |

## 4. 制約・前提

- 認証・OAuth は Phase 1 では導入しない（NFR-002）
- 外部 API は Phase 1 では不使用（Open Food Facts は Phase 2）
- MySQL バージョンは **8.0.x** に pin（OPN-005 解消）。開発・Pi とも `8.0.36` イメージを推奨
- タイムゾーンは `Asia/Tokyo` 固定（日次集計の基準）
- iPhone 同期は iOS ショートカットから LAN 内 HTTP POST

## 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-06-13 | 初版作成 |
