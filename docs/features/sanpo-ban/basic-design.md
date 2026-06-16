# 基本設計書: 健康管理（kenko-kanri）

## 1. 概要

承認済み要件定義書に基づき、個人向けダイエット・体組成ダッシュボードのシステム構成・モジュール・画面・データ概念・計算方針を定義する。v1/v2 は PC / Pi 上 Docker Compose で稼働済み。**v3** では UI 刷新・収支モデル変更・アプリ全面リネーム・散歩/週タブ廃止を行う。

- **要件定義書:** `docs/features/sanpo-ban/requirements.md`
- **対象バージョン:** v1 + v2 + **v3（UI 刷新・収支モデル・リネーム）**
- **旧称:** 散歩判（sanpo-ban）— v3 でユーザー向け表記・slug を `kenko-kanri` に統一

## 2. 機能構成

### 2.1 モジュール一覧

| モジュール | 責務 | 対応する要件 ID |
|-----------|------|----------------|
| Profile | 身体情報の管理。**v3:** NEAT・TEF 率。目標 kcal/PFC は廃止 | FR-001, FR-004, FR-049 |
| Dashboard | **v3:** TOP 9 カード（収支中心）。旧: 摂取・消費・残量 | FR-041, FR-044〜046 |
| Meals | 食品 Myセット・食事ログの CRUD | FR-010〜013, FR-050, FR-051 |
| Body | 体重・体組成の手入力・履歴 | FR-017〜019, FR-046 |
| HealthSync | iPhone ショートカットからの歩数・体重・体組成取込 | FR-020〜023 |
| Walks | ~~散歩セッション~~ **v3 廃止** | ~~FR-024〜026~~ |
| Exercises | トレッドミル・筋トレ（クイック）記録と消費 kcal 算出 | FR-027〜031 |
| Summary | ~~週タブ単独画面~~ **v3 廃止**（CardHistory に統合） | ~~FR-033~~ |
| Frontend Shell | 画面遷移・PWA シェル・API クライアント。**v3:** 4 タブ | FR-048, FR-052, FR-053 |
| **BarcodeLookup（v2）** | **バーコード → Open Food Facts 参照・栄養情報正規化** | **FR-015, FR-037〜039** |
| **RecordDelete（v1.1）** | **食事・散歩・運動・体重の誤記録削除 UI** | **FR-013, FR-036** |
| **Balance（v3）** | **収支集計（摂取 − BMR − NEAT − 運動 − TEF）** | **FR-041, FR-046, FR-047** |
| **CardHistory（v3）** | **TOP カード別の日/週/月/年推移** | **FR-045** |
| **Settings（v3）** | **身体情報・NEAT・TEF 率の編集** | **FR-049, FR-043** |

### 2.2 機能フロー（概要）

**初回利用**

1. 利用者が身体情報（身長・生年月日・性別・体重）を入力
2. Profile が BMR/TDEE を算出し、目標 kcal と PFC グラム目標を提案
3. 利用者が目標を確認または上書き保存
4. Dashboard を表示

**日常利用（食事）**

1. Dashboard から食事入力へ
2. プリセット 1 タップ、または手入力（名称・kcal・P/F/C）
3. Meals が食事ログを保存
4. Dashboard が当日摂取合計を再計算

**日常利用（歩数・体重・自動）**

1. iPhone ショートカットが 1 時間ごと（または散歩後）に `POST /api/sync/health` を実行
2. HealthSync が歩数（必須）・体重（任意）を upsert
3. Dashboard が歩数表示と歩数由来消費 kcal を更新

**日常利用（散歩・運動）**

1. 「散歩した」→ Walks がセッション記録（任意で発見メモ）
2. ジム: Exercises でトレッドミル（分数 + 任意パラメータ）または筋トレ（種目 + 分数）を記録
3. Dashboard が運動消費 kcal を合算

**週次確認**

1. Summary 画面で 7 日間の平均摂取・歩数・体重推移・運動回数を表示

**v2: バーコード食事記録**

