from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from app.core.config import settings

JST = ZoneInfo(settings.tz)


def now_jst() -> datetime:
    return datetime.now(JST)


def today_jst() -> date:
    return now_jst().date()


def logged_at_for_log_date(log_date: date) -> datetime:
    """Use current time for today; noon JST for past/future log dates."""
    if log_date == today_jst():
        return now_jst()
    return datetime.combine(log_date, time(12, 0), tzinfo=JST)
