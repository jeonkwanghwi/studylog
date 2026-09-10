from datetime import UTC, date, datetime

from app.time_utils import KST, day_bounds, study_day


def test_before_4am_belongs_to_previous_day():
    dt = datetime(2026, 9, 9, 3, 59, tzinfo=KST)
    assert study_day(dt) == date(2026, 9, 8)


def test_exactly_4am_starts_new_day():
    dt = datetime(2026, 9, 9, 4, 0, tzinfo=KST)
    assert study_day(dt) == date(2026, 9, 9)


def test_utc_input_is_converted_to_kst_first():
    # 2026-09-08 19:00 UTC == 2026-09-09 04:00 KST
    dt = datetime(2026, 9, 8, 19, 0, tzinfo=UTC)
    assert study_day(dt) == date(2026, 9, 9)


def test_day_bounds_spans_exactly_24_hours_from_4am_kst():
    start, end = day_bounds(date(2026, 9, 9))
    assert start == datetime(2026, 9, 9, 4, 0, tzinfo=KST)
    assert end == datetime(2026, 9, 10, 4, 0, tzinfo=KST)
    assert start.tzinfo is UTC and end.tzinfo is UTC


def test_bounds_and_study_day_agree_at_the_edges():
    day = date(2026, 9, 9)
    start, end = day_bounds(day)
    assert study_day(start) == day
    assert study_day(end) == date(2026, 9, 10)
