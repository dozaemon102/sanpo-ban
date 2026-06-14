# 詳細設計書: 散歩判 v2 バーコード食事

## 1. 概要

- **担当ユースケース / モジュール:** BarcodeLookup, Meals（拡張）, Frontend 食事画面
- **担当する要件 ID:** FR-015, FR-037, FR-038, FR-039（FR-036 削除 UI は v1.1 実装済・本書 §10 参照）
- **要件定義書:** `docs/features/sanpo-ban/requirements.md`
- **基本設計書:** `docs/features/sanpo-ban/basic-design.md`
- **デザインシステム:** notion（継続）
- **対象バージョン:** v2
- **前提:** v1-core 詳細設計・実装が稼働中（Pi + Tailscale）

**設計判断**

- OFF 呼出は **バックエンドのみ**（CORS・レスポンス正規化）
- バーコード lookup は **DB に保存しない**（都度 OFF 参照）。食事ログに `barcode` を任意保存
- 栄養値は **100 g あたり** を初期表示。確認画面で利用者が 1 食分に修正してから POST /meals

## 2. API 設計

ベース URL / プレフィックス / タイムゾーン / 認証: v1-core と同一

### 2.1 エンドポイント一覧（v2 追加分）

| メソッド | パス | 概要 | 要件 ID | 必要ロール |
|----------|------|------|---------|-----------|
| GET | `/api/v1/foods/barcode/{barcode}` | OFF 参照・栄養正規化 | FR-015, FR-037 | ROLE-001 |
| POST | `/api/v1/meals` | 食事追加（`barcode` 任意フィールド追加） | FR-038 | ROLE-001 |

### 2.2 エンドポイント詳細

#### `GET /api/v1/foods/barcode/{barcode}`

- **概要:** バーコード番号で Open Food Facts を参照し、アプリ内部形式に正規化して返す
- **認証:** 不要
- **パスパラメータ**

| パラメータ | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| barcode | string | ○ | 8〜14 桁数字（EAN-13 / JAN 想定。先頭 0 可） |

- **バリデーション:** `^[0-9]{8,14}$` に合致しない → 400 VALIDATION_ERROR

- **レスポンス（200）**

```json
{
  "barcode": "4901234567890",
  "name": "ツナマヨおにぎり",
  "kcal": 188,
  "protein_g": 6.0,
  "fat_g": 5.0,
  "carbs_g": 28.0,
  "source": "open_food_facts",
  "serving_note": "100gあたり（確認画面で編集してください）"
}
```

- **OFF 未登録（404）**

```json
{
  "error": {
    "code": "BARCODE_NOT_FOUND",
    "message": "Product not found in Open Food Facts"
  }
}
```

- **OFF タイムアウト / 通信失敗（502）**

```json
{
  "error": {
    "code": "OFF_UNAVAILABLE",
    "message": "Open Food Facts is temporarily unavailable"
  }
}
```

- **正規化ルール（基本設計 OPN-006）**

| フィールド | 優先順 |
|-----------|--------|
| name | `product_name_ja` → `product_name` → `generic_name_ja` → `generic_name` → `"不明な商品"` |
| kcal | `nutriments.energy-kcal_100g` → `nutriments.energy-kcal` → kJ/4.184 → 欠損時 0 |
| protein_g | `nutriments.proteins_100g` → 0 |
| fat_g | `nutriments.fat_100g` → 0 |
| carbs_g | `nutriments.carbohydrates_100g` → 0 |

- **外部呼出:** `GET https://world.openfoodfacts.org/api/v2/product/{barcode}.json`
- **タイムアウト:** 5 秒（NFR-009）。`User-Agent: Sanpo-ban/2.0 (personal use)` を付与

#### `POST /api/v1/meals`（拡張）

v1-core の body に以下を **任意** 追加:

| フィールド | 型 | 必須 | 説明 |
|-----------|-----|------|------|
| barcode | string | — | 8〜14 桁。lookup したバーコードを保存 |

```json
{
  "log_date": "2026-06-13",
  "name": "ツナマヨおにぎり",
  "kcal": 188,
  "protein_g": 6.0,
  "fat_g": 5.0,
  "carbs_g": 28.0,
  "food_preset_id": null,
  "barcode": "4901234567890"
}
```

- `food_preset_id` は **null**（バーコード経由ではプリセットを作らない — AC-017）
- 手入力フォールバック時は `barcode` 省略可

## 3. データベース設計

### 3.1 変更概要

v1 `meal_logs` に列追加のみ。新テーブルなし。

### 3.2 マイグレーション `002_meal_barcode`

#### `meal_logs` 追加列

| カラム | 型 | NULL | デフォルト | 説明 |
|--------|-----|------|-----------|------|
| barcode | VARCHAR(14) | YES | NULL | JAN/EAN。手入力・プリセット経由は NULL |

**インデックス:** 追加なし（個人利用・件数少）

## 4. 画面詳細

### 4.1 食事画面（拡張）

| 画面 / 状態 | 項目 | 必須 | バリデーション | API |
|------------|------|------|---------------|-----|
| 食事 | 「バーコード」ボタン | — | — | — |
| スキャン | カメラプレビュー | — | BarcodeDetector 対応時 | — |
| スキャン | 番号手入力 | — | 8〜14 桁数字 | GET /foods/barcode/{code} |
| 確認 | 名称 | ○ | 1〜200 字 | — |
| 確認 | kcal / P / F / C | ○ | ≥0 | POST /meals |
| 確認 | 「追加」 | ○ | — | POST /meals |
| 確認 | 「キャンセル」 | — | — | — |
| エラー | OFF 未ヒット / 502 | — | — | 手入力フォームへ遷移 |
| 食事 | 当日一覧・削除 | — | — | GET /meals, DELETE /meals/{id}（v1.1） |