1. 食事画面で「バーコード」をタップ
2. ブラウザカメラで JAN/EAN を読取（失敗時は番号手入力）
3. BarcodeLookup が Pi 上の API 経由で Open Food Facts を参照
4. 確認画面で名称・kcal・P/F/C を表示（利用者が修正可）
5. 確定 → Meals が **当日食事ログのみ** 追加（プリセットは作らない）
6. OFF 未ヒット / API 失敗 → 既存の手入力フォームへフォールバック

**v1.1: 誤記録の削除**

1. 各タブの当日一覧から「削除」→ 該当ログを DB から除去 → Dashboard 再集計

## 3. 画面・インターフェース概要

| 画面 / IF | 目的 | 対応する要件 ID |
|-----------|------|----------------|
| 初期設定 / 設定 | 身体情報・目標 kcal/PFC の登録・変更 | FR-001〜004 |
| 今日（Dashboard） | 摂取・消費・残量・歩数・体重の一覧 | FR-005〜009 |
| 食事 | プリセット選択・手入力・**バーコード読取・確認**・当日一覧・削除 | FR-010〜013, FR-015, FR-037〜039 |
| 食品プリセット管理 | 定番食品の登録・編集 | FR-010 |
| 体重 | 手入力・履歴一覧 | FR-017, FR-019 |
| 散歩 | 「歩いた」ボタン・発見メモ・履歴 | FR-024〜026 |
| 運動 | トレッドミル / 筋トレ入力・当日一覧 | FR-027〜031 |
| 週サマリー | 7 日集計・体重推移 | FR-033 |
| REST API | Web UI および iPhone ショートカット I/F | 全 FR |
| Health Sync API | `POST /api/sync/health`（歩数・体重） | FR-020〜023 |

**ナビゲーション:** 下部タブ（今日 / 食事 / 散歩 / 運動 / 週）+ 設定はヘッダから。

## 4. データ概要

### 4.1 主要エンティティ

| エンティティ | 説明 | 主要属性（概念レベル） |
|-------------|------|----------------------|
| UserProfile | 単一利用者プロファイル | 身長、生年月日、性別、最新体重参照、目標 kcal、目標 P/F/C（g） |
| FoodPreset | 定番食品 | 名称、kcal、タンパク質 g、脂質 g、炭水化物 g |
| MealLog | 食事記録 | 記録日、名称、kcal、P/F/C、プリセット参照（任意）、**バーコード（任意・v2）** |
| DailySteps | 日次歩数 | 記録日、歩数、最終同期日時、ソース |
| WeightLog | 体重記録 | 記録日時、体重 kg、ソース（manual / shortcuts） |
| WalkSession | 散歩セッション | 記録日時、発見メモ（任意） |
| TreadmillLog | トレッドミル | 記録日時、分数、速度、傾斜、マシン kcal（任意）、算出 kcal |
| StrengthLog | 筋トレ（クイック） | 記録日時、種目コード、分数、算出 kcal |
| DailySummary | 日次集計キャッシュ（任意） | 記録日、摂取/消費合計 — 詳細設計で要否判断 |

**日付の基準:** すべて `Asia/Tokyo` の暦日。

### 4.2 計算方針（設計判断）

要件定義 OPN-001〜004 を以下のとおり解消する。

#### TDEE・目標 kcal（FR-002, OPN-003）

- **BMR:** Mifflin-St Jeor 式
  - 男性: `10×kg + 6.25×cm − 5×年齢 + 5`
  - 女性: `10×kg + 6.25×cm − 5×年齢 − 161`
- **TDEE:** `BMR × 活動係数`
- **活動係数デフォルト:** `1.375`（軽い運動・週 1–3 回）。設定画面で `1.2 / 1.375 / 1.55 / 1.725` から選択可
- **目標 kcal デフォルト:** `TDEE − 500`（下限 1200 kcal）。利用者が上書き可能

#### 目標 PFC（FR-003）

- **デフォルト比率:** タンパク質 30% / 脂質 25% / 炭水化物 45%（kcal ベース）
- **タンパク質下限:** `体重 kg × 1.6 g` を下限として、比率換算値との **大きい方** を P 目標とする
- 利用者が g または比率を上書き可能

