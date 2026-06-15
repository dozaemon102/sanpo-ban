from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found, validation_error
from app.core.timezone import logged_at_for_log_date, now_jst, today_jst
from app.database import get_db
from app.models.entities import (
    DailySteps,
    FoodPreset,
    MealLog,
    StrengthLog,
    TreadmillLog,
    UserProfile,
    WeightLog,
)
from app.schemas.api import (
    DashboardHistory,
    DashboardTop,
    FoodLookupResponse,
    FoodPresetCreate,
    FoodPresetResponse,
    HealthSyncRequest,
    MealDuplicate,
    MealLogCreate,
    MealLogResponse,
    ProfileResponse,
    ProfileUpdate,
    StrengthCreate,
    StrengthResponse,
    StrengthTemplate,
    TreadmillCreate,
    TreadmillResponse,
    WeightCreate,
    WeightResponse,
)
from app.services.calculations import STRENGTH_TEMPLATES, strength_burn_kcal, treadmill_burn_kcal
from app.services.dashboard_service import build_dashboard_top, build_history, get_profile
from app.services.open_food_facts import lookup_barcode
from app.services.weight_log_factory import create_weight_log

router = APIRouter(prefix="/api/v1")

DEFAULT_NEAT = 180
DEFAULT_TEF = Decimal("0.100")


def _profile_response(p: UserProfile) -> ProfileResponse:
    return ProfileResponse(
        height_cm=float(p.height_cm),
        birth_date=p.birth_date,
        sex=p.sex,
        neat_kcal=p.neat_kcal,
        tef_rate=float(p.tef_rate),
        stride_cm=float(p.stride_cm) if p.stride_cm is not None else None,
        walking_speed_kmh=float(p.walking_speed_kmh) if p.walking_speed_kmh is not None else None,
        initial_weight_kg=float(p.initial_weight_kg),
        setup_completed=p.setup_completed,
    )


@router.get("/profile", response_model=ProfileResponse)
def get_profile_route(db: Session = Depends(get_db)) -> ProfileResponse:
    return _profile_response(get_profile(db))


@router.put("/profile", response_model=ProfileResponse)
def put_profile(body: ProfileUpdate, db: Session = Depends(get_db)) -> ProfileResponse:
    if body.sex not in ("male", "female"):
        raise validation_error("sex must be male or female")
    now = now_jst()
    profile = db.get(UserProfile, 1)
    if profile is None:
        profile = UserProfile(
            id=1,
            neat_kcal=DEFAULT_NEAT,
            tef_rate=DEFAULT_TEF,
            created_at=now,
            updated_at=now,
        )
        db.add(profile)

    profile.height_cm = Decimal(str(body.height_cm))
    profile.birth_date = body.birth_date
    profile.sex = body.sex
    profile.initial_weight_kg = Decimal(str(body.current_weight_kg))
    if body.neat_kcal is not None:
        profile.neat_kcal = body.neat_kcal
    elif profile.neat_kcal is None:
        profile.neat_kcal = DEFAULT_NEAT
    if body.tef_rate is not None:
        profile.tef_rate = Decimal(str(body.tef_rate))
    elif profile.tef_rate is None:
        profile.tef_rate = DEFAULT_TEF
    if body.stride_cm is not None:
        profile.stride_cm = Decimal(str(body.stride_cm))
    if body.walking_speed_kmh is not None:
        profile.walking_speed_kmh = Decimal(str(body.walking_speed_kmh))
    profile.setup_completed = body.setup_completed
    profile.updated_at = now

    db.add(
        WeightLog(
            weight_kg=Decimal(str(body.current_weight_kg)),
            source="manual",
            logged_at=now,
        )
    )
    db.commit()
    db.refresh(profile)
    return _profile_response(profile)


@router.get("/dashboard/top", response_model=DashboardTop)
def dashboard_top(date: str | None = None, db: Session = Depends(get_db)) -> DashboardTop:
    from datetime import date as date_cls

    on_date = date_cls.fromisoformat(date) if date else today_jst()
    return build_dashboard_top(db, on_date)


