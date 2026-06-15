import pytest
from app.services.calculations import suggest_targets, walk_burn_kcal


def test_walk_burn_kcal():
    assert walk_burn_kcal(10000, 72) == 360


def test_suggest_targets_male():
    from datetime import date

    result = suggest_targets(72, 175, date(1990, 1, 1), "male", 1.375, date(2026, 6, 13))
    assert result["kcal"] >= 1200
    assert result["protein_g"] >= 72 * 1.6


def test_bmr_mifflin_st_jeor():
    from datetime import date

    from app.services.calculations import age_from_birth, bmr_kcal

    age = age_from_birth(date(1990, 1, 15), date(2026, 6, 13))
    assert bmr_kcal(72, 175, age, "male") == int(10 * 72 + 6.25 * 175 - 5 * age + 5)


def test_health_sync_and_dashboard(client):
    profile = {
        "height_cm": 175,
        "birth_date": "1990-01-15",
        "sex": "male",
        "activity_factor": 1.375,
        "current_weight_kg": 72,
        "setup_completed": True,
    }
    r = client.put("/api/v1/profile", json=profile)
    assert r.status_code == 200

    r = client.post("/api/v1/sync/health", json={"date": "2026-06-13", "steps": 8000})
    assert r.status_code == 200
    assert r.json()["steps"] == 8000

    r = client.post("/api/v1/sync/health", json={"date": "2026-06-13", "steps": 9000})
    assert r.status_code == 200

    r = client.post(
        "/api/v1/sync/health",
        json={"date": "2026-06-13", "steps": 9100, "weight_kg": None},
    )
    assert r.status_code == 200
    assert r.json()["weight_logged"] is False

    r = client.post(
        "/api/v1/sync/health",
        json={"date": "2026-06-13", "steps": 9200, "weight_kg": ""},
    )
    assert r.status_code == 200
    assert r.json()["weight_logged"] is False

    r = client.get("/api/v1/dashboard/today", params={"date": "2026-06-13"})
    assert r.status_code == 200
    data = r.json()
    assert data["steps"] == 9200
    assert data["burn"]["walk_kcal"] > 0


def test_health_sync_body_composition(client):
    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "activity_factor": 1.375,
            "current_weight_kg": 72,
            "setup_completed": True,
        },
    )
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
    assert r.json()["weight_logged"] is True

    weight = client.get("/api/v1/weights").json()[0]
    assert weight["bmi"] == 23.5
    assert weight["lbm_kg"] == 58.2
    assert weight["body_fat_pct"] == 19.2

    dash = client.get("/api/v1/dashboard/today", params={"date": "2026-06-13"}).json()
    assert dash["bmi"] == 23.5
    assert dash["lbm_kg"] == 58.2
    assert dash["body_fat_pct"] == 19.2


def test_health_sync_date_only_and_partial(client):
    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "activity_factor": 1.375,
            "current_weight_kg": 72,
            "setup_completed": True,
        },
    )

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
    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "activity_factor": 1.375,
            "current_weight_kg": 72,
            "setup_completed": True,
        },
    )
    preset = client.post(
        "/api/v1/food-presets",
        json={"name": "onigiri", "kcal": 188, "protein_g": 6, "fat_g": 5, "carbs_g": 28},
    ).json()
    client.post(
        "/api/v1/meals",
        json={
            "log_date": "2026-06-13",
            "name": preset["name"],
            "kcal": 188,
            "protein_g": 6,
            "fat_g": 5,
            "carbs_g": 28,
            "food_preset_id": preset["id"],
        },
    )
    dash = client.get("/api/v1/dashboard/today", params={"date": "2026-06-13"}).json()
    assert dash["intake"]["kcal"] == 188


def test_delete_meal_walk_and_weight(client):
    client.put(
        "/api/v1/profile",
        json={
            "height_cm": 175,
            "birth_date": "1990-01-15",
            "sex": "male",
            "activity_factor": 1.375,
            "current_weight_kg": 72,
            "setup_completed": True,
        },
    )
    meal = client.post(
        "/api/v1/meals",
        json={
            "log_date": "2026-06-13",
            "name": "test",
            "kcal": 100,
            "protein_g": 1,
            "fat_g": 1,
            "carbs_g": 1,
        },
    ).json()
    assert client.delete(f"/api/v1/meals/{meal['id']}").status_code == 204

    walk = client.post("/api/v1/walks", json={"discovery_note": "test"}).json()
    assert client.delete(f"/api/v1/walks/{walk['id']}").status_code == 204

    weight = client.post("/api/v1/weights", json={"weight_kg": 71.5}).json()
    assert client.delete(f"/api/v1/weights/{weight['id']}").status_code == 204