#### 歩数 → 消費 kcal（FR-022, OPN-001）

**前提（OPN-002）:** トレッドミル中はスマホを携行しない。iPhone 歩数にジム走行分は含まれないため、**歩数控除・二重計上防止ロジックは設けない**。

- **歩行消費 kcal:**  
  `walk_burn = floor(steps × weight_kg × 0.0005)`  
  （体重 72 kg・1 万歩で約 360 kcal）
- トレッドミル消費 kcal は別途 Exercises で加算（下記）。歩数と独立して合算する。

#### トレッドミル消費 kcal（FR-029）

- **マシン kcal 入力あり:** その値を採用
- **なし:** MET 推定  
  `burn = MET × weight_kg × (minutes / 60)`  
  - MET デフォルト 9.0（走行）。速度入力時は 8.0（6 km/h 未満）/ 9.0（6–10）/ 10.0（10 超）に切替

#### 筋トレ消費 kcal（FR-031, OPN-004）

- **種目テンプレ初期値:**

| コード | 表示名 | MET |
|--------|--------|-----|
| chest | 胸 | 6.0 |
| back | 背中 | 6.0 |
| legs | 脚 | 6.5 |
| shoulders | 肩 | 5.5 |
| arms | 腕 | 5.0 |
| full | 全身 | 6.0 |

- **計算:** `burn = MET × weight_kg × (minutes / 60)`

#### 当日消費 kcal 合計（FR-006）

`total_burn = walk_burn + Σ(treadmill_burn) + Σ(strength_burn)`

#### 摂取残量

- `remaining_kcal = target_kcal + total_burn − intake_kcal`（表示用。負値は超過を意味）
- P/F/C も同様に目標 − 摂取

## 5. 外部連携

| 連携先 | 方向 | 目的 |
|--------|------|------|
| iPhone ショートカット | Inbound HTTP | 歩数・体重同期 |
| **Open Food Facts** | **Outbound HTTPS（v2）** | **JAN/EAN バーコード → 食品名・栄養（kcal/PFC）** |

### Open Food Facts 連携概要（v2）

| 項目 | 方針 |
|------|------|
| 呼出元 | **バックエンド（Pi）** — CORS 回避・レスポンス正規化を一括 |
| プロトコル | HTTPS REST（公開 API `world.openfoodfacts.org`） |
| タイムアウト | 5 秒（NFR-009）。超過時は手入力フォールバック |
| データ送信 | バーコード番号のみ OFF へ。身体データは送信しない |
| 結果 | 商品名 + kcal + P/F/C をアプリ内部形式に正規化してフロントへ返却 |
| 未登録商品 | 404 相当 → フロントは手入力画面へ |

**栄養値の正規化（OPN-006 解消・方針）**

1. 商品名: `product_name` → なければ `product_name_ja` → なければ `generic_name`
2. kcal: `nutriments.energy-kcal_100g` 優先。なければ `energy-kcal` / kJ 換算
3. P/F/C: `proteins_100g`, `fat_100g`, `carbohydrates_100g`（100 g あたり）
4. **1 食分換算:** Phase 1 相当として **100 g あたり値をそのまま 1 食分として確認画面で編集可能** とする（詳細設計で serving パース拡張可）

### バーコード読取（OPN-007 解消・方針）

| 項目 | 方針 |
|------|------|
| 第一選択 | ブラウザ **Barcode Detector API**（iOS Safari 16.4+） |
| フォールバック | バーコード番号の手入力フィールド |
| カメラ拒否 | 手入力のみ案内（権限再設定は OS 設定へ誘導） |
| 対応形式 | EAN-13 / JAN（国内食品の主流） |

### Health Sync I/F 概要

- **エンドポイント:** `POST /api/sync/health`（詳細は詳細設計・OpenAPI）
- **Body 概念:** `date`（YYYY-MM-DD）, `steps`（整数）, `weight_kg`, `bmi`, `lbm_kg`, `body_fat_pct`, `stride_cm`, `walking_speed_kmh`（いずれも任意）
- **挙動:**
  - 同一 `date` の歩数は **`daily_steps.step_date` で upsert**（最新 POST 勝ち）
  - 体組成・体重は **`weight_logs.log_date` で 1 日 1 行 upsert**（送った metric のみ更新。同日 shortcuts 行の削除→再 INSERT は行わない）
  - 体組成のみ（体重なし）の sync も可