@router.get("/dashboard/history/{metric}", response_model=DashboardHistory)
def dashboard_history(
    metric: str,
    period: str,
    anchor_date: str | None = None,
    db: Session = Depends(get_db),
) -> DashboardHistory:
    from datetime import date as date_cls

    anchor = date_cls.fromisoformat(anchor_date) if anchor_date else today_jst()
    return build_history(db, metric, period, anchor)


@router.get("/food-presets", response_model=list[FoodPresetResponse])
def list_presets(db: Session = Depends(get_db)) -> list[FoodPreset]:
    return list(db.scalars(select(FoodPreset).order_by(FoodPreset.sort_order, FoodPreset.id)))


@router.post("/food-presets", response_model=FoodPresetResponse, status_code=201)
def create_preset(body: FoodPresetCreate, db: Session = Depends(get_db)) -> FoodPreset:
    now = now_jst()
    preset = FoodPreset(**body.model_dump(), created_at=now, updated_at=now)
    db.add(preset)
    db.commit()
    db.refresh(preset)
    return preset


@router.put("/food-presets/{preset_id}", response_model=FoodPresetResponse)
def update_preset(preset_id: int, body: FoodPresetCreate, db: Session = Depends(get_db)) -> FoodPreset:
    preset = db.get(FoodPreset, preset_id)
    if not preset:
        raise not_found("Food preset not found")
    for k, v in body.model_dump().items():
        setattr(preset, k, v)
    preset.updated_at = now_jst()
    db.commit()
    db.refresh(preset)
    return preset


@router.delete("/food-presets/{preset_id}", status_code=204)
def delete_preset(preset_id: int, db: Session = Depends(get_db)) -> Response:
    preset = db.get(FoodPreset, preset_id)
    if not preset:
        raise not_found("Food preset not found")
    db.delete(preset)
    db.commit()
    return Response(status_code=204)


@router.get("/foods/barcode/{barcode}", response_model=FoodLookupResponse)
async def lookup_food_barcode(barcode: str) -> FoodLookupResponse:
    result = await lookup_barcode(barcode)
    return FoodLookupResponse(**result)


@router.get("/meals", response_model=list[MealLogResponse])
def list_meals(date: str, db: Session = Depends(get_db)) -> list[MealLog]:
    from datetime import date as date_cls

    log_date = date_cls.fromisoformat(date)
    return list(
        db.scalars(select(MealLog).where(MealLog.log_date == log_date).order_by(MealLog.logged_at))
    )


@router.post("/meals", response_model=MealLogResponse, status_code=201)
def create_meal(body: MealLogCreate, db: Session = Depends(get_db)) -> MealLog:
    meal = MealLog(**body.model_dump(), logged_at=logged_at_for_log_date(body.log_date))
    db.add(meal)
    db.commit()
    db.refresh(meal)
    return meal


@router.delete("/meals/{meal_id}", status_code=204)
def delete_meal(meal_id: int, db: Session = Depends(get_db)) -> Response:
    meal = db.get(MealLog, meal_id)
    if not meal:
        raise not_found("Meal not found")
    db.delete(meal)
    db.commit()
    return Response(status_code=204)


@router.post("/meals/{meal_id}/duplicate", response_model=MealLogResponse, status_code=201)
def duplicate_meal(meal_id: int, body: MealDuplicate, db: Session = Depends(get_db)) -> MealLog:
    meal = db.get(MealLog, meal_id)
    if not meal:
        raise not_found("Meal not found")
    copy = MealLog(
        log_date=body.log_date,
        meal_slot=meal.meal_slot,
        name=meal.name,
        kcal=meal.kcal,
        protein_g=meal.protein_g,
        fat_g=meal.fat_g,
        carbs_g=meal.carbs_g,
        food_preset_id=meal.food_preset_id,
        logged_at=logged_at_for_log_date(body.log_date),
    )
    db.add(copy)
    db.commit()
    db.refresh(copy)
    return copy


