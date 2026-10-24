"""Damage Agent: compares a claim photo with the vehicle's subscription photo of the
same face to localise impacts and catch inconsistent scenarios:

- no visible change vs subscription although damage is claimed;
- a different body colour (photo of another vehicle).

Classical computer vision (aligned difference map), which assumes guided capture
(same framing, as with an on-screen silhouette). A production version would use a
damage-segmentation model; the interface (zones + heatmap) stays the same.
"""
import io
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

SIZE = (256, 192)
GRID = (4, 3)
DIFF_THRESHOLD = 38
CELL_RATIO = 0.08
NO_IMPACT_RATIO = 0.012
COLOR_DELTA = 0.22

_COLS = ["gauche", "centre-gauche", "centre-droit", "droite"]
_ROWS = ["haut", "milieu", "bas"]


def _body_color(img: Image.Image) -> np.ndarray:
    w, h = img.size
    return np.asarray(img.crop((w // 4, int(h * 0.45), 3 * w // 4, int(h * 0.7)))).reshape(-1, 3).mean(axis=0)


def compare(claim_bytes: bytes, reference_path: str, heatmap_path: Path) -> dict:
    ref = Image.open(reference_path).convert("RGB").resize(SIZE)
    claim_full = Image.open(io.BytesIO(claim_bytes)).convert("RGB")
    claim = claim_full.resize(SIZE)

    color_delta = float(np.linalg.norm(_body_color(ref) - _body_color(claim)) / 441.7)

    diff = Image.fromarray(
        np.abs(np.asarray(ref.convert("L"), dtype=np.int16) - np.asarray(claim.convert("L"), dtype=np.int16)).astype(np.uint8)
    ).filter(ImageFilter.GaussianBlur(2))
    mask = np.asarray(diff) > DIFF_THRESHOLD
    changed_ratio = float(mask.mean())

    zones = []
    cw, ch = SIZE[0] // GRID[0], SIZE[1] // GRID[1]
    for r in range(GRID[1]):
        for c in range(GRID[0]):
            ratio = float(mask[r * ch : (r + 1) * ch, c * cw : (c + 1) * cw].mean())
            if ratio > CELL_RATIO:
                zones.append({"zone": f"{_ROWS[r]} {_COLS[c]}", "intensity": round(min(ratio * 3, 1), 2)})

    overlay = np.asarray(claim, dtype=np.float32).copy()
    heat = np.asarray(diff.filter(ImageFilter.GaussianBlur(4)), dtype=np.float32) / 255
    alpha = np.clip(heat * 2.2, 0, 0.75)[..., None]
    overlay = overlay * (1 - alpha) + np.array([255, 40, 60], dtype=np.float32) * alpha
    heatmap_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(overlay.astype(np.uint8)).resize(claim_full.size).save(heatmap_path, "JPEG", quality=85)

    flags = []
    if color_delta > COLOR_DELTA:
        verdict = "vehicule_different"
        flags.append({"level": "high", "text": "Couleur de carrosserie différente de la photo de souscription : véhicule différent ?"})
    elif changed_ratio < NO_IMPACT_RATIO:
        verdict = "aucun_choc"
        flags.append({"level": "medium", "text": "Aucun choc visible par rapport à la photo de souscription"})
    else:
        verdict = "choc_detecte"

    return {
        "agent": "damage",
        "verdict": verdict,
        "changed_ratio": round(changed_ratio, 4),
        "color_delta": round(color_delta, 3),
        "zones": sorted(zones, key=lambda z: -z["intensity"]),
        "heatmap_path": str(heatmap_path),
        "flags": flags,
    }
