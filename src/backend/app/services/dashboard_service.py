from datetime import date, datetime, time, timedelta
from typing import Literal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import not_found, profile_not_setup, validation_error
from app.core.timezone import JST, today_jst
from app.models.entities import (
    DailySteps,
    MealLog,
    StrengthLog,
    TreadmillLog,
    UserProfile,
    WeightLog,
)
from app.schemas.api import (
    BalanceBreakdown,
    BalanceInfo,
    BurnTotals,
    DashboardCards,
    DashboardHistory,
    DashboardTop,
    HistoryPoint,
    MacroTotals,
)
from app.services.calculations import katch_mcardle_bmr, tef_kcal, walk_burn_kcal

HistoryMetric = Literal[
    "balance", "weight", "intake", "bmr", "exercise", "steps", "body_fat_pct", "bmi", "lbm"
]
HistoryPeriod = Literal["day", "week", "month", "year"]
BodyCompositionSource = Literal["today", "latest", "none"]
BmrStatus = Literal["ok", "lbm_missing"]

VALID_METRICS = frozenset(
    {"balance", "weight", "intake", "bmr", "exercise", "steps", "body_fat_pct", "bmi", "lbm"}
)
VALID_PERIODS = frozenset({"day", "week", "month", "year"})


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


def resolve_lbm_kg(db: Session, on_date: date, profile: UserProfile) -> tuple[float | None, BodyCompositionSource]:
    day_start = datetime.combine(on_date, time.min, tzinfo=JST)
    day_end = day_start + timedelta(days=1)
    today_row = db.scalar(
        select(WeightLog)
        .where(WeightLog.logged_at >= day_start, WeightLog.logged_at < day_end)
        .order_by(WeightLog.logged_at.desc())
        .limit(1)
    )
    if today_row and today_row.lbm_kg is not None:
        return float(today_row.lbm_kg), "today"

    latest = db.scalar(
        select(WeightLog)
        .where(WeightLog.lbm_kg.isnot(None))
        .order_by(WeightLog.logged_at.desc())
        .limit(1)
    )
    if latest and latest.lbm_kg is not None:
        return float(latest.lbm_kg), "latest"
    return None, "none"


def resolve_body_field(
    db: Session,
    on_date: date,
    field: Literal["bmi", "lbm_kg", "body_fat_pct"],
) -> float | None:
    day_start = datetime.combine(on_date, time.min, tzinfo=JST)
    day_end = day_start + timedelta(days=1)
    col = getattr(WeightLog, field)
    today_row = db.scalar(
        select(WeightLog)
        .where(WeightLog.logged_at >= day_start, WeightLog.logged_at < day_end)
        .order_by(WeightLog.logged_at.desc())
        .limit(1)
    )
    if today_row:
        val = getattr(today_row, field)
        if val is not None:
            return float(val)

    latest = db.scalar(
        select(WeightLog).where(col.isnot(None)).order_by(WeightLog.logged_at.desc()).limit(1)
    )
    if latest:
        val = getattr(latest, field)
        if val is not None:
            return float(val)
    return None


def latest_weight_kg(db: Session, on_date: date, profile: UserProfile) -> float:
    row = latest_weight_entry(db, on_date, profile)
    if row:
        return float(row.weight_kg)
    return float(profile.initial_weight_kg)


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


def resolve_walk_params(db: Session, on_date: date) -> tuple[float | None, float | None]:
    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == on_date))
    if not steps_row:
        return None, None
    stride_cm = float(steps_row.stride_cm) if steps_row.stride_cm is not None else None
    speed_kmh = (
        float(steps_row.walking_speed_kmh) if steps_row.walking_speed_kmh is not None else None
    )
    return stride_cm, speed_kmh


def burn_for_date(db: Session, on_date: date, weight_kg: float, profile: UserProfile) -> BurnTotals:
    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == on_date))
    steps = steps_row.steps if steps_row else 0
    stride_cm, speed_kmh = resolve_walk_params(db, on_date)
    walk, _ = walk_burn_kcal(steps, weight_kg, stride_cm=stride_cm, speed_kmh=speed_kmh)

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


def steps_for_date(db: Session, on_date: date) -> int:
    steps_row = db.scalar(select(DailySteps).where(DailySteps.step_date == on_date))
    return steps_row.steps if steps_row else 0


