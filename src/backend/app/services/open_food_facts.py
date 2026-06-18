import re
from typing import Any

import httpx

from app.core.config import settings
from app.core.errors import barcode_not_found, off_unavailable, validation_error

BARCODE_PATTERN = re.compile(r"^[0-9]{8,14}$")
SERVING_NOTE = "100gあたり（確認画面で編集してください）"
OFF_HOSTS = (
    "https://world.openfoodfacts.org",
    "https://jp.openfoodfacts.org",
)


def validate_barcode(barcode: str) -> str:
    if not BARCODE_PATTERN.match(barcode):
        raise validation_error("barcode must be 8-14 digits")
    return barcode


def normalize_barcode_for_lookup(barcode: str) -> str:
    code = validate_barcode(barcode)
    if len(code) == 12:
        return f"0{code}"
    return code


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


def _off_bases() -> list[str]:
    configured = settings.off_api_base_url.rstrip("/")
    bases = [configured]
    for host in OFF_HOSTS:
        if host not in bases:
            bases.append(host)
    return bases


async def _fetch_off_product(client: httpx.AsyncClient, base: str, code: str) -> httpx.Response:
    url = f"{base.rstrip('/')}/api/v2/product/{code}.json"
    headers = {"User-Agent": "Kenko-kanri/3.0.1 (personal use)"}
    return await client.get(url, headers=headers)


async def lookup_barcode(barcode: str) -> dict[str, Any]:
    code = normalize_barcode_for_lookup(barcode)
    timeout = httpx.Timeout(settings.off_timeout_seconds)
    saw_not_found = False
    saw_unavailable = False

    try:
        async with httpx.AsyncClient(timeout=timeout) as client:
            for base in _off_bases():
                try:
                    response = await _fetch_off_product(client, base, code)
                except httpx.HTTPError:
                    saw_unavailable = True
                    continue

                if response.status_code == 404:
                    saw_not_found = True
                    continue
                if response.status_code >= 500:
                    saw_unavailable = True
                    continue
                if response.status_code != 200:
                    saw_unavailable = True
                    continue

                try:
                    payload = response.json()
                except ValueError:
                    saw_unavailable = True
                    continue

                if payload.get("status") != 1:
                    saw_not_found = True
                    continue

                return normalize_product(code, payload)
    except httpx.HTTPError:
        raise off_unavailable() from None

    if saw_not_found:
        raise barcode_not_found()
    raise off_unavailable()
