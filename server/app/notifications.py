import logging
from dataclasses import dataclass

import httpx

from app.config import settings

logger = logging.getLogger(__name__)

CHUNK_SIZE = 100   # Expo는 요청 하나에 100건 넘게 받아주지 않는다


@dataclass(frozen=True)
class Notification:
    token: str
    title: str
    body: str


def _send_chunk(chunk: list[Notification]) -> int:
    payload = [{"to": n.token, "title": n.title, "body": n.body}
               for n in chunk]
    try:
        response = httpx.post(settings.expo_push_url, json=payload, timeout=10.0)
        response.raise_for_status()
    except Exception as exc:
        logger.warning("푸시 전송 실패 (%d건): %r", len(payload), exc)
        return 0
    return len(payload)


def send_push(notifications: list[Notification]) -> int:
    """Expo Push로 보낸다. 100건씩 나눠 보내고, 실패해도 예외를 올리지 않는다.

    알림 전송 실패가 정산이나 세션 회수 배치를 중단시켜서는 안 된다.
    """
    if not notifications:
        return 0

    return sum(_send_chunk(notifications[i:i + CHUNK_SIZE])
               for i in range(0, len(notifications), CHUNK_SIZE))


# 배치는 이 훅을 통해 보낸다. 테스트에서 갈아끼우기 위한 것이다.
sender = send_push