class _HistoryRangeCache:
    """履歴 API 用: 期間内データを一括読込し、日次・集計をメモリ上で行う。"""

    def __init__(self, db: Session, profile: UserProfile, start: date, end: date) -> None:
        self.db = db
        self.profile = profile
        range_start = datetime.combine(start, time.min, tzinfo=JST)
        range_end = datetime.combine(end + timedelta(days=1), time.min, tzinfo=JST)

        logs = db.scalars(
            select(WeightLog)
            .where(WeightLog.logged_at >= range_start, WeightLog.logged_at < range_end)
            .order_by(WeightLog.logged_at.desc())
        ).all()
        self.weight_by_date: dict[date, WeightLog] = {}
        for log in logs:
            d = log.logged_at.astimezone(JST).date()
            if d not in self.weight_by_date:
                self.weight_by_date[d] = log

        steps_rows = db.scalars(
            select(DailySteps).where(
                DailySteps.step_date >= start,
                DailySteps.step_date <= end,
            )
        ).all()
        self.steps_by_date: dict[date, int] = {r.step_date: r.steps for r in steps_rows}
        self.walk_params_by_date: dict[date, tuple[float | None, float | None]] = {
            r.step_date: (
                float(r.stride_cm) if r.stride_cm is not None else None,
                float(r.walking_speed_kmh) if r.walking_speed_kmh is not None else None,
            )
            for r in steps_rows
        }

        latest_lbm_row = db.scalar(
            select(WeightLog)
            .where(WeightLog.lbm_kg.isnot(None))
            .order_by(WeightLog.logged_at.desc())
            .limit(1)
        )
        self.fallback_lbm_kg: float | None = (
            float(latest_lbm_row.lbm_kg)
            if latest_lbm_row and latest_lbm_row.lbm_kg is not None
            else None
        )

        self.intake_by_date: dict[date, int] = {
            row[0]: int(row[1])
            for row in db.execute(
                select(MealLog.log_date, func.coalesce(func.sum(MealLog.kcal), 0))
                .where(MealLog.log_date >= start, MealLog.log_date <= end)
                .group_by(MealLog.log_date)
            ).all()
            if int(row[1]) > 0
        }

        self.treadmill_by_date: dict[date, int] = {}
        for row in db.scalars(
            select(TreadmillLog).where(
                TreadmillLog.logged_at >= range_start,
                TreadmillLog.logged_at < range_end,
            )
        ).all():
            d = row.logged_at.astimezone(JST).date()
            self.treadmill_by_date[d] = self.treadmill_by_date.get(d, 0) + int(row.calculated_kcal)

        self.strength_by_date: dict[date, int] = {}
        for row in db.scalars(
            select(StrengthLog).where(
                StrengthLog.logged_at >= range_start,
                StrengthLog.logged_at < range_end,
            )
        ).all():
            d = row.logged_at.astimezone(JST).date()
            self.strength_by_date[d] = self.strength_by_date.get(d, 0) + int(row.calculated_kcal)

    def _weight_field(self, on_date: date, field: str) -> float | None:
        row = self.weight_by_date.get(on_date)
        if not row:
            return None
        val = getattr(row, field, None)
        return float(val) if val is not None else None

    def _has_day_activity(self, on_date: date) -> bool:
        return (
            on_date in self.intake_by_date
            or on_date in self.steps_by_date
            or on_date in self.treadmill_by_date
            or on_date in self.strength_by_date
            or on_date in self.weight_by_date
        )

    def _exercise_kcal(self, on_date: date) -> float | None:
        row = self.weight_by_date.get(on_date)
        weight = float(row.weight_kg) if row else float(self.profile.initial_weight_kg)
        steps = self.steps_by_date.get(on_date, 0)
        stride_cm, speed_kmh = self.walk_params_by_date.get(on_date, (None, None))
        walk, _ = walk_burn_kcal(steps, weight, stride_cm=stride_cm, speed_kmh=speed_kmh)
        treadmill = self.treadmill_by_date.get(on_date, 0)
        strength = self.strength_by_date.get(on_date, 0)
        total = walk + treadmill + strength
        has_record = (
            on_date in self.steps_by_date
            or on_date in self.treadmill_by_date
            or on_date in self.strength_by_date
        )
        if has_record or total > 0:
            return float(total)
        return None

    def day_metric(self, metric: HistoryMetric, on_date: date) -> float | None:
        if metric == "weight":
            row = self.weight_by_date.get(on_date)
            return float(row.weight_kg) if row else None
        if metric == "bmi":
            return self._weight_field(on_date, "bmi")
        if metric == "lbm":
            return self._weight_field(on_date, "lbm_kg")
        if metric == "body_fat_pct":
            return self._weight_field(on_date, "body_fat_pct")
        if metric == "steps":
            return float(self.steps_by_date[on_date]) if on_date in self.steps_by_date else None
        if metric == "intake":
            return float(self.intake_by_date[on_date]) if on_date in self.intake_by_date else None
        if metric == "exercise":
            return self._exercise_kcal(on_date)
        if metric == "bmr":
            lbm_kg = self._weight_field(on_date, "lbm_kg")
            if lbm_kg is None:
                return None
            return float(katch_mcardle_bmr(lbm_kg))
        if metric == "balance":
            if not self._has_day_activity(on_date):
                return None
            lbm_kg = self._weight_field(on_date, "lbm_kg") or self.fallback_lbm_kg
            if lbm_kg is None:
                return None
            bmr_kcal = katch_mcardle_bmr(lbm_kg)
            intake_kcal = self.intake_by_date.get(on_date, 0)
            exercise = self._exercise_kcal(on_date) or 0
            tef = tef_kcal(intake_kcal, float(self.profile.tef_rate))
            return float(intake_kcal - bmr_kcal - self.profile.neat_kcal - exercise - tef)
        return None

    def average_metric(self, metric: HistoryMetric, start: date, end: date) -> float | None:
        values: list[float] = []
        d = start
        while d <= end:
            val = self.day_metric(metric, d)
            if val is not None:
                values.append(val)
            d += timedelta(days=1)
        if not values:
            return None
        return sum(values) / len(values)


