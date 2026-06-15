from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, Field, field_validator


class ProfileResponse(BaseModel):
    height_cm: float
    birth_date: date
    sex: str
    neat_kcal: int
    tef_rate: float
    stride_cm: float | None = None
    walking_speed_kmh: float | None = None
    initial_weight_kg: float
    setup_completed: bool

    model_config = {"from_attributes": True}


class ProfileUpdate(BaseModel):
    height_cm: float = Field(ge=100, le=250)
    birth_date: date
    sex: str
    current_weight_kg: float = Field(ge=30, le=300)
    neat_kcal: int | None = Field(default=None, ge=0, le=2000)
    tef_rate: float | None = Field(default=None, ge=0, le=0.5)
    stride_cm: float | None = Field(default=None, ge=30, le=120)
    walking_speed_kmh: float | None = Field(default=None, ge=1, le=10)
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


class BalanceBreakdown(BaseModel):
    intake_kcal: int
    bmr_kcal: int | None = None
    neat_kcal: int
    exercise_kcal: int
    tef_kcal: int


class BalanceInfo(BaseModel):
    value: int | None = None
    computable: bool
    breakdown: BalanceBreakdown


class DashboardCards(BaseModel):
    weight_kg: float | None = None
    intake_kcal: int
    bmr_kcal: int | None = None
    exercise_kcal: int
    walk_kcal: int = 0
    steps: int
    stride_cm: float | None = None
    walking_speed_kmh: float | None = None
    walk_calc_method: str = "simple"
    body_fat_pct: float | None = None
    bmi: float | None = None
    lbm_kg: float | None = None


class DashboardTop(BaseModel):
    date: date
    balance: BalanceInfo
    cards: DashboardCards
    bmr_status: str
    body_composition_source: str


class HistoryPoint(BaseModel):
    label: str
    start_date: date
    end_date: date
    value: float | None = None


class DashboardHistory(BaseModel):
    metric: str
    period: str
    anchor_date: date
    points: list[HistoryPoint]


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
    meal_slot: str
    name: str
    kcal: int = Field(ge=0)
    protein_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    food_preset_id: int | None = None
    barcode: str | None = Field(default=None, pattern=r"^[0-9]{8,14}$")

    @field_validator("meal_slot")
    @classmethod
    def validate_meal_slot(cls, value: str) -> str:
        allowed = {"breakfast", "lunch", "dinner", "snack"}
        if value not in allowed:
            raise ValueError("meal_slot must be breakfast, lunch, dinner, or snack")
        return value


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
    stride_cm: float | None = Field(default=None, ge=30, le=120)
    walking_speed_kmh: float | None = Field(default=None, ge=1, le=10)
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

    @field_validator("weight_kg", "bmi", "lbm_kg", "body_fat_pct", "stride_cm", "walking_speed_kmh", mode="before")
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


class TreadmillCreate(BaseModel):
    log_date: date | None = None
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
    log_date: date | None = None
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