## 6. 認証・認可設計

該当なし。LAN 内単一利用者。API に認証ミドルウェアは設けない。

| 項目 | 方針 |
|------|------|
| 認証方式 | なし |
| 認可方式 | なし（全 API 公開） |
| セキュリティ補足 | ルーター側で LAN 外遮断を推奨。将来必要なら Pi 上 reverse proxy + Basic 認証を backlog |

## 7. 非機能要件への対応方針

| NFR ID | 対応方針 |
|--------|----------|
| NFR-001 | Dashboard は集計 API 1 本に集約。DB インデックスは記録日単位。キャッシュは Phase 1 では任意 |
| NFR-002 | 認証なし。ドキュメントに LAN 限定利用を明記 |
| NFR-003 | データは MySQL のみ。外部送信は Phase 2 OFF のみ |
| NFR-004 | `docker compose up` で API + MySQL 起動 |
| NFR-005 | Compose 定義を Pi でも流用。環境変数で datadir のみ変更 |
| NFR-006 | `infra/` に SSD マウント手順。MySQL volume を `/mnt/ssd/mysql` に |
| NFR-007 | FastAPI OpenAPI → Phase 4.5 で契約確定 |
| NFR-008 | 今日画面に「散歩した」FAB。食事はプリセットを最初の行に固定 |
| **NFR-009** | **OFF 参照は backend 内 5 秒タイムアウト。失敗は即フォールバック** |
| **NFR-010** | **Pi からインターネット egress 必須（Tailscale 利用時も Pi 側 DNS 解決）** |
| **NFR-011** | **TOP 9 カードを 1 画面スクロールで到達。収支 API を Dashboard に集約** |
| **NFR-012** | **manifest・UI 文言を「健康管理」に統一** |

## 8. 要件トレーサビリティ

| 要件 ID | 設計要素 |
|---------|----------|
| FR-001〜004 | Profile モジュール、初期設定画面、TDEE/PFC 計算方針 |
| FR-005〜009 | Dashboard モジュール、今日画面 |
| FR-010〜013 | Meals モジュール、食事・プリセット画面 |
| FR-014 | Meals: ログ複製 API（任意・Phase 1 後半可） |
| FR-017〜019 | Body モジュール、体重画面 |
| FR-020〜023 | HealthSync モジュール、`POST /api/sync/health` |
| FR-024〜026 | Walks モジュール、散歩画面 |
| FR-027〜029 | Exercises: Treadmill、運動画面 |
| FR-030〜031 | Exercises: Strength、種目テンプレ |
| FR-033 | Summary モジュール、週画面 |
| **FR-015, FR-037〜039** | **BarcodeLookup モジュール、食事画面バーコードフロー、OFF 連携** |
| **FR-036** | **各画面の当日一覧 + 削除 API（v1.1 実装済。v3 で散歩削除 UI 廃止）** |
| **FR-040〜053** | **§10 v3: Balance, CardHistory, Settings, リネーム, 4 タブ UI** |

## 9. 未決事項

| ID | 内容 | 詳細設計で解決 |
|----|------|---------------|
| OPN-001 | 歩数→kcal 係数 | **解消**（本書 4.2） |
| OPN-002 | トレッドミル二重計上 | **解消**（ジム中スマホ非携行の前提。控除ロジック不要） |
| OPN-003 | TDEE 活動係数 | **解消**（デフォルト 1.375） |
| OPN-004 | 筋トレ種目一覧 | **解消**（6 種テンプレ） |
| OPN-005 | MySQL pin | **解消**（8.0.x / 8.0.36 推奨） |
| DD-001 | API エンドポイント一覧・リクエスト形式 | はい |
| DD-002 | DB テーブル・インデックス定義 | はい |
| DD-003 | iOS ショートカット設定手順書 | はい（infra または docs） |
| DD-004 | DailySummary キャッシュ要否 | はい |
| **DD-005** | **バーコード lookup API・OFF クライアント・MealLog 拡張** | **はい（v2）** |
| **DD-006** | **カメラ UI・確認画面・手入力フォールバック遷移** | **はい（v2）** |

