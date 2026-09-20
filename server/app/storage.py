import io
from dataclasses import dataclass, field
from datetime import datetime
from typing import Protocol

import boto3
import imagehash
from PIL import Image, ExifTags

from app.config import settings
from app.time_utils import KST

_EXIF_DATETIME_ORIGINAL = next(
    tag for tag, name in ExifTags.TAGS.items() if name == "DateTimeOriginal"
)


@dataclass(frozen=True)
class ProcessedImage:
    jpeg: bytes
    phash: str
    taken_at: datetime | None


def _read_taken_at(image: Image.Image) -> datetime | None:
    """EXIF 촬영시각을 KST aware로 읽는다.

    EXIF DateTimeOriginal에는 타임존이 없다. 그대로 두면 naive라서
    models.UTCDateTime이 저장을 거부한다(ValueError). 유저는 전원 KST이므로
    KST로 해석해 붙인다.
    """
    try:
        exif = image.getexif()
        # 실제 카메라는 DateTimeOriginal을 Exif 서브 IFD(0x8769)에 넣는다.
        # base IFD만 보면 대부분의 사진에서 못 찾는다.
        raw = (exif.get_ifd(0x8769).get(_EXIF_DATETIME_ORIGINAL)
               or exif.get(_EXIF_DATETIME_ORIGINAL))
        if not raw:
            return None
        return datetime.strptime(raw, "%Y:%m:%d %H:%M:%S").replace(tzinfo=KST)
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

    def url(self, key: str) -> str: ...

    def delete(self, key: str) -> None: ...


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

    def url(self, key: str) -> str:
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=settings.photo_url_expire_seconds,
        )

    def delete(self, key: str) -> None:
        # S3 의 delete_object 는 없는 키에도 성공한다. 지우다 만 상태에서
        # 다시 돌려도 안전하다는 뜻이라 따로 존재 확인을 하지 않는다.
        self._client.delete_object(Bucket=self.bucket, Key=key)


@dataclass
class MemoryStorage:
    """테스트용. put한 것을 그대로 들고 있는다."""
    items: dict[str, bytes] = field(default_factory=dict)

    def put(self, key: str, data: bytes) -> None:
        self.items[key] = data

    def get(self, key: str) -> bytes:
        return self.items[key]

    def url(self, key: str) -> str:
        return f"memory://{key}"

    def delete(self, key: str) -> None:
        self.items.pop(key, None)


def get_storage() -> PhotoStorage:
    return S3Storage(settings.s3_bucket, settings.aws_region)
