"""Photo Forensics Agent: checks accident photos for reuse and metadata inconsistencies.

Fraud patterns covered:
- the same photo (or a near copy) submitted on several claim files;
- a photo taken *before* the declared accident date (EXIF);
- a photo saved by editing software, or stripped of its metadata.
"""
import io
from datetime import date, datetime

from PIL import Image, UnidentifiedImageError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.db.models import Document

DUPLICATE_MAX_DISTANCE = 4  # out of 64 bits; true re-uploads land at 0-1
EDITING_SOFTWARE = ("photoshop", "gimp", "lightroom", "snapseed", "picsart", "canva")

_EXIF_IFD = 0x8769
_GPS_IFD = 0x8825
_TAG_DATETIME = 306
_TAG_SOFTWARE = 305
_TAG_DATETIME_ORIGINAL = 36867


def difference_hash(image: Image.Image) -> str:
    """64-bit dHash: robust to resizing/recompression, so near-identical photos collide."""
    small = image.convert("L").resize((9, 8), Image.Resampling.LANCZOS)
    pixels = list(small.getdata())
    bits = 0
    for row in range(8):
        for col in range(8):
            left = pixels[row * 9 + col]
            right = pixels[row * 9 + col + 1]
            bits = (bits << 1) | int(left > right)
    return f"{bits:016x}"


def hamming(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


def _read_exif(image: Image.Image) -> tuple[datetime | None, str | None]:
    exif = image.getexif()
    raw = exif.get_ifd(_EXIF_IFD).get(_TAG_DATETIME_ORIGINAL) or exif.get(_TAG_DATETIME)
    taken_at = None
    if raw:
        try:
            taken_at = datetime.strptime(str(raw).strip("\x00"), "%Y:%m:%d %H:%M:%S")
        except ValueError:
            taken_at = None
    software = exif.get(_TAG_SOFTWARE)
    return taken_at, str(software) if software else None


def _read_gps(image: Image.Image) -> dict | None:
    gps = image.getexif().get_ifd(_GPS_IFD)
    try:
        def to_deg(values, ref) -> float:
            d, m, sec = (float(v) for v in values)
            deg = d + m / 60 + sec / 3600
            return -deg if ref in ("S", "W") else deg

        return {"lat": round(to_deg(gps[2], gps.get(1)), 6), "lng": round(to_deg(gps[4], gps.get(3)), 6)}
    except (KeyError, TypeError, ValueError, ZeroDivisionError):
        return None


def analyze(content: bytes, claim_date: date, dossier_id: str, db: Session) -> tuple[str | None, dict]:
    """Returns (image hash, analysis dict). Non-images get an empty analysis."""
    try:
        image = Image.open(io.BytesIO(content))
        image.load()
    except (UnidentifiedImageError, OSError):
        return None, {}

    image_hash = difference_hash(image)
    taken_at, software = _read_exif(image)
    flags: list[dict] = []

    duplicates = []
    others = db.execute(
        select(Document.id, Document.dossier_id, Document.image_hash).where(
            Document.image_hash.is_not(None), Document.dossier_id != dossier_id
        )
    ).all()
    for doc_id, other_dossier, other_hash in others:
        distance = hamming(image_hash, other_hash)
        if distance <= DUPLICATE_MAX_DISTANCE:
            duplicates.append({"dossier_id": other_dossier, "document_id": doc_id, "distance": distance})
    if duplicates:
        ids = ", ".join(sorted({d["dossier_id"] for d in duplicates}))
        flags.append({"level": "high", "text": f"Photo déjà soumise dans un autre dossier ({ids})"})

    if taken_at is None:
        flags.append({"level": "info", "text": "Métadonnées EXIF absentes (capture d'écran, photo transférée ou nettoyée ?)"})
    elif taken_at.date() < claim_date:
        flags.append(
            {
                "level": "high",
                "text": f"Photo prise le {taken_at:%d/%m/%Y}, avant la date déclarée de l'accident ({claim_date:%d/%m/%Y})",
            }
        )

    if software and any(s in software.lower() for s in EDITING_SOFTWARE):
        flags.append({"level": "medium", "text": f"Image enregistrée par un logiciel de retouche ({software})"})

    return image_hash, {
        "agent": "photo_forensics",
        "hash": image_hash,
        "width": image.width,
        "height": image.height,
        "taken_at": taken_at.isoformat() if taken_at else None,
        "software": software,
        "gps": _read_gps(image),
        "duplicates": duplicates,
        "flags": flags,
        "verdict": "suspect" if any(f["level"] == "high" for f in flags) else "ok",
    }