## 変更履歴

| 日付 | 変更内容 |
|------|----------|
| 2026-06-13 | 初版作成 |
| 2026-06-13 | OPN-002: トレッドミル中スマホ非携行前提に変更（歩数控除ロジック削除） |
| 2026-06-13 | **v2:** バーコード / OFF 連携、BarcodeLookup モジュール、OPN-006/007 解消 |
| 2026-06-14 | **v3:** 収支モデル、TOP 9 カード、CardHistory、Settings、リネーム方針、Walks/Summary 廃止 |
| 2026-06-16 | **hotfix:** 日次 log_date キー、WeightLog 部分 upsert、運動 log_date、履歴 null ルール |
| 2026-06-16 | **hotfix:** 食事タブから収支表示削除（収支は TOP のみ） |

---

## 10. v3 追記 — 収支ダッシュボード・UI 刷新

### 10.1 カロリー収支モデル（FR-041〜043, FR-046）

**収支（kcal）:**

```
balance = intake − bmr − neat − exercise − tef
```

| 項 | 算出 |
|----|------|
| intake | 当日 MealLog の kcal 合計 |
| bmr | Katch–McArdle: `370 + 21.6 × LBM(kg)` |
| neat | UserProfile.neat_kcal（**初期 200**） |
| tef | `intake × tef_rate`（**初期 0.10**） |
| exercise | 歩数 kcal + トレッドミル + 筋トレ（v1 式を継続） |

- **符号:** マイナス = 赤字 = 痩せ方向。目標赤字ラインは表示しない（FR-047）
- **LBM 解決:** 当日 WeightLog → なければ最新 WeightLog → なければ **bmr 不可**
  - LBM 未同期: 基礎代謝カードは同期促し、`balance` は `null`（UI で `--`）
- **Mifflin-St Jeor / TDEE / 目標 kcal・PFC:** v3 から廃止。`user_profile` から target 列・activity_factor を削除（詳細設計 DD-008）

### 10.2 TOP 画面（FR-044, FR-048）

**下部タブ:** TOP / 食事 / 運動 / 設定（散歩・週タブ廃止）

**カード順（横スライド、収支のみ大サイズ）:**

1. 収支（balance）
2. 体重（kg）
3. 摂取（intake kcal）
4. 基礎代謝（bmr）
5. 消費（exercise total）
6. 歩数
7. 体脂肪率（%）
8. BMI
9. LBM（kg）

NEAT / TEF は独立カードにせず、収支内訳または設定のみ。

**カードタップ → CardHistory:** 日 / 週 / 月 / 年の推移グラフまたは表（FR-045）。詳細 API は詳細設計（OPN-010）。

### 10.3 設定・Myセット（FR-049〜051）

| 画面 | 内容 |
|------|------|
| 設定 | 身長・生年月日・性別・NEAT kcal・TEF 率（%） |
| 食事 | Myセット（旧プリセット）・手入力・バーコード。**合計 kcal + P/F/C g**。収支は **TOP のみ** |
| 運動 | Myセット・手入力（トレッドミル / 筋トレ） |

初回セットアップは設定タブへ統合（FR-004）。目標 kcal/PFC 入力ステップは削除。

### 10.4 廃止・整理（FR-024〜026, FR-033, FR-002/003/005）

| 対象 | v3 方針 |
|------|---------|
| Walks モジュール / walk_sessions | API・UI 削除。Health 歩数同期は継続 |
| Summary 週タブ | UI 削除。CardHistory が週次も提供 |
| 目標 kcal / PFC 残量 | Dashboard から削除 |
| user_profile.target_* / activity_factor | **列削除**（NEAT/TEF 列を追加） |

### 10.5 リネーム（FR-040, OPN-008 解消）

