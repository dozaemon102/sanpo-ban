from datetime import datetime
from decimal import Decimal

from app.models.entities import WeightLog


def optional_decimal(value: float | None) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def create_weight_log(
    *,
    weight_kg: float,
    source: str,
    logged_at: datetime,
    bmi: float | None = None,
    lbm_kg: float | None = None,
    body_fat_pct: float | None = None,
) -> WeightLog:
    return WeightLog(
        weight_kg=Decimal(str(weight_kg)),
        bmi=optional_decimal(bmi),
        lbm_kg=optional_decimal(lbm_kg),
        body_fat_pct=optional_decimal(body_fat_pct),
        source=source,
        logged_at=logged_at,
    )
