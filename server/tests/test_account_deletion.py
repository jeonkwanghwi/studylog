"""회원 탈퇴.

되돌릴 수 없는 동작이라 두 가지를 같이 확인한다 — 지워야 할 것이 다
지워지는가, 그리고 **지우면 안 되는 것이 안 지워지는가**.
"""

from datetime import date

import pytest

from app.deletion import delete_account
from app.models import (Challenge, CreditLedger, DailyRecord, Group, Membership,
                        Photo, Purchase, StudySession, User, Verdict)


@pytest.fixture()
def other(client, monkeypatch):
    """옆자리 사람. 내 탈퇴에 휩쓸리면 안 된다."""
    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: f"{provider}-{id_token}")
    token = client.post("/auth/social", json={
        "provider": "kakao", "id_token": "other", "nickname": "옆사람",
    }).json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _start_and_end(client, auth, jpeg):
    """사진 두 장과 세션 하나를 실제 흐름으로 만든다."""
    client.post("/sessions/start", headers=auth,
                data={"activity": "공부"},
                files={"image": ("s.jpg", jpeg, "image/jpeg")})
    session_id = client.get("/sessions/current", headers=auth).json()["id"]
    client.post(f"/sessions/{session_id}/end", headers=auth,
                files={"image": ("e.jpg", jpeg, "image/jpeg")})


def test_탈퇴하면_계정과_토큰이_함께_사라진다(client, auth, db):
    assert client.delete("/users/me", headers=auth).status_code == 204
    assert db.query(User).count() == 0
    # 토큰 자체는 아직 유효 기간 안이지만 가리키는 사람이 없다.
    assert client.get("/users/me", headers=auth).status_code == 401


def test_사진과_판정과_세션이_전부_사라진다(client, auth, db, jpeg, storage):
    _start_and_end(client, auth, jpeg)
    keys = [p.s3_key for p in db.query(Photo).all()]
    assert keys and all(k in storage.items for k in keys)

    client.delete("/users/me", headers=auth)

    assert db.query(Photo).count() == 0
    assert db.query(Verdict).count() == 0
    assert db.query(StudySession).count() == 0
    # 파일도 남기지 않는다 — DB 만 지우면 사진은 버킷에 그대로 있다.
    assert all(k not in storage.items for k in keys)


def test_기록과_크레딧_원장이_사라진다(client, auth, db):
    user = db.query(User).one()
    db.add_all([
        DailyRecord(user_id=user.id, date=date(2026, 9, 20), total_minutes=60,
                    goal_minutes=60, result="success", payback_amount=1000,
                    streak_snapshot=1),
        CreditLedger(user_id=user.id, delta=1000, reason="payback", balance_after=1000),
    ])
    db.commit()

    client.delete("/users/me", headers=auth)

    assert db.query(DailyRecord).count() == 0
    assert db.query(CreditLedger).count() == 0


def test_영수증은_남기되_누구_것인지는_지운다(client, auth, db):
    """환불·분쟁 대응에 필요해서 남긴다. 다만 지운 사람을 도로 가리키면
    안 되므로 연결을 끊는다 — 개인정보처리방침에 적은 그대로다."""
    user = db.query(User).one()
    challenge = Challenge(
        user_id=user.id, product_id="challenge_7d_1k", entry_amount=7000,
        daily_payback=1000, total_days=7, started_on=date(2026, 9, 20),
        ends_on=date(2026, 9, 26), paid_with="iap", status="active",
    )
    db.add(challenge)
    db.flush()
    db.add(Purchase(user_id=user.id, revenuecat_event_id="evt-1",
                    product_id="challenge_7d_1k", amount=7000,
                    challenge_id=challenge.id, transaction_id="tx-1"))
    db.commit()

    client.delete("/users/me", headers=auth)

    purchase = db.query(Purchase).one()          # 영수증은 그대로 있다
    assert purchase.transaction_id == "tx-1"
    assert purchase.revenuecat_event_id == "evt-1"
    assert purchase.user_id is None              # 누구 것인지는 지웠다
    assert purchase.challenge_id is None
    assert db.query(Challenge).count() == 0


def test_방장이_나가도_남은_사람의_그룹은_살아있다(client, auth, other, db):
    created = client.post("/groups", headers=auth, json={"name": "고시반"}).json()
    client.post("/groups/join", headers=other, json={"invite_code": created["invite_code"]})

    client.delete("/users/me", headers=auth)

    group = db.query(Group).one()
    heir = db.query(User).one()                  # 남은 사람
    assert group.owner_id == heir.id             # 방장이 넘어갔다
    assert db.query(Membership).filter_by(group_id=group.id).count() == 1


def test_혼자였던_그룹은_같이_사라진다(client, auth, db):
    client.post("/groups", headers=auth, json={"name": "혼자방"})

    client.delete("/users/me", headers=auth)

    assert db.query(Group).count() == 0
    assert db.query(Membership).count() == 0


def test_남의_데이터는_건드리지_않는다(client, auth, other, db, jpeg):
    _start_and_end(client, auth, jpeg)
    _start_and_end(client, other, jpeg)
    survivor = db.query(User).filter_by(nickname="옆사람").one()

    client.delete("/users/me", headers=auth)

    assert db.query(User).count() == 1
    assert db.query(Photo).filter_by(user_id=survivor.id).count() == 2
    assert db.query(StudySession).filter_by(user_id=survivor.id).count() == 1


def test_로그인하지_않으면_아무도_지울_수_없다(client, db):
    assert client.delete("/users/me").status_code == 401   # 토큰 없음
    assert client.delete("/users/me",
                         headers={"Authorization": "Bearer not-a-real-token"}).status_code == 401
    assert db.query(User).count() == 0


def test_지울_대상을_밖에서_지정할_방법이_없다():
    """이 설계의 핵심. 삭제 함수가 id 가 아니라 인증된 User 객체만 받으므로
    '남의 id 를 넣어 부르는' 호출 자체를 만들 수 없다. 인자가 바뀌면
    이 테스트가 먼저 깨진다."""
    import inspect

    params = list(inspect.signature(delete_account).parameters)
    assert params == ["db", "user", "storage"]

    from app.routers.users import delete_me
    # 라우터도 경로·쿼리·본문에서 대상을 받지 않는다.
    assert list(inspect.signature(delete_me).parameters) == ["db", "user", "storage"]
