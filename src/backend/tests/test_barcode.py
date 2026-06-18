from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services.open_food_facts import (
    lookup_barcode,
    normalize_barcode_for_lookup,
    normalize_product,
    validate_barcode,
)
from app.core.errors import AppError


def test_validate_barcode_rejects_invalid():
    with pytest.raises(AppError) as exc:
        validate_barcode("abc")
    assert exc.value.status_code == 400


def test_normalize_barcode_for_lookup_upc_a():
    assert normalize_barcode_for_lookup("490123456789") == "0490123456789"


def test_normalize_product_success():
    payload = {
        "status": 1,
        "product": {
            "product_name_ja": "テスト食品",
            "nutriments": {
                "energy-kcal_100g": 188,
                "proteins_100g": 6,
                "fat_100g": 5,
                "carbohydrates_100g": 28,
            },
        },
    }
    result = normalize_product("4901234567890", payload)
    assert result["name"] == "テスト食品"
    assert result["kcal"] == 188
    assert result["barcode"] == "4901234567890"


@pytest.mark.asyncio
async def test_lookup_barcode_http_404_is_not_found():
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.json.return_value = {"status": 0, "code": "4901071268374"}

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch("app.services.open_food_facts.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(AppError) as exc:
            await lookup_barcode("4901071268374")
        assert exc.value.status_code == 404
        assert exc.value.detail["error"]["code"] == "BARCODE_NOT_FOUND"


@pytest.mark.asyncio
async def test_lookup_barcode_not_found():
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {"status": 0}

    mock_client = AsyncMock()
    mock_client.get.return_value = mock_response
    mock_client.__aenter__.return_value = mock_client
    mock_client.__aexit__.return_value = None

    with patch("app.services.open_food_facts.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(AppError) as exc:
            await lookup_barcode("4901234567890")
        assert exc.value.status_code == 404
        assert exc.value.detail["error"]["code"] == "BARCODE_NOT_FOUND"


def test_barcode_lookup_api(client):
    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "current_weight_kg": 72,
            "setup_completed": True,
        },
    )
    mock_result = {
        "barcode": "4901234567890",
        "name": "テスト",
        "kcal": 100,
        "protein_g": 5.0,
        "fat_g": 3.0,
        "carbs_g": 10.0,
        "source": "open_food_facts",
        "serving_note": "100gあたり（確認画面で編集してください）",
    }
    with patch("app.api.routes.lookup_barcode", new=AsyncMock(return_value=mock_result)):
        r = client.get("/api/v1/foods/barcode/4901234567890")
        assert r.status_code == 200
        assert "application/json" in r.headers.get("content-type", "")
        assert r.json()["name"] == "テスト"


def test_barcode_api_not_html(client):
    """Static 配信が API を HTML で上書きしないこと"""
    r = client.get("/api/v1/foods/barcode/4901234567890")
    assert "text/html" not in r.headers.get("content-type", "")
    assert r.status_code in (200, 404, 502)


def test_app_meta(client):
    r = client.get("/api/v1/meta")
    assert r.status_code == 200
    body = r.json()
    assert body["app"] == "kenko-kanri"
    assert "version" in body

    meal = client.post(
        "/api/v1/meals",
        json={
            "log_date": "2026-06-13",
            "meal_slot": "snack",
            "name": "テスト",
            "kcal": 100,
            "protein_g": 5,
            "fat_g": 3,
            "carbs_g": 10,
            "barcode": "4901234567890",
        },
    ).json()
    assert meal["barcode"] == "4901234567890"

    presets = client.get("/api/v1/food-presets").json()
    assert len(presets) == 0
