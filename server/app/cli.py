import logging
import sys
from datetime import timedelta

from app.batch.reminders import nudge_restore, remind_shortfall
from app.batch.sessions import sweep
from app.batch.settlement import settle_day
from app.db import SessionLocal
from app.time_utils import now_utc, study_day


def _settle(db) -> None:
    settle_day(db, study_day(now_utc()) - timedelta(days=1))


def _nudge(db) -> None:
    nudge_restore(db, study_day(now_utc()) - timedelta(days=1))


COMMANDS = {
    "settle": _settle,          # 04:00 — 전날을 확정한다
    "sweep": sweep,             # 5분마다 — 미종료 세션 경고·회수
    "remind": remind_shortfall,  # 22:00 — 목표 미달자에게 리마인드
    "nudge": _nudge,            # 08:00 — 어제 실패자에게 복구 유도
}


def main(argv: list[str] | None = None) -> None:
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 1 or args[0] not in COMMANDS:
        print(f"usage: python -m app.cli {{{'|'.join(COMMANDS)}}}", file=sys.stderr)
        raise SystemExit(2)

    db = SessionLocal()
    try:
        COMMANDS[args[0]](db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