@router.get("/weights", response_model=list[WeightResponse])
def list_weights(limit: int = 30, db: Session = Depends(get_db)) -> list[WeightLog]:
    return list(db.scalars(select(WeightLog).order_by(WeightLog.logged_at.desc()).limit(limit)))


@router.post("/weights", response_model=WeightResponse, status_code=201)
def create_weight(body: WeightCreate, db: Session = Depends(get_db)) -> WeightLog:
    row = create_weight_log(
        weight_kg=body.weight_kg,
        bmi=body.bmi,
        lbm_kg=body.lbm_kg,
        body_fat_pct=body.body_fat_pct,
        source="manual",
        logged_at=body.logged_at or now_jst(),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/weights/{weight_id}", status_code=204)
def delete_weight(weight_id: int, db: Session = Depends(get_db)) -> Response:
    row = db.get(WeightLog, weight_id)
    if not row:
        raise not_found("Weight log not found")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.post("/sync/health")
def sync_health(body: HealthSyncRequest, db: Session = Depends(get_db)) -> dict:
    from datetime import time as time_cls, timedelta

    now = now_jst()
    steps_logged = False
    if body.steps is not None:
        steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == body.date))
        if steps_row:
            steps_row.steps = body.steps
            steps_row.synced_at = now
            if body.stride_cm is not None:
                steps_row.stride_cm = Decimal(str(body.stride_cm))
            if body.walking_speed_kmh is not None:
                steps_row.walking_speed_kmh = Decimal(str(body.walking_speed_kmh))
        else:
            db.add(
                DailySteps(
                    step_date=body.date,
                    steps=body.steps,
                    stride_cm=Decimal(str(body.stride_cm)) if body.stride_cm is not None else None,
                    walking_speed_kmh=(
                        Decimal(str(body.walking_speed_kmh))
                        if body.walking_speed_kmh is not None
                        else None
                    ),
                    source="shortcuts",
                    synced_at=now,
                )
            )
        steps_logged = True
    elif body.stride_cm is not None or body.walking_speed_kmh is not None:
        steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == body.date))
        if steps_row:
            if body.stride_cm is not None:
                steps_row.stride_cm = Decimal(str(body.stride_cm))
            if body.walking_speed_kmh is not None:
                steps_row.walking_speed_kmh = Decimal(str(body.walking_speed_kmh))
            steps_row.synced_at = now
            steps_logged = True

    weight_logged = False
    body_composition_logged = False
    if body.weight_kg is not None:
        day_start = datetime.combine(body.date, time_cls.min, tzinfo=now.tzinfo)
        day_end = day_start + timedelta(days=1)
        for row in db.scalars(
            select(WeightLog).where(
                WeightLog.logged_at >= day_start,
                WeightLog.logged_at < day_end,
                WeightLog.source == "shortcuts",
            )
        ).all():
            db.delete(row)

        log_at = (
            now
            if body.date == today_jst()
            else datetime.combine(body.date, time_cls(12, 0), tzinfo=now.tzinfo)
        )
        db.add(
            create_weight_log(
                weight_kg=body.weight_kg,
                bmi=body.bmi,
                lbm_kg=body.lbm_kg,
                body_fat_pct=body.body_fat_pct,
                source="shortcuts",
                logged_at=log_at,
            )
        )
        weight_logged = True
        body_composition_logged = any(
            v is not None for v in (body.bmi, body.lbm_kg, body.body_fat_pct)
        )

    db.commit()

    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == body.date))
    return {
        "ok": True,
        "steps": steps_row.steps if steps_row else None,
        "stride_cm": float(steps_row.stride_cm) if steps_row and steps_row.stride_cm is not None else None,
        "walking_speed_kmh": (
            float(steps_row.walking_speed_kmh)
            if steps_row and steps_row.walking_speed_kmh is not None
            else None
        ),
        "steps_logged": steps_logged,
        "weight_logged": weight_logged,
        "body_composition_logged": body_composition_logged,
    }


