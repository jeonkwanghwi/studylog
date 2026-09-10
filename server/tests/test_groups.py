import random

from app.domain import INVITE_ALPHABET, generate_invite_code
from app.models import Membership


def test_invite_code_avoids_lookalike_characters():
    code = generate_invite_code(random.Random(7))
    assert len(code) == 6
    assert set(code) <= set(INVITE_ALPHABET)
    assert not (set("O0I1") & set(INVITE_ALPHABET))


def test_creating_a_group_makes_the_owner_a_member(client, auth, db):
    r = client.post("/groups", headers=auth, json={"name": "고시반"})
    assert r.status_code == 200
    body = r.json()
    assert body["name"] == "고시반"
    assert len(body["invite_code"]) == 6
    assert db.query(Membership).filter_by(group_id=body["id"]).count() == 1


def test_joining_with_a_code_adds_a_membership(client, auth, db, monkeypatch):
    code = client.post("/groups", headers=auth, json={"name": "고시반"}).json()["invite_code"]

    monkeypatch.setattr("app.routers.auth.verify_social_token",
                        lambda provider, id_token: "apple-friend")
    friend = {"Authorization": "Bearer " + client.post("/auth/social", json={
        "provider": "apple", "id_token": "f", "nickname": "친구",
    }).json()["access_token"]}

    r = client.post("/groups/join", headers=friend, json={"invite_code": code})
    assert r.status_code == 200
    assert db.query(Membership).count() == 2


def test_unknown_code_is_rejected(client, auth):
    r = client.post("/groups/join", headers=auth, json={"invite_code": "ZZZZZZ"})
    assert r.status_code == 404


def test_joining_twice_is_idempotent(client, auth, db):
    code = client.post("/groups", headers=auth, json={"name": "고시반"}).json()["invite_code"]
    assert client.post("/groups/join", headers=auth, json={"invite_code": code}).status_code == 200
    assert db.query(Membership).count() == 1


def test_a_user_can_belong_to_several_groups(client, auth, db):
    client.post("/groups", headers=auth, json={"name": "고시반"})
    client.post("/groups", headers=auth, json={"name": "회사 동료"})

    names = {g["name"] for g in client.get("/groups", headers=auth).json()}
    assert names == {"고시반", "회사 동료"}
    assert db.query(Membership).count() == 2


def test_group_list_is_empty_for_a_new_user(client, auth):
    assert client.get("/groups", headers=auth).json() == []
