import httpx
import pytest

from app.notifications import Notification, send_push


def test_no_notifications_sends_nothing(monkeypatch):
    def explode(*args, **kwargs):
        raise AssertionError("호출되면 안 된다")

    monkeypatch.setattr(httpx, "post", explode)
    assert send_push([]) == 0


def test_messages_are_batched_into_one_request(monkeypatch):
    captured = {}

    class Resp:
        status_code = 200

        def raise_for_status(self):
            return None

    def fake_post(url, json, timeout):
        captured["url"] = url
        captured["json"] = json
        return Resp()

    monkeypatch.setattr(httpx, "post", fake_post)

    sent = send_push([
        Notification("ExponentPushToken[a]", "제목1", "본문1"),
        Notification("ExponentPushToken[b]", "제목2", "본문2"),
    ])

    assert sent == 2
    assert len(captured["json"]) == 2
    assert captured["json"][0] == {
        "to": "ExponentPushToken[a]", "title": "제목1", "body": "본문1",
    }


def test_transport_failure_does_not_raise(monkeypatch):
    def fake_post(url, json, timeout):
        raise httpx.ConnectError("network down")

    monkeypatch.setattr(httpx, "post", fake_post)
    assert send_push([Notification("t", "제목", "본문")]) == 0