@router.get("/exercises/treadmill", response_model=list[TreadmillResponse])
def list_treadmill(date: str | None = None, db: Session = Depends(get_db)) -> list[TreadmillLog]:
    from datetime import date as date_cls, time, timedelta

    on_date = date_cls.fromisoformat(date) if date else today_jst()
    start = datetime.combine(on_date, time.min, tzinfo=now_jst().tzinfo)
    end = start + timedelta(days=1)
    return list(
        db.scalars(
            select(TreadmillLog)
            .where(TreadmillLog.logged_at >= start, TreadmillLog.logged_at < end)
            .order_by(TreadmillLog.logged_at.desc())
        )
    )


@router.post("/exercises/treadmill", response_model=TreadmillResponse, status_code=201)
def create_treadmill(body: TreadmillCreate, db: Session = Depends(get_db)) -> TreadmillLog:
    profile = get_profile(db)
    weight = float(profile.initial_weight_kg)
    calc = treadmill_burn_kcal(body.minutes, weight, body.speed_kmh, body.machine_kcal)
    log_date = body.log_date or today_jst()
    row = TreadmillLog(
        logged_at=logged_at_for_log_date(log_date),
        minutes=body.minutes,
        speed_kmh=Decimal(str(body.speed_kmh)) if body.speed_kmh is not None else None,
        incline_pct=Decimal(str(body.incline_pct)) if body.incline_pct is not None else None,
        machine_kcal=body.machine_kcal,
        calculated_kcal=calc,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/exercises/treadmill/{log_id}", status_code=204)
def delete_treadmill(log_id: int, db: Session = Depends(get_db)) -> Response:
    row = db.get(TreadmillLog, log_id)
    if not row:
        raise not_found("Treadmill log not found")
    db.delete(row)
    db.commit()
    return Response(status_code=204)


@router.get("/exercises/strength/templates", response_model=list[StrengthTemplate])
def strength_templates() -> list[StrengthTemplate]:
    return [StrengthTemplate(**t) for t in STRENGTH_TEMPLATES]


@router.get("/exercises/strength", response_model=list[StrengthResponse])
def list_strength(date: str | None = None, db: Session = Depends(get_db)) -> list[StrengthLog]:
    from datetime import date as date_cls, time, timedelta

    on_date = date_cls.fromisoformat(date) if date else today_jst()
    start = datetime.combine(on_date, time.min, tzinfo=now_jst().tzinfo)
    end = start + timedelta(days=1)
    return list(
        db.scalars(
            select(StrengthLog)
            .where(StrengthLog.logged_at >= start, StrengthLog.logged_at < end)
            .order_by(StrengthLog.logged_at.desc())
        )
    )


@router.post("/exercises/strength", response_model=StrengthResponse, status_code=201)
def create_strength(body: StrengthCreate, db: Session = Depends(get_db)) -> StrengthLog:
    if body.exercise_code not in {t["code"] for t in STRENGTH_TEMPLATES}:
        raise validation_error("Invalid exercise_code")
    profile = get_profile(db)
    calc = strength_burn_kcal(body.exercise_code, body.minutes, float(profile.initial_weight_kg))
    log_date = body.log_date or today_jst()
    row = StrengthLog(
        logged_at=logged_at_for_log_date(log_date),
        exercise_code=body.exercise_code,
        minutes=body.minutes,
        calculated_kcal=calc,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


@router.delete("/exercises/strength/{log_id}", status_code=204)
def delete_strength(log_id: int, db: Session = Depends(get_db)) -> Response:
    row = db.get(StrengthLog, log_id)
    if not row:
        raise not_found("Strength log not found")
    db.delete(row)
    db.commit()
    return Response(status_code=204)
