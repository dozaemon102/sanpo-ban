from datetime import date
from decimal import Decimal

STRENGTH_TEMPLATES = [
    {"code": "chest", "name": "胸", "met": 6.0},
    {"code": "back", "name": "背中", "met": 6.0},
    {"code": "legs", "name": "脚", "met": 6.5},
    {"code": "shoulders", "name": "肩", "met": 5.5},
    {"code": "arms", "name": "腕", "met": 5.0},
    {"code": "full", "name": "全身", "met": 6.0},
]

STRENGTH_MET = {t["code"]: t["met"] for t in STRENGTH_TEMPLATES}


def age_from_birth(birth_date: date, on_date: date) -> int:
    years = on_date.year - birth_date.year
    if (on_date.month, on_date.day) < (birth_date.month, birth_date.day):
        years -= 1
    return years


def bmr_kcal(weight_kg: float, height_cm: float, age: int, sex: str) -> int:
    base = 10 * weight_kg + 6.25 * height_cm - 5 * age
    if sex == "male":
        return int(base + 5)
    return int(base - 161)


def suggest_targets(
    weight_kg: float,
    height_cm: float,
    birth_date: date,
    sex: str,
    activity_factor: float,
    on_date: date | None = None,
) -> dict[str, float | int]:
    on_date = on_date or date.today()
    age = age_from_birth(birth_date, on_date)
    tdee = bmr_kcal(weight_kg, height_cm, age, sex) * activity_factor
    target_kcal = max(1200, int(tdee - 500))

    protein_from_ratio = target_kcal * 0.30 / 4
    protein_min = weight_kg * 1.6
    protein_g = max(protein_from_ratio, protein_min)
    fat_g = target_kcal * 0.25 / 9
    carbs_g = target_kcal * 0.45 / 4

    return {
        "kcal": target_kcal,
        "protein_g": round(protein_g, 1),
        "fat_g": round(fat_g, 1),
        "carbs_g": round(carbs_g, 1),
    }


def walk_burn_kcal(steps: int, weight_kg: float) -> int:
    return int(steps * weight_kg * 0.0005)


def katch_mcardle_bmr(lbm_kg: float) -> int:
    return int(370 + 21.6 * lbm_kg)


def tef_kcal(intake_kcal: int, tef_rate: float) -> int:
    return int(intake_kcal * tef_rate)


def treadmill_met(speed_kmh: float | None) -> float:
    if speed_kmh is None:
        return 9.0
    if speed_kmh < 6:
        return 8.0
    if speed_kmh <= 10:
        return 9.0
    return 10.0


def treadmill_burn_kcal(
    minutes: int,
    weight_kg: float,
    speed_kmh: float | None = None,
    machine_kcal: int | None = None,
) -> int:
    if machine_kcal is not None:
        return machine_kcal
    met = treadmill_met(speed_kmh)
    return int(met * weight_kg * (minutes / 60))


def strength_burn_kcal(exercise_code: str, minutes: int, weight_kg: float) -> int:
    met = STRENGTH_MET.get(exercise_code, 6.0)
    return int(met * weight_kg * (minutes / 60))
