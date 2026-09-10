import pytest

from app.cli import COMMANDS, main


def test_every_cron_job_has_a_command():
    assert set(COMMANDS) == {"settle", "sweep", "remind", "nudge"}


def test_unknown_command_exits_nonzero(capsys):
    with pytest.raises(SystemExit) as exc:
        main(["nope"])
    assert exc.value.code == 2


def test_missing_command_exits_nonzero():
    with pytest.raises(SystemExit) as exc:
        main([])
    assert exc.value.code == 2


def test_settle_targets_yesterday(monkeypatch, db):
    from datetime import timedelta

    from app.time_utils import now_utc, study_day

    seen = {}

    def fake_settle(session, day):
        seen["day"] = day
        return 0

    monkeypatch.setattr("app.cli.SessionLocal", lambda: db)
    monkeypatch.setattr("app.cli.settle_day", fake_settle)

    main(["settle"])
    assert seen["day"] == study_day(now_utc()) - timedelta(days=1)
