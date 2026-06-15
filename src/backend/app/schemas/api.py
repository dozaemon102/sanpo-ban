from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class TargetMacros(BaseModel):
    kcal: int
    protein_g: float
    fat_g: float
    carbs_g: float


class ProfileResponse(BaseModel):
    height_cm: float
    birth_date: date
    sex: str
    activity_factor: float
    target_kcal: int
    target_protein_g: float
    target_fat_g: float
    target_carbs_g: float
    initial_weight_kg: float
    setup_completed: bool

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    height_cm: float = Field(ge=100, le=250)
    birth_date: date
    sex: str
    activity_factor: float
    current_weight_kg: float = Field(ge=30, le=300)
    target_kcal: int | None = Field(default=None, ge=1200)
    target_protein_g: float | None = None
    target_fat_g: float | None = None
    target_carbs_g: float | None = None
    setup_completed: bool = False


class MacroTotals(BaseModel):
    kcal: int = 0
    protein_g: float = 0
    fat_g: float = 0
    carbs_g: float = 0


class BurnTotals(BaseModel):
    walk_kcal: int = 0
    treadmill_kcal: int = 0
    strength_kcal: int = 0
    total_kcal: int = 0


class DashboardToday(BaseModel):
    date: date
    targets: TargetMacros
    intake: MacroTotals
    burn: BurnTotals
    remaining: MacroTotals
    steps: int = 0
    weight_kg: float | None = None
    bmi: float | None = None
    lbm_kg: float | None = None
    body_fat_pct: float | None = None
    walk_sessions_today: int = 0


class FoodPresetCreate(BaseModel):
    name: str
    kcal: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    sort_order: int = 0


class FoodPresetResponse(FoodPresetCreate):
    id: int

    model_config = {"from_attributes": True}


class FoodLookupResponse(BaseModel):
    barcode: str = Field(pattern=r"^[0-9]{8,14}$")
    name: str
    kcal: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    source: str = "open_food_facts"
    serving_note: str | None = None


class MealLogCreate(BaseModel):
    log_date: date
    name: str
    kcal: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    food_preset_id: int | None = None
    barcode: str | None = Field(default=None, pattern=r"^[0-9]{8,14}$")


class MealLogResponse(MealLogCreate):
    id: int
    logged_at: datetime

    model_config = {"from_attributes": True}


class MealDuplicate(BaseModel):
    log_date: date


class WeightCreate(BaseModel):
    weight_kg: float = Field(ge=30, le=300)
    bmi: float | None = Field(default=None, ge=10, le=80)
    lbm_kg: float | None = Field(default=None, ge=20, le=200)
    body_fat_pct: float | None = Field(default=None, ge=1, le=75)
    logged_at: datetime | None = None


class WeightResponse(BaseModel):
    id: int
    weight_kg: float
    bmi: float | None = None
    lbm_kg: float | None = None
    body_fat_pct: float | None = None
    source: str
    logged_at: datetime

    model_config = {"from_attributes": True}


class HealthSyncRequest(BaseModel):
    date: date
    steps: int | None = Field(default=None, ge=0)
    weight_kg: float | None = Field(default=None, ge=30, le=300)
    bmi: float | None = Field(default=None, ge=10, le=80)
    lbm_kg: float | None = Field(default=None, ge=20, le=200)
    body_fat_pct: float | None = Field(default=None, ge=1, le=75)

    @field_validator("steps", mode="before")
    @classmethod
    def normalize_optional_steps(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            value = stripped
        return value

    @field_validator("weight_kg", "bmi", "lbm_kg", "body_fat_pct", mode="before")
    @classmethod
    def normalize_optional_number(cls, value: object) -> object | None:
        if value is None:
            return None
        if isinstance(value, str):
            stripped = value.strip()
            if not stripped:
                return None
            value = stripped
        if value == 0:
            return None
        return value


class WalkCreate(BaseModel):
    walked_at: datetime | None = None
    discovery_note: str | None = Field(default=None, max_length=500)


class WalkResponse(BaseModel):
    id: int
    walked_at: datetime
    discovery_note: str | None

    model_config = {"from_attributes": True}


class TreadmillCreate(BaseModel):
    minutes: int = Field(ge=1, le=300)
    speed_kmh: float | None = None
    incline_pct: float | None = None
    machine_kcal: int | None = None


class TreadmillResponse(TreadmillCreate):
    id: int
    logged_at: datetime
    calculated_kcal: int

    model_config = {"from_attributes": True}


class StrengthCreate(BaseModel):
    exercise_code: str
    minutes: int = Field(ge=1, le=300)


class StrengthResponse(StrengthCreate):
    id: int
    logged_at: datetime
    calculated_kcal: int

    model_config = {"from_attributes": True}


class StrengthTemplate(BaseModel):
    code: str
    name: str
    met: float


class WeekSummary(BaseModel):
    start_date: date
    end_date: date
    avg_intake_kcal: float
    avg_steps: float
    weight_trend: list[dict]
    counts: dict[str, int]
