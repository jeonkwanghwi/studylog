from datetime import UTC, datetime, timedelta

from app.domain import counted_minutes

BASE = datetime(2026, 9, 9, 10, 0, tzinfo=UTC)


def test_counts_whole_minutes_only():
    assert counted_minutes(BASE, BASE + timedelta(minutes=90, seconds=59), 240) == 90


def test_capped_at_the_session_limit():
    assert counted_minutes(BASE, BASE + timedelta(hours=6), 240) == 240


def test_never_negative():
    assert counted_minutes(BASE, BASE - timedelta(minutes=5), 240) == 0
