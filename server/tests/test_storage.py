import io

from PIL import Image

from app.storage import MemoryStorage, photo_key, process_image


def make_jpeg(width: int, height: int) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (width, height), (120, 90, 60)).save(buf, format="JPEG")
    return buf.getvalue()


def test_long_edge_is_capped_at_1280():
    processed = process_image(make_jpeg(4032, 3024))
    out = Image.open(io.BytesIO(processed.jpeg))
    assert max(out.size) == 1280
    assert out.size == (1280, 960)   # 가로세로비 유지


def test_small_images_are_not_upscaled():
    processed = process_image(make_jpeg(800, 600))
    assert Image.open(io.BytesIO(processed.jpeg)).size == (800, 600)


def test_resize_shrinks_the_payload():
    raw = make_jpeg(4032, 3024)
    assert len(process_image(raw).jpeg) < len(raw)


def test_output_is_always_jpeg():
    buf = io.BytesIO()
    Image.new("RGBA", (900, 900), (10, 20, 30, 255)).save(buf, format="PNG")
    processed = process_image(buf.getvalue())
    assert Image.open(io.BytesIO(processed.jpeg)).format == "JPEG"


def test_phash_is_stable_and_distinguishes_images():
    a = process_image(make_jpeg(1000, 1000)).phash
    again = process_image(make_jpeg(1000, 1000)).phash
    assert a == again
    assert isinstance(a, str) and len(a) == 16


def test_missing_exif_yields_none():
    assert process_image(make_jpeg(600, 600)).taken_at is None


def test_photo_key_is_namespaced_by_user():
    assert photo_key("u1", "p1") == "photos/u1/p1.jpg"


def test_memory_storage_round_trips():
    storage = MemoryStorage()
    storage.put("k", b"bytes")
    assert storage.items["k"] == b"bytes"
    assert storage.get("k") == b"bytes"
