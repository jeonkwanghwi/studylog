import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

import boto3
import imagehash
from PIL import Image, ExifTags

from app.config import settings

_EXIF_DATETIME_ORIGINAL = next(
    tag for tag, name in ExifTags.TAGS.items() if name == "DateTimeOriginal"
)


@dataclass(frozen=True)
class ProcessedImage:
    jpeg: bytes
    phash: str
    taken_at: datetime | None


def _read_taken_at(image: Image.Image) -> datetime | None:
    try:
        exif = image.getexif()
        raw = exif.get(_EXIF_DATETIME_ORIGINAL)
        if not raw:
            return None
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S")
    except Exception:
        return None


def process_image(raw: bytes) -> ProcessedImage:
    """긴 변 1280px·JPEG q80으로 줄이고, pHash와 EXIF 촬영시각을 뽑는다.

    원본은 어디에도 남기지 않는다. S3 비용과 vision 입력 토큰이 함께 줄어든다.
    """
    image = Image.open(io.BytesIO(raw))
    taken_at = _read_taken_at(image)
    phash = str(imagehash.phash(image))

    image = image.convert("RGB")
    longest = max(image.size)
    if longest > settings.image_max_edge:
        ratio = settings.image_max_edge / longest
        new_size = (round(image.width * ratio), round(image.height * ratio))
        image = image.resize(new_size, Image.LANCZOS)

    buf = io.BytesIO()
    image.save(buf, format="JPEG", quality=settings.image_jpeg_quality, optimize=True)
    return ProcessedImage(jpeg=buf.getvalue(), phash=phash, taken_at=taken_at)


def photo_key(user_id: str, photo_id: str) -> str:
    return f"photos/{user_id}/{photo_id}.jpg"


class PhotoStorage(Protocol):
    def put(self, key: str, data: bytes) -> None: ...

    def get(self, key: str) -> bytes: ...


class S3Storage:
    def __init__(self, bucket: str, region: str) -> None:
        self.bucket = bucket
        self._client = boto3.client("s3", region_name=region)

    def put(self, key: str, data: bytes) -> None:
        self._client.put_object(
            Bucket=self.bucket, Key=key, Body=data, ContentType="image/jpeg"
        )

    def get(self, key: str) -> bytes:
        return self._client.get_object(Bucket=self.bucket, Key=key)["Body"].read()


@dataclass
class MemoryStorage:
    """테스트용. put한 것을 그대로 들고 있는다."""
    items: dict[str, bytes] = field(default_factory=dict)

    def put(self, key: str, data: bytes) -> None:
        self.items[key] = data

    def get(self, key: str) -> bytes:
        return self.items[key]


def get_storage() -> PhotoStorage:
    return S3Storage(settings.s3_bucket, settings.aws_region)
