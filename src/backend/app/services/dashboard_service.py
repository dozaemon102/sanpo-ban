from datetime import date, datetime, time, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found, profile_not_setup
from app.core.timezone import JST, now_jst, today_jst
from app.models.entities import (
    DailySteps,
    MealLog,
    StrengthLog,
    TreadmillLog,
    UserProfile,
    WalkSession,
    WeightLog,
)
from app.schemas.api import BurnTotals, DashboardToday, MacroTotals, TargetMacros, WeekSummary
from app.services.calculations import walk_burn_kcal


def get_profile(db: Session) -> UserProfile:
    profile = db.get(UserProfile, 1)
    if profile is None:
        raise not_found("Profile not found")
    return profile


def require_setup(profile: UserProfile) -> None:
    if not profile.setup_completed:
        raise profile_not_setup()


def latest_weight_entry(db: Session, on_date: date, profile: UserProfile) -> WeightLog | None:
    day_start = datetime.combine(on_date, time.min, tzinfo=JST)
    day_end = day_start + timedelta(days=1)
    row = db.scalar(
        select(WeightLog)
        .where(WeightLog.logged_at >= day_start, WeightLog.logged_at < day_end)
        .order_by(WeightLog.logged_at.desc())
        .limit(1)
    )
    if row:
        return row
    return db.scalar(select(WeightLog).order_by(WeightLog.logged_at.desc()).limit(1))


def latest_weight_kg(db: Session, on_date: date, profile: UserProfile) -> float:
    row = latest_weight_entry(db, on_date, profile)
    if row:
        return float(row.weight_kg)
    return float(profile.initial_weight_kg)


def _optional_float(value: Decimal | None) -> float | None:
    return float(value) if value is not None else None


def sum_meals(db: Session, log_date: date) -> MacroTotals:
    rows = db.execute(
        select(
            func.coalesce(func.sum(MealLog.kcal), 0),
            func.coalesce(func.sum(MealLog.protein_g), 0),
            func.coalesce(func.sum(MealLog.fat_g), 0),
            func.coalesce(func.sum(MealLog.carbs_g), 0),
        ).where(MealLog.log_date == log_date)
    ).one()
    return MacroTotals(
        kcal=int(rows[0]),
        protein_g=float(rows[1]),
        fat_g=float(rows[2]),
        carbs_g=float(rows[3]),
    )


def burn_for_date(db: Session, on_date: date, weight_kg: float) -> BurnTotals:
    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == on_date))
    steps = steps_row.steps if steps_row else 0
    walk = walk_burn_kcal(steps, weight_kg)

    day_start = datetime.combine(on_date, time.min, tzinfo=JST)
    day_end = day_start + timedelta(days=1)

    treadmill = db.scalar(
        select(func.coalesce(func.sum(TreadmillLog.calculated_kcal), 0)).where(
            TreadmillLog.logged_at >= day_start,
            TreadmillLog.logged_at < day_end,
        )
    )
    strength = db.scalar(
        select(func.coalesce(func.sum(StrengthLog.calculated_kcal), 0)).where(
            StrengthLog.logged_at >= day_start,
            StrengthLog.logged_at < day_end,
        )
    )
    treadmill_i = int(treadmill or 0)
    strength_i = int(strength or 0)
    return BurnTotals(
        walk_kcal=walk,
        treadmill_kcal=treadmill_i,
        strength_kcal=strength_i,
        total_kcal=walk + treadmill_i + strength_i,
    )


def build_dashboard(db: Session, on_date: date | None = None) -> DashboardToday:
    on_date = on_date or today_jst()
    profile = get_profile(db)
    require_setup(profile)

    intake = sum_meals(db, on_date)
    weight_entry = latest_weight_entry(db, on_date, profile)
    weight = float(weight_entry.weight_kg) if weight_entry else float(profile.initial_weight_kg)
    burn = burn_for_date(db, on_date, weight)

    targets = TargetMacros(
        kcal=profile.target_kcal,
        protein_g=float(profile.target_protein_g),
        fat_g=float(profile.target_fat_g),
        carbs_g=float(profile.target_carbs_g),
    )
    remaining = MacroTotals(
        kcal=targets.kcal + burn.total_kcal - intake.kcal,
        protein_g=round(targets.protein_g - intake.protein_g, 1),
        fat_g=round(targets.fat_g - intake.fat_g, 1),
        carbs_g=round(targets.carbs_g - intake.carbs_g, 1),
    )

    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == on_date))
    day_start = datetime.combine(on_date, time.min, tzinfo=JST)
    day_end = day_start + timedelta(days=1)
    walk_count = db.scalar(
        select(func.count())
        .select_from(WalkSession)
        .where(WalkSession.walked_at >= day_start, WalkSession.walked_at < day_end)
    )

    return DashboardToday(
        date=on_date,
        targets=targets,
        intake=intake,
        burn=burn,
        remaining=remaining,
        steps=steps_row.steps if steps_row else 0,
        weight_kg=weight,
        bmi=_optional_float(weight_entry.bmi) if weight_entry else None,
        lbm_kg=_optional_float(weight_entry.lbm_kg) if weight_entry else None,
        body_fat_pct=_optional_float(weight_entry.body_fat_pct) if weight_entry else None,
        walk_sessions_today=int(walk_count or 0),
    )


def week_summary(db: Session, end_date: date | None = None) -> WeekSummary:
    end_date = end_date or today_jst()
    start_date = end_date - timedelta(days=6)
    profile = get_profile(db)
    require_setup(profile)

    intake_values: list[int] = []
    step_values: list[int] = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        intake_values.append(sum_meals(db, d).kcal)
        steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == d))
        step_values.append(steps_row.steps if steps_row else 0)

    day_start = datetime.combine(start_date, time.min, tzinfo=JST)
    day_end = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=JST)

    walk_count = db.scalar(
        select(func.count()).select_from(WalkSession).where(
            WalkSession.walked_at >= day_start,
            WalkSession.walked_at < day_end,
        )
    )
    treadmill_count = db.scalar(
        select(func.count()).select_from(TreadmillLog).where(
            TreadmillLog.logged_at >= day_start,
            TreadmillLog.logged_at < day_end,
        )
    )
    strength_count = db.scalar(
        select(func.count()).select_from(StrengthLog).where(
            StrengthLog.logged_at >= day_start,
            StrengthLog.logged_at < day_end,
        )
    )

    weight_trend = []
    for i in range(7):
        d = start_date + timedelta(days=i)
        w = latest_weight_kg(db, d, profile)
        day_w = db.scalar(
            select(WeightLog)
            .where(
                WeightLog.logged_at >= datetime.combine(d, time.min, tzinfo=JST),
                WeightLog.logged_at < datetime.combine(d + timedelta(days=1), time.min, tzinfo=JST),
            )
            .limit(1)
        )
        weight_trend.append({"date": d.isoformat(), "weight_kg": float(day_w.weight_kg) if day_w else None})

    return WeekSummary(
        start_date=start_date,
        end_date=end_date,
        avg_intake_kcal=round(sum(intake_values) / 7, 1),
        avg_steps=round(sum(step_values) / 7, 1),
        weight_trend=weight_trend,
        counts={
            "walk_sessions": int(walk_count or 0),
            "treadmill_sessions": int(treadmill_count or 0),
            "strength_sessions": int(strength_count or 0),
        },
    )
