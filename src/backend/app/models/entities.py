from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import BigInteger, Date, DateTime, Enum, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class UserProfile(Base):
    __tablename__ = "user_profile"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, default=1)
    height_cm: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    birth_date: Mapped[date] = mapped_column(Date, nullable=False)
    sex: Mapped[str] = mapped_column(Enum("male", "female", name="sex_enum"), nullable=False)
    neat_kcal: Mapped[int] = mapped_column(Integer, nullable=False, default=180)
    tef_rate: Mapped[Decimal] = mapped_column(Numeric(4, 3), nullable=False, default=Decimal("0.100"))
    stride_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    walking_speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    initial_weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    setup_completed: Mapped[bool] = mapped_column(nullable=False, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class FoodPreset(Base):
    __tablename__ = "food_presets"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kcal: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    fat_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    carbs_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class MealLog(Base):
    __tablename__ = "meal_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    log_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    kcal: Mapped[int] = mapped_column(Integer, nullable=False)
    protein_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    fat_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    carbs_g: Mapped[Decimal] = mapped_column(Numeric(6, 2), nullable=False)
    food_preset_id: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    barcode: Mapped[str | None] = mapped_column(String(14), nullable=True)
    meal_slot: Mapped[str] = mapped_column(
        Enum("breakfast", "lunch", "dinner", "snack", name="meal_slot_enum"),
        nullable=False,
        default="snack",
    )
    logged_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class DailySteps(Base):
    __tablename__ = "daily_steps"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    step_date: Mapped[date] = mapped_column(Date, nullable=False, unique=True)
    steps: Mapped[int] = mapped_column(Integer, nullable=False)
    stride_cm: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    walking_speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(4, 2), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="shortcuts")
    synced_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)


class WeightLog(Base):
    __tablename__ = "weight_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    weight_kg: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    bmi: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    lbm_kg: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    body_fat_pct: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    source: Mapped[str] = mapped_column(Enum("manual", "shortcuts", name="weight_source_enum"), nullable=False)
    logged_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)


class TreadmillLog(Base):
    __tablename__ = "treadmill_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    speed_kmh: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    incline_pct: Mapped[Decimal | None] = mapped_column(Numeric(4, 1), nullable=True)
    machine_kcal: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calculated_kcal: Mapped[int] = mapped_column(Integer, nullable=False)


class StrengthLog(Base):
    __tablename__ = "strength_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, index=True)
    exercise_code: Mapped[str] = mapped_column(String(20), nullable=False)
    minutes: Mapped[int] = mapped_column(Integer, nullable=False)
    calculated_kcal: Mapped[int] = mapped_column(Integer, nullable=False)
