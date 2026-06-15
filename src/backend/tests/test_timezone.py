from datetime import date

from app.core.timezone import logged_at_for_log_date, today_jst


def test_logged_at_for_log_date_today():
    logged = logged_at_for_log_date(today_jst())
    assert logged.date() == today_jst()


def test_logged_at_for_log_date_past():
    logged = logged_at_for_log_date(date(2026, 6, 10))
    assert logged.date() == date(2026, 6, 10)
    assert logged.hour == 12