### 4.2 バーコードスキャン UI

1. 「バーコード」タップ → 全画面モーダル（Notion カード + `primary` ボタン）
2. `BarcodeDetector` で `ean_13` / `upc_a` を検出
3. 検出成功 → 即 `GET /foods/barcode/{code}`
4. カメラ非対応 / 拒否 → 手入力フィールド + 「検索」ボタンのみ表示（OPN-007）
5. ローディング中はスピナー + 「商品を検索中…」

### 4.3 確認画面 UI

- 商品名（編集可 input）
- kcal, P, F, C（number input、小数 1 桁）
- `serving_note` を `muted` テキストで表示
- 「食事に追加」→ POST /meals → 食事タブを再描画 → モーダル閉じる

## 5. エラーハンドリング

### 5.1 追加分

| コード | HTTP | 説明 | 発生条件 |
|--------|------|------|----------|
| BARCODE_NOT_FOUND | 404 | OFF に商品なし | status!=1 または product 空 |
| OFF_UNAVAILABLE | 502 | OFF 到達不可 | timeout, DNS, 5xx |
| VALIDATION_ERROR | 400 | バーコード形式不正 | 正規表現不一致 |

フロントは **404 / 502 とも手入力フォームへフォールバック**（FR-039）。トーストで理由を 1 行表示。

### 5.2 共通方針

- OFF レスポンス body はログに全文出さない（サイズ制限）。barcode + status のみ INFO ログ
- 500 時は v1-core 同様

## 6. シーケンス

### 6.1 バーコード → 食事追加（成功）

```mermaid
sequenceDiagram
  participant UI as Web UI
  participant API as FastAPI
  participant OFF as Open Food Facts
  participant DB as MySQL

  UI->>UI: BarcodeDetector 読取
  UI->>API: GET /foods/barcode/{code}
  API->>OFF: GET /api/v2/product/{code}.json
  OFF-->>API: product JSON
  API->>API: normalize name/kcal/PFC
  API-->>UI: 200 FoodLookup
  UI->>UI: 確認画面（編集可）
  UI->>API: POST /meals {..., barcode}
  API->>DB: INSERT meal_logs
  API-->>UI: 201 MealLog
  UI->>API: GET /dashboard/today
  API-->>UI: updated intake
```

### 6.2 OFF 未ヒット → 手入力

```mermaid
sequenceDiagram
  participant UI as Web UI
  participant API as FastAPI
  participant OFF as Open Food Facts

  UI->>API: GET /foods/barcode/{code}
  API->>OFF: GET product
  OFF-->>API: status 0 / 404
  API-->>UI: 404 BARCODE_NOT_FOUND
  UI->>UI: 手入力フォーム（名称・kcal・PFC 空）
  UI->>API: POST /meals（barcode 省略可）
```

## 7. 認可の実装方針

v1-core と同一。新 API も認可チェックなし。

## 8. バックエンド構成

| コンポーネント | パス（想定） | 責務 |
|---------------|-------------|------|
| `OpenFoodFactsClient` | `app/services/open_food_facts.py` | HTTP 呼出・タイムアウト・JSON  parse |
| `normalize_product` | 同上 | OFF → FoodLookup DTO |
| route | `app/api/routes.py` | `GET /foods/barcode/{barcode}` |
| schema | `app/schemas/api.py` | `FoodLookupResponse`, `MealLogCreate.barcode` |
| migration | `alembic/versions/002_meal_barcode.py` | meal_logs.barcode |

**環境変数（`.env`）**

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| OFF_API_BASE_URL | `https://world.openfoodfacts.org` | OFF ベース URL |
| OFF_TIMEOUT_SECONDS | `5` | httpx timeout |

## 9. 要件トレーサビリティ

| 要件 ID | 詳細設計要素 |
|---------|-------------|
| FR-015 | GET /foods/barcode, OFF クライアント |
| FR-037 | BarcodeDetector + 手入力 UI |
| FR-038 | 確認画面, POST /meals |
| FR-039 | 404/502 → 手入力フォールバック |
| AC-014〜017 | §4 画面, POST /meals 制約 |
| NFR-009 | OFF_TIMEOUT_SECONDS=5 |
| NFR-010 | Pi egress（運用前提） |

## 10. v1.1 追補（記録削除 — 実装済）

v1-core 未記載だが v1.1 hotfix で追加済み。FR-036 / AC-018。

| メソッド | パス | 概要 |
|----------|------|------|
| DELETE | `/api/v1/walks/{id}` | 散歩削除 |
| DELETE | `/api/v1/weights/{id}` | 体重削除 |

食事・トレッドミル・筋トレ DELETE は v1-core 記載どおり。各タブに削除ボタン UI あり。

## 11. 未決事項

| ID | 内容 | 実装で解決 |
|----|------|-----------|
| IMP-003 | `BarcodeDetector` 非対応ブラウザの判定 | はい（feature detect） |
| IMP-004 | OFF レート制限時のリトライ | いいえ（502 → 手入力） |
| IMP-005 | serving_size 自動パース | いいえ（Phase 2 以降。確認画面編集で足りる） |

## 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-06-13 | 初版作成（バーコード lookup API、meal_logs.barcode、画面・シーケンス） |
