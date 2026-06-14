import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import barcode_not_found, off_unavailable, validation_error

BARCODE_PATTERN = re.compile(r"^[0-9]{8,14}$")
SERVING_NOTE = "100gあたり（確認画面で編集してください）"


def validate_barcode(barcode: str) -> str:
    if not BARCODE_PATTERN.match(barcode):
        raise validation_error("barcode must be 8-14 digits")
    return barcode


def _pick_name(product: dict[str, Any]) -> str:
    for key in ("product_name_ja", "product_name", "generic_name_ja", "generic_name"):
        value = product.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return "不明な商品"


def _nutriment_float(nutriments: dict[str, Any], key: str) -> float:
    value = nutriments.get(key)
    if value is None:
        return 0.0
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _kcal_from_nutriments(nutriments: dict[str, Any]) -> int:
    kcal = _nutriment_float(nutriments, "energy-kcal_100g")
    if kcal <= 0:
        kcal = _nutriment_float(nutriments, "energy-kcal")
    if kcal <= 0:
        kj = _nutriment_float(nutriments, "energy_100g")
        if kj > 0:
            kcal = kj / 4.184
    return max(0, int(round(kcal)))


def normalize_product(barcode: str, payload: dict[str, Any]) -> dict[str, Any]:
    if payload.get("status") != 1:
        raise barcode_not_found()
    product = payload.get("product")
    if not isinstance(product, dict):
        raise barcode_not_found()

    nutriments = product.get("nutriments") or {}
    if not isinstance(nutriments, dict):
        nutriments = {}

    return {
        "barcode": barcode,
        "name": _pick_name(product),
        "kcal": _kcal_from_nutriments(nutriments),
        "protein_g": round(_nutriment_float(nutriments, "proteins_100g"), 2),
        "fat_g": round(_nutriment_float(nutriments, "fat_100g"), 2),
        "carbs_g": round(_nutriment_float(nutriments, "carbohydrates_100g"), 2),
        "source": "open_food_facts",
        "serving_note": SERVING_NOTE,
    }


async def lookup_barcode(barcode: str) -> dict[str, Any]:
    code = validate_barcode(barcode)
    url = f"{settings.off_api_base_url.rstrip('/')}/api/v2/product/{code}.json"
    headers = {"User-Agent": "Sanpo-ban/2.0 (personal use)"}
    timeout = httpx.Timeout(settings.off_timeout_seconds)
    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            response = await client.get(url, headers=headers)
    except httpx.HTTPError:
        raise off_unavailable() from None

    if response.status_code == 404:
        raise barcode_not_found()
    if response.status_code >= 500:
        raise off_unavailable()
    if response.status_code != 200:
        raise off_unavailable(f"Open Food Facts returned status {response.status_code}")

    try:
        payload = response.json()
    except ValueError:
        raise off_unavailable() from None

    return normalize_product(code, payload)
