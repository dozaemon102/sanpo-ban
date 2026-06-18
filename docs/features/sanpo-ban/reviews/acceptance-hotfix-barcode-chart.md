# hotfix 受入: バーコード検索・グラフ 0 基準（2026-06-18）

- **対象:** バーコード手入力/検索、推移グラフ Y 軸、API 配信、OFF 404 処理
- **判定:** **合格**
- **Pi 確認:** API `3.0.1`・`application/json` 応答確認済（`ie-desktop`）

## 修正サマリー

| 症状 | 原因 | 対応 |
|------|------|------|
| バーコード検索不可 | StaticFiles が `/` にマウントされ API が HTML 化 | API と SPA 配信を分離（PR #2） |
| グラフが 0 基準でない | Y 軸をデータ最小値で切り詰め | 全メトリクス `yMin=0`、ゼロ基準線 |
| Bad Gateway（4901071268374） | OFF HTTP 404 を 502 と誤判定 | 404 → `BARCODE_NOT_FOUND`、手入力フォールバック |
| Pi 更新後も Tailscale で古い UI | restart 抜け・ブラウザキャッシュ | `install-service.sh` / `update.sh`、`no-cache` ヘッダ |

## 検証

| 項目 | 結果 |
|------|------|
| `test_barcode.py` | 8 passed |
| `GET /api/v1/meta`（Pi） | `3.0.1` |
| バーコード API Content-Type | `application/json` |
| OFF 未登録 JAN | 404 + 手入力フォーム（修正後） |

## 残フォロー（受入阻害なし）

- Tailscale 経由は PWA キャッシュ削除が必要な場合あり
- OFF 未登録商品は手入力で記録（仕様どおり）
