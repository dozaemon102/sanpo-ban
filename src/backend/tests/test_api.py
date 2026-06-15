import pytest
from app.services.calculations import (
    katch_mcardle_bmr,
    tef_kcal,
    walk_burn_kcal,
    walk_burn_kcal_met,
    walk_burn_kcal_simple,
)


def test_walk_burn_kcal_simple():
    assert walk_burn_kcal_simple(10000, 72) == 360


def test_walk_burn_kcal_met():
    # 10000 steps, 70cm stride => 7km, 4km/h => 1.75h, MET 3.5, 72kg
    assert walk_burn_kcal_met(10000, 72, 70, 4.0) == int(3.5 * 72 * 1.75)


def test_walk_burn_kcal_uses_met_when_params_present():
    kcal, method = walk_burn_kcal(10000, 72, stride_cm=70, speed_kmh=4.0)
    assert method == "met"
    assert kcal == walk_burn_kcal_met(10000, 72, 70, 4.0)


def test_walk_burn_kcal_fallback_without_stride():
    kcal, method = walk_burn_kcal(10000, 72, speed_kmh=4.0)
    assert method == "simple"
    assert kcal == 360


def test_katch_mcardle_bmr():
    assert katch_mcardle_bmr(58.2) == int(370 + 21.6 * 58.2)


def test_tef_kcal():
    assert tef_kcal(1800, 0.10) == 180


def _setup_profile(client):
    return client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "current_weight_kg": 72,
            "neat_kcal": 200,
            "tef_rate": 0.10,
            "setup_completed": True,
        },
    )


def test_health_sync_and_dashboard_top(client):
    assert _setup_profile(client).status_code == 200

    r = client.post("/api/v1/sync/health", json={"date": "2026-06-13", "steps": 8000})
    assert r.status_code == 200
    assert r.json()["steps"] == 8000

    r = client.post("/api/v1/sync/health", json={"date": "2026-06-13", "steps": 9200})
    assert r.status_code == 200

    r = client.get("/api/v1/dashboard/top", params={"date": "2026-06-13"})
    assert r.status_code == 200
    data = r.json()
    assert data["cards"]["steps"] == 9200
    assert data["cards"]["exercise_kcal"] > 0
    assert data["bmr_status"] == "lbm_missing"
    assert data["balance"]["computable"] is False
    assert data["balance"]["value"] is None


def test_balance_with_lbm(client):
    _setup_profile(client)
    client.post(
        "/api/v1/sync/health",
        json={
            "date": "2026-06-13",
            "steps": 5000,
            "weight_kg": 72,
            "bmi": 23.5,
            "lbm_kg": 58.2,
            "body_fat_pct": 19.2,
        },
    )

    dash = client.get("/api/v1/dashboard/top", params={"date": "2026-06-13"}).json()
    assert dash["bmr_status"] == "ok"
    assert dash["cards"]["lbm_kg"] == 58.2
    assert dash["balance"]["computable"] is True
    b = dash["balance"]["breakdown"]
    expected = b["intake_kcal"] - b["bmr_kcal"] - b["neat_kcal"] - b["exercise_kcal"] - b["tef_kcal"]
    assert dash["balance"]["value"] == expected


def test_health_sync_body_composition(client):
    _setup_profile(client)
    r = client.post(
        "/api/v1/sync/health",
        json={
            "date": "2026-06-13",
            "steps": 5000,
            "weight_kg": 72,
            "bmi": 23.5,
            "lbm_kg": 58.2,
            "body_fat_pct": 19.2,
        },
    )
    assert r.status_code == 200
    assert r.json()["body_composition_logged"] is True

    weights = client.get("/api/v1/weights").json()
    weight = next(w for w in weights if w.get("bmi") == 23.5)
    assert weight["lbm_kg"] == 58.2
    assert weight["body_fat_pct"] == 19.2


