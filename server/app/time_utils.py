from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

KST = ZoneInfo("Asia/Seoul")
DAY_START_HOUR = 4


def now_utc() -> datetime:
    return datetime.now(UTC)


def study_day(dt: datetime) -> date:
    """dt가 속한 '공부 하루'를 돌려준다. 하루 경계는 KST 04:00이다."""
    local = dt.astimezone(KST)
    if local.hour < DAY_START_HOUR:
        return (local - timedelta(days=1)).date()
    return local.date()


def day_bounds(day: date) -> tuple[datetime, datetime]:
    """day의 [시작, 끝) 구간을 UTC로 돌려준다."""
    start_kst = datetime.combine(day, time(DAY_START_HOUR), tzinfo=KST)
    end_kst = start_kst + timedelta(days=1)
    return start_kst.astimezone(UTC), end_kst.astimezone(UTC)