| 項目 | 方針 |
|------|------|
| 表示名 | **健康管理**（HTML title, manifest, ヘッダ） |
| slug / リポジトリ | `kenko-kanri`（フォルダ・git remote・compose project 名） |
| systemd | `kenko-kanri.service`（旧 `sanpo-ban` から置換） |
| MySQL DB 名 | **`kenko_kanri` に変更**（旧 `sanpo_ban` は破棄。データ移行なし・初期セットアップから再開） |
| MySQL ユーザー | **`kenko`**（旧 `sanpo` は廃止） |
| compose / env | `MYSQL_DATABASE=kenko_kanri`、`MYSQL_USER=kenko`、`DATABASE_URL` を更新 |
| Tailscale serve | パス・ポートは不変。サービス再起動手順を infra に追記 |
| PWA | アイコン背景**白**、名称「健康管理」（FR-052） |

**移行手順（概要）:** ① Pi でサービス停止 ② 旧 DB `sanpo_ban` 削除（データ破棄可）③ `kenko_kanri` 新規作成 ④ 旧 MySQL ユーザー `sanpo` 削除・`kenko` 新規作成 ⑤ env / compose 更新 ⑥ `alembic upgrade head` ⑦ 設定タブで初回セットアップ ⑧ systemd / Tailscale 名更新 ⑨ PWA 再追加

**人間承認（2026-06-14）:** DB データ消失を許容し DB 名変更に合意。

### 10.6 Health Sync 拡張（継続 + v3 表示）

- **Body 概念（既存）:** `date`, `steps`, `weight_kg`, `bmi`, `lbm_kg`, `body_fat_pct`, `stride_cm`, `walking_speed_kmh`（後 6 つ任意）
- TOP カード: 体重は当日→過去最新→initial。体組成各フィールドは当日 WeightLog のみ
- **WeightLog:** `log_date`（JST）1 日 1 行。Health / manual / 設定保存は **部分 upsert**（詳細設計 §10）

### 10.10 日次 log_date（2026-06-16 hotfix）

| エンティティ | 日付キー | 備考 |
|-------------|---------|------|
| 歩数 | `daily_steps.step_date` | 1 日 1 行 |
| 体重・体組成 | `weight_logs.log_date` | 1 日 1 行、部分 upsert |
| 食事 | `meal_logs.log_date` | 1 日複数行 |
| トレッドミル・筋トレ | `log_date` 列（009） | 1 日複数行。集計は log_date 等号 |

CardHistory は **記録のあった日のみ**値を表示（未記録日 null）。BMR/LBM 履歴に最新値の carry-forward なし。

### 10.7 非機能（v3 追記）

| NFR ID | 対応方針 |
|--------|----------|
| NFR-011 | TOP は縦スクロールで 9 カードすべて到達可能 |
| NFR-012 | UI 文言・manifest から「散歩判」を排除 |

### 10.8 v3 要件トレーサビリティ

| 要件 ID | 設計要素 |
|---------|----------|
| FR-040 | リネーム方針 §10.5、Frontend Shell |
| FR-041〜047 | Balance モジュール、TOP 収支カード、計算 §10.1 |
| FR-044, FR-045 | Dashboard + CardHistory |
| FR-048 | 4 タブ Frontend Shell |
| FR-049, FR-043 | Settings モジュール、UserProfile.neat_kcal / tef_rate |
| FR-050, FR-051 | Meals UI（Myセット名称、PFC 合計のみ） |
| FR-052, FR-053 | PWA manifest、notion ライト継続 |
| AC-019〜025 | §10.1〜10.5 の受入根拠 |

### 10.9 v3 未決事項

| ID | 内容 | 詳細設計で解決 |
|----|------|---------------|
| OPN-008 | リネーム手順 | **解消**（§10.5。DB `kenko_kanri` 新規・データ移行なし） |
| OPN-009 | walk_sessions 削除タイミング | はい（v3 実装一括） |
| OPN-010 | CardHistory API 粒度 | はい |
| DD-007 | Balance API レスポンス・null 扱い | はい |
| DD-008 | profile マイグレーション（NEAT/TEF、target 列） | はい |
| DD-009 | TOP スライド UI・履歴画面 | はい |