def test_health_sync_date_only_and_partial(client):
    _setup_profile(client)

    r = client.post("/api/v1/sync/health", json={"date": "2026-06-14"})
    assert r.status_code == 200
    data = r.json()
    assert data["ok"] is True
    assert data["steps"] is None
    assert data["steps_logged"] is False
    assert data["weight_logged"] is False

    r = client.post(
        "/api/v1/sync/health",
        json={"date": "2026-06-14", "weight_kg": 71.8, "bmi": 23.1, "steps": ""},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["weight_logged"] is True
    assert data["steps_logged"] is False

    r = client.post("/api/v1/sync/health", json={"date": "2026-06-14", "steps": 6000})
    assert r.status_code == 200
    data = r.json()
    assert data["steps_logged"] is True
    assert data["steps"] == 6000


def test_meal_preset_flow(client):
    _setup_profile(client)
    client.post(
        "/api/v1/sync/health",
        json={"date": "2026-06-13", "lbm_kg": 58.2, "weight_kg": 72},
    )
    preset = client.post(
        "/api/v1/food-presets",
        json={"name": "onigiri", "kcal": 188, "protein_g": 6, "fat_g": 5, "carbs_g": 28},
    ).json()
    client.post(
        "/api/v1/meals",
        json={
            "log_date": "2026-06-13",
            "meal_slot": "lunch",
            "name": preset["name"],
            "kcal": 188,
            "protein_g": 6,
            "fat_g": 5,
            "carbs_g": 28,
            "food_preset_id": preset["id"],
        },
    )
    dash = client.get("/api/v1/dashboard/top", params={"date": "2026-06-13"}).json()
    assert dash["cards"]["intake_kcal"] == 188


def test_delete_meal_and_weight(client):
    _setup_profile(client)
    meal = client.post(
        "/api/v1/meals",
        json={
            "log_date": "2026-06-13",
            "meal_slot": "dinner",
            "name": "test",
            "kcal": 100,
            "protein_g": 1,
            "fat_g": 1,
            "carbs_g": 1,
        },
    ).json()
    assert client.delete(f"/api/v1/meals/{meal['id']}").status_code == 204

    weight = client.post("/api/v1/weights", json={"weight_kg": 71.5}).json()
    assert client.delete(f"/api/v1/weights/{weight['id']}").status_code == 204


def test_walk_api_removed(client):
    assert client.get("/api/v1/walks").status_code == 404
    assert client.get("/api/v1/dashboard/today").status_code == 404
    assert client.get("/api/v1/summary/week").status_code == 404


def test_dashboard_history(client):
    _setup_profile(client)
    client.post(
        "/api/v1/sync/health",
        json={"date": "2026-06-13", "steps": 8000, "lbm_kg": 58.2, "weight_kg": 72},
    )
    r = client.get(
        "/api/v1/dashboard/history/steps",
        params={"period": "day", "anchor_date": "2026-06-13"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["metric"] == "steps"
    assert data["period"] == "day"
    assert len(data["points"]) == 14


def test_weight_history_no_carry_forward(client):
    _setup_profile(client)
    client.post("/api/v1/sync/health", json={"date": "2026-06-13", "weight_kg": 72.0})
    client.post("/api/v1/sync/health", json={"date": "2026-06-15", "weight_kg": 74.5})

    r = client.get(
        "/api/v1/dashboard/history/weight",
        params={"period": "day", "anchor_date": "2026-06-15"},
    )
    assert r.status_code == 200
    by_label = {p["label"]: p["value"] for p in r.json()["points"]}
    assert by_label["2026-06-13"] == 72.0
    assert by_label["2026-06-14"] is None
    assert by_label["2026-06-15"] == 74.5


def test_weight_history_week_average(client):
    _setup_profile(client)
    client.post("/api/v1/sync/health", json={"date": "2026-06-09", "weight_kg": 70.0})
    client.post("/api/v1/sync/health", json={"date": "2026-06-11", "weight_kg": 74.0})

    r = client.get(
        "/api/v1/dashboard/history/weight",
        params={"period": "week", "anchor_date": "2026-06-15"},
    )
    assert r.status_code == 200
    points = r.json()["points"]
    anchor_week = points[-1]
    assert anchor_week["value"] == pytest.approx(72.0)


def test_dashboard_history_year_period(client):
    _setup_profile(client)
    client.post("/api/v1/sync/health", json={"date": "2026-06-15", "weight_kg": 74.5})

    r = client.get(
        "/api/v1/dashboard/history/weight",
        params={"period": "year", "anchor_date": "2026-06-15"},
    )
    assert r.status_code == 200
    data = r.json()
    assert data["period"] == "year"
    assert len(data["points"]) == 5
    by_label = {p["label"]: p["value"] for p in data["points"]}
    assert by_label["2026"] == pytest.approx(74.5)
    assert by_label["2025"] is None


def test_neat_tef_affects_balance(client):
    _setup_profile(client)
    client.post(
        "/api/v1/sync/health",
        json={"date": "2026-06-13", "lbm_kg": 58.2, "weight_kg": 72},
    )
    before = client.get("/api/v1/dashboard/top", params={"date": "2026-06-13"}).json()

    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "current_weight_kg": 72,
            "neat_kcal": 300,
            "tef_rate": 0.15,
            "setup_completed": True,
        },
    )
    after = client.get("/api/v1/dashboard/top", params={"date": "2026-06-13"}).json()
    assert after["balance"]["breakdown"]["neat_kcal"] == 300
    assert after["balance"]["value"] != before["balance"]["value"]


def test_health_sync_walk_params_and_met_dashboard(client):
    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "current_weight_kg": 72,
            "neat_kcal": 180,
            "tef_rate": 0.10,
            "stride_cm": 70,
            "walking_speed_kmh": 4.0,
            "setup_completed": True,
        },
    )
    r = client.post(
        "/api/v1/sync/health",
        json={
            "date": "2026-06-15",
            "steps": 10000,
            "stride_cm": 72,
            "walking_speed_kmh": 4.2,
        },
    )
    assert r.status_code == 200
    data = r.json()
    assert data["steps"] == 10000
    assert data["stride_cm"] == 72
    assert data["walking_speed_kmh"] == 4.2

    dash = client.get("/api/v1/dashboard/top", params={"date": "2026-06-15"}).json()
    cards = dash["cards"]
    assert cards["stride_cm"] == 72
    assert cards["walking_speed_kmh"] == 4.2
    assert cards["walk_calc_method"] == "met"
    assert cards["walk_kcal"] > cards["steps"] * 72 * 0.0005


def test_meal_slot_and_past_date_exercise(client):
    _setup_profile(client)
    r = client.post(
        "/api/v1/meals",
        json={
            "log_date": "2026-06-10",
            "meal_slot": "breakfast",
            "name": "朝ごはん",
            "kcal": 400,
            "protein_g": 20,
            "fat_g": 10,
            "carbs_g": 50,
            "food_preset_id": None,
        },
    )
    assert r.status_code == 201
    assert r.json()["meal_slot"] == "breakfast"

    meals = client.get("/api/v1/meals", params={"date": "2026-06-10"}).json()
    assert len(meals) == 1
    assert meals[0]["meal_slot"] == "breakfast"

    r = client.post(
        "/api/v1/exercises/treadmill",
        json={"log_date": "2026-06-10", "minutes": 30},
    )
    assert r.status_code == 201
    logs = client.get("/api/v1/exercises/treadmill", params={"date": "2026-06-10"}).json()
    assert len(logs) == 1