def daily_snapshot(db: Session, on_date: date, profile: UserProfile) -> dict:
    intake = sum_meals(db, on_date)
    weight_kg = latest_weight_kg(db, on_date, profile)
    burn = burn_for_date(db, on_date, weight_kg, profile)
    stride_cm, speed_kmh = resolve_walk_params(db, on_date)
    _, walk_calc_method = walk_burn_kcal(
        steps_for_date(db, on_date),
        weight_kg,
        stride_cm=stride_cm,
        speed_kmh=speed_kmh,
    )
    lbm_kg, body_source = resolve_lbm_kg(db, on_date, profile)
    bmr_kcal = katch_mcardle_bmr(lbm_kg) if lbm_kg is not None else None
    neat = profile.neat_kcal
    tef = tef_kcal(intake.kcal, float(profile.tef_rate))
    balance = None
    if bmr_kcal is not None:
        balance = intake.kcal - bmr_kcal - neat - burn.total_kcal - tef

    return {
        "intake_kcal": intake.kcal,
        "exercise_kcal": burn.total_kcal,
        "walk_kcal": burn.walk_kcal,
        "stride_cm": stride_cm,
        "walking_speed_kmh": speed_kmh,
        "walk_calc_method": walk_calc_method,
        "steps": steps_for_date(db, on_date),
        "weight_kg": weight_kg,
        "bmr_kcal": bmr_kcal,
        "neat_kcal": neat,
        "tef_kcal": tef,
        "balance": balance,
        "body_fat_pct": resolve_body_field(db, on_date, "body_fat_pct"),
        "bmi": resolve_body_field(db, on_date, "bmi"),
        "lbm_kg": lbm_kg if lbm_kg is not None else resolve_body_field(db, on_date, "lbm_kg"),
        "body_composition_source": body_source,
        "bmr_status": "ok" if bmr_kcal is not None else "lbm_missing",
    }


