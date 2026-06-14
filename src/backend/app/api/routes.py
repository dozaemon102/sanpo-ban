from datetime import datetime
from decimal import Decimal

from fastapi import APIRouter, Depends, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import not_found, validation_error
from app.core.timezone import now_jst, today_jst
from app.database import get_db
from app.models.entities import (
    DailySteps,
    FoodPreset,
    MealLog,
    StrengthLog,
    TreadmillLog,
    UserProfile,
    WalkSession,
    WeightLog,
)
from app.schemas.api import (
    DashboardToday,
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
    TargetMacros,
    TreadmillCreate,
    TreadmillResponse,
    WalkCreate,
    WalkResponse,
    WeekSummary,
    WeightCreate,
    WeightResponse,
)
from app.services.calculations import (
    STRENGTH_TEMPLATES,
    strength_burn_kcal,
    suggest_targets,
    treadmill_burn_kcal,
)
from app.services.dashboard_service import build_dashboard, get_profile, week_summary
from app.services.open_food_facts import lookup_barcode

router = APIRouter(prefix="/api/v1")


def _profile_response(p: UserProfile) -> ProfileResponse:
    return ProfileResponse(
        height_cm=float(p.height_cm),
        birth_date=p.birth_date,
        sex=p.sex,
        activity_factor=float(p.activity_factor),
        target_kcal=p.target_kcal,
        target_protein_g=float(p.target_protein_g),
        target_fat_g=float(p.target_fat_g),
        target_carbs_g=float(p.target_carbs_g),
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
    suggested = suggest_targets(
        body.current_weight_kg,
        body.height_cm,
        body.birth_date,
        body.sex,
        body.activity_factor,
        today_jst(),
    )
    profile = db.get(UserProfile, 1)
    if profile is None:
        profile = UserProfile(id=1, created_at=now, updated_at=now)
        db.add(profile)

    profile.height_cm = Decimal(str(body.height_cm))
    profile.birth_date = body.birth_date
    profile.sex = body.sex
    profile.activity_factor = Decimal(str(body.activity_factor))
    profile.initial_weight_kg = Decimal(str(body.current_weight_kg))
    profile.target_kcal = body.target_kcal or int(suggested["kcal"])
    profile.target_protein_g = Decimal(str(body.target_protein_g or suggested["protein_g"]))
    profile.target_fat_g = Decimal(str(body.target_fat_g or suggested["fat_g"]))
    profile.target_carbs_g = Decimal(str(body.target_carbs_g or suggested["carbs_g"]))
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


@router.post("/profile/recalculate-targets", response_model=TargetMacros)
def recalculate_targets(
    body: dict | None = None,
    db: Session = Depends(get_db),
) -> TargetMacros:
    profile = get_profile(db)
    weight = float(profile.initial_weight_kg)
    if body and body.get("current_weight_kg"):
        weight = float(body["current_weight_kg"])
    suggested = suggest_targets(
        weight,
        float(profile.height_cm),
        profile.birth_date,
        profile.sex,
        float(profile.activity_factor),
        today_jst(),
    )
    return TargetMacros(**{k: (int(v) if k == "kcal" else v) for k, v in suggested.items()})


@router.get("/dashboard/today", response_model=DashboardToday)
def dashboard_today(date: str | None = None, db: Session = Depends(get_db)) -> DashboardToday:
    from datetime import date as date_cls

    on_date = date_cls.fromisoformat(date) if date else today_jst()
    return build_dashboard(db, on_date)


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
    meal = MealLog(**body.model_dump(), logged_at=now_jst())
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
        name=meal.name,
        kcal=meal.kcal,
        protein_g=meal.protein_g,
        fat_g=meal.fat_g,
        carbs_g=meal.carbs_g,
        food_preset_id=meal.food_preset_id,
        logged_at=now_jst(),
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
    row = WeightLog(
        weight_kg=Decimal(str(body.weight_kg)),
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
    now = now_jst()
    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == body.date))
    if steps_row:
        steps_row.steps = body.steps
        steps_row.synced_at = now
    else:
        db.add(
            DailySteps(step_date=body.date, steps=body.steps, source="shortcuts", synced_at=now)
        )
    weight_logged = False
    if body.weight_kg is not None:
        db.add(
            WeightLog(
                weight_kg=Decimal(str(body.weight_kg)),
                source="shortcuts",
                logged_at=now,
            )
        )
        weight_logged = True
    db.commit()
    return {"ok": True, "steps": body.steps, "weight_logged": weight_logged}


@router.get("/walks", response_model=list[WalkResponse])
def list_walks(limit: int = 30, db: Session = Depends(get_db)) -> list[WalkSession]:
    return list(db.scalars(select(WalkSession).order_by(WalkSession.walked_at.desc()).limit(limit)))


@router.post("/walks", response_model=WalkResponse, status_code=201)
def create_walk(body: WalkCreate, db: Session = Depends(get_db)) -> WalkSession:
    walk = WalkSession(walked_at=body.walked_at or now_jst(), discovery_note=body.discovery_note)
    db.add(walk)
    db.commit()
    db.refresh(walk)
    return walk


@router.delete("/walks/{walk_id}", status_code=204)
def delete_walk(walk_id: int, db: Session = Depends(get_db)) -> Response:
    walk = db.get(WalkSession, walk_id)
    if not walk:
        raise not_found("Walk not found")
    db.delete(walk)
    db.commit()
    return Response(status_code=204)


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
    row = TreadmillLog(
        logged_at=now_jst(),
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
    row = StrengthLog(
        logged_at=now_jst(),
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


@router.get("/summary/week", response_model=WeekSummary)
def summary_week(end_date: str | None = None, db: Session = Depends(get_db)) -> WeekSummary:
    from datetime import date as date_cls

    end = date_cls.fromisoformat(end_date) if end_date else today_jst()
    return week_summary(db, end)