def build_dashboard_top(db: Session, on_date: date | None = None) -> DashboardTop:
    on_date = on_date or today_jst()
    profile = get_profile(db)
    require_setup(profile)
    snap = daily_snapshot(db, on_date, profile)

    balance = BalanceInfo(
        value=snap["balance"],
        computable=snap["balance"] is not None,
        breakdown=BalanceBreakdown(
            intake_kcal=snap["intake_kcal"],
            bmr_kcal=snap["bmr_kcal"],
            neat_kcal=snap["neat_kcal"],
            exercise_kcal=snap["exercise_kcal"],
            tef_kcal=snap["tef_kcal"],
        ),
    )
    cards = DashboardCards(
        weight_kg=snap["weight_kg"],
        intake_kcal=snap["intake_kcal"],
        bmr_kcal=snap["bmr_kcal"],
        exercise_kcal=snap["exercise_kcal"],
        walk_kcal=snap["walk_kcal"],
        steps=snap["steps"],
        stride_cm=snap["stride_cm"],
        walking_speed_kmh=snap["walking_speed_kmh"],
        walk_calc_method=snap["walk_calc_method"],
        body_fat_pct=snap["body_fat_pct"],
        bmi=snap["bmi"],
        lbm_kg=snap["lbm_kg"],
    )
    return DashboardTop(
        date=on_date,
        balance=balance,
        cards=cards,
        bmr_status=snap["bmr_status"],
        body_composition_source=snap["body_composition_source"],
    )


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _week_end(d: date) -> date:
    return _week_start(d) + timedelta(days=6)


def _month_start(d: date) -> date:
    return d.replace(day=1)


def _month_end(d: date) -> date:
    if d.month == 12:
        nxt = d.replace(year=d.year + 1, month=1, day=1)
    else:
        nxt = d.replace(month=d.month + 1, day=1)
    return nxt - timedelta(days=1)


def _year_start(d: date) -> date:
    return d.replace(month=1, day=1)


def _year_end(d: date) -> date:
    return d.replace(month=12, day=31)


def _iso_week_label(start: date) -> str:
    iso = start.isocalendar()
    return f"{iso.year}-W{iso.week:02d}"


def _period_buckets(period: HistoryPeriod, anchor_date: date) -> list[tuple[str, date, date]]:
    buckets: list[tuple[str, date, date]] = []
    if period == "day":
        for i in range(13, -1, -1):
            d = anchor_date - timedelta(days=i)
            buckets.append((d.isoformat(), d, d))
    elif period == "week":
        end = _week_end(anchor_date)
        for i in range(11, -1, -1):
            w_end = end - timedelta(weeks=i)
            w_start = _week_start(w_end)
            buckets.append((_iso_week_label(w_start), w_start, w_end))
    elif period == "month":
        cursor = _month_start(anchor_date)
        months: list[tuple[str, date, date]] = []
        for _ in range(12):
            m_start = cursor
            m_end = _month_end(cursor)
            months.append((f"{cursor.year}-{cursor.month:02d}", m_start, m_end))
            if cursor.month == 1:
                cursor = cursor.replace(year=cursor.year - 1, month=12)
            else:
                cursor = cursor.replace(month=cursor.month - 1)
        buckets = list(reversed(months))
    elif period == "year":
        y = anchor_date.year
        for i in range(4, -1, -1):
            yr = y - i
            buckets.append((str(yr), date(yr, 1, 1), date(yr, 12, 31)))
    return buckets


def _metric_value_for_range(
    db: Session,
    profile: UserProfile,
    metric: HistoryMetric,
    start: date,
    end: date,
    period: HistoryPeriod,
    cache: _HistoryRangeCache,
) -> float | None:
    if period == "day" or start == end:
        return cache.day_metric(metric, start)
    return cache.average_metric(metric, start, end)


def build_history(
    db: Session,
    metric: str,
    period: str,
    anchor_date: date | None = None,
) -> DashboardHistory:
    if metric not in VALID_METRICS:
        raise validation_error(f"Invalid metric: {metric}")
    if period not in VALID_PERIODS:
        raise validation_error(f"Invalid period: {period}")

    anchor_date = anchor_date or today_jst()
    profile = get_profile(db)
    require_setup(profile)

    buckets = _period_buckets(period, anchor_date)
    if not buckets:
        return DashboardHistory(
            metric=metric,
            period=period,
            anchor_date=anchor_date,
            points=[],
        )

    cache = _HistoryRangeCache(db, profile, buckets[0][1], buckets[-1][2])
    points: list[HistoryPoint] = []
    for label, start, end in buckets:
        val = _metric_value_for_range(db, profile, metric, start, end, period, cache)
        points.append(
            HistoryPoint(label=label, start_date=start, end_date=end, value=val)
        )

    return DashboardHistory(
        metric=metric,
        period=period,
        anchor_date=anchor_date,
        points=points,
    )
