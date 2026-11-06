"""PDF of a digital constat, laid out like the standard paper "constat amiable d'accident
automobile": numbered boxes 1-15, vehicle A (yellow) and B (blue) columns around the 17
circumstance boxes, signatures. A second page carries the integrity certificate (SHA-256 seal +
QR code to verify it online) and the photo annex.

The document contains only what the drivers declared. The insurer's internal analyses (fraud
rules, liability scale, consistency checks) are deliberately NOT printed on it.
"""
import io
from datetime import UTC, datetime
from pathlib import Path

from reportlab.graphics import renderPDF
from reportlab.graphics.barcode import qr
from reportlab.graphics.shapes import Drawing
from reportlab.lib.colors import HexColor, black
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.lib.utils import ImageReader, simpleSplit
from reportlab.pdfgen import canvas

from app.agents.circumstance_agent import CASES
from app.config import get_settings
from app.db.models import Constat, ConstatFile

W, H = A4
YELLOW, BLUE = "#FFF2A8", "#BFE0FF"
INK, MUTED, LINE = "#0F172A", "#64748B", "#1E293B"
ZONE_LABELS = {"avant": "avant", "arriere": "arrière", "gauche": "côté gauche", "droite": "côté droit", "toit": "toit"}


def T(value) -> str:
    """Standard PDF fonts cover Latin-1 + a few punctuation marks: replace anything else."""
    return str(value if value is not None else "").encode("cp1252", "replace").decode("cp1252")


def _y(top: float) -> float:
    return H - top * mm


def _rect(c: canvas.Canvas, x, top, w, h, fill=None, lw=0.6):
    c.setLineWidth(lw)
    c.setStrokeColor(HexColor(LINE))
    if fill:
        c.setFillColor(HexColor(fill))
    c.rect(x * mm, _y(top + h), w * mm, h * mm, stroke=1, fill=1 if fill else 0)
    c.setFillColor(black)


def _text(c: canvas.Canvas, x, top, s, size=7.5, bold=False, color=INK, font=None):
    c.setFont(font or ("Helvetica-Bold" if bold else "Helvetica"), size)
    c.setFillColor(HexColor(color))
    c.drawString(x * mm, _y(top), T(s))


def _para(c, x, top, w, s, size=7.5, leading=3.3, max_lines=None, color=INK, bold=False, font=None) -> float:
    face = font or ("Helvetica-Bold" if bold else "Helvetica")
    lines = simpleSplit(T(s), face, size, w * mm)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        lines[-1] = lines[-1].rstrip(" .,;")[:-1] + "…"
    for i, line in enumerate(lines):
        _text(c, x, top + i * leading, line, size, color=color, font=face)
    return top + len(lines) * leading


def _field(c, x, top, w, name, value, size=7.5):
    _text(c, x, top, name, 5.2, color=MUTED)
    _para(c, x, top + 3.1, w, value or "—", size, max_lines=1)


def _section(c, x, top, w, h, num, title, fill=None) -> float:
    _rect(c, x, top, w, h, fill)
    _text(c, x + 1.4, top + 3.2, f"{num}.", 7, bold=True)
    _text(c, x + (5 if num < 10 else 7.6), top + 3.2, title.upper(), 5.6, bold=True, color=MUTED)
    return top + 6.2


def _car(c, cx, top, w, h, damaged: set[str]):
    """Top view of a vehicle (front up); damaged zones are filled red."""
    x, y0 = cx - w / 2, top
    c.setLineWidth(0.7)
    c.setStrokeColor(HexColor(LINE))
    c.setFillColor(HexColor("#FFFFFF"))
    c.roundRect(x * mm, _y(y0 + h), w * mm, h * mm, 5 * mm, stroke=1, fill=1)
    zones = {
        "avant": (x + 1.5, y0 + 1, w - 3, h * 0.22),
        "arriere": (x + 1.5, y0 + h * 0.78 - 1, w - 3, h * 0.22),
        "gauche": (x + 0.8, y0 + h * 0.25, w * 0.22, h * 0.5),
        "droite": (x + w * 0.78 - 0.8, y0 + h * 0.25, w * 0.22, h * 0.5),
        "toit": (x + w * 0.27, y0 + h * 0.3, w * 0.46, h * 0.4),
    }
    for name, (zx, zy, zw, zh) in zones.items():
        hit = name in damaged
        c.setFillColor(HexColor("#EF4444") if hit else HexColor("#F1F5F9"))
        c.setStrokeColor(HexColor("#B91C1C") if hit else HexColor("#CBD5E1"))
        c.setLineWidth(0.4)
        c.rect(zx * mm, _y(zy + zh), zw * mm, zh * mm, stroke=1, fill=1)
    c.setFillColor(black)
    _text(c, cx - 4, top - 0.8, "AVANT", 4.5, color=MUTED)


def _party_column(c, x0, w, fill, letter, p: dict, constat: Constat, observations: str | None):
    _rect(c, x0, 68, w, 6.5, fill)
    _text(c, x0 + 2, 72.6, f"VÉHICULE {letter}", 8, bold=True)
    y0 = 74.5
    top = _section(c, x0, y0, w, 22, 6, "Société d'assurances", fill)
    _field(c, x0 + 1.5, top + 0.5, w - 3, "Société", p.get("insurer"))
    _field(c, x0 + 1.5, top + 7.2, w * 0.55, "N° de contrat", p.get("policy_id"))
    _field(c, x0 + 1.5 + w * 0.55, top + 7.2, w * 0.4, "Immatriculation", p.get("plate"))

    y1 = y0 + 22
    top = _section(c, x0, y1, w, 28, 7, "Conducteur", fill)
    _field(c, x0 + 1.5, top + 0.5, w - 3, "Nom et prénom", p.get("name"))
    _field(c, x0 + 1.5, top + 7.2, w - 3, "Adresse", p.get("address"))
    _field(c, x0 + 1.5, top + 13.9, w * 0.5, "Téléphone", p.get("phone"))
    _field(c, x0 + 1.5 + w * 0.5, top + 13.9, w * 0.45, "CIN", p.get("cin"))

    y2 = y1 + 28
    top = _section(c, x0, y2, w, 16, 9, "Identité du véhicule", fill)
    _field(c, x0 + 1.5, top + 0.5, w - 3, "Marque, type", p.get("make_model"))

    y3 = y2 + 16
    damaged = set(p.get("damage") or [])
    _section(c, x0, y3, w, 34, 10, "Point de choc initial", fill)
    _car(c, x0 + w / 2, y3 + 9, 16, 22, damaged)

    y4 = y3 + 34
    top = _section(c, x0, y4, w, 13, 11, "Dégâts apparents", fill)
    names = ", ".join(ZONE_LABELS[z] for z in ZONE_LABELS if z in damaged)
    _para(c, x0 + 1.5, top + 0.8, w - 3, names or "Non renseignés", 7, max_lines=2)

    y5 = y4 + 13
    top = _section(c, x0, y5, w, 27, 14, "Observations", fill)
    _para(c, x0 + 1.5, top + 0.5, w - 3, observations or "—", 6.2, 2.7, max_lines=7)


def _circumstances(c, x0, w, cases_a: set[int], cases_b: set[int]):
    _rect(c, x0, 68, w, 6.5, "#F8FAFC")
    _text(c, x0 + 2, 72.6, "12. CIRCONSTANCES", 8, bold=True)
    top = 74.5
    _rect(c, x0, top, w, 140)
    row = 6.5
    _text(c, x0 + 2.2, top + 3.6, "A", 6.5, bold=True)
    _text(c, x0 + w - 4.6, top + 3.6, "B", 6.5, bold=True)
    _para(c, x0 + 8, top + 2.9, w - 17, "Marquer d'une croix les cases utiles", 5.2, color=MUTED, max_lines=1)
    for n, label in CASES.items():
        ry = top + 5 + (n - 1) * row
        c.setStrokeColor(HexColor("#CBD5E1"))
        c.setLineWidth(0.3)
        c.line((x0 + 1) * mm, _y(ry), (x0 + w - 1) * mm, _y(ry))
        for bx, marked, tint in ((x0 + 1.5, n in cases_a, YELLOW), (x0 + w - 6.5, n in cases_b, BLUE)):
            _rect(c, bx, ry + 0.8, 4.8, 4.8, tint, lw=0.5)
            if marked:
                c.setStrokeColor(HexColor("#0F172A"))
                c.setLineWidth(1.1)
                c.line(bx * mm + 1, _y(ry + 5.4), (bx + 4.8) * mm - 1, _y(ry + 1))
                c.line(bx * mm + 1, _y(ry + 1), (bx + 4.8) * mm - 1, _y(ry + 5.4))
        _text(c, x0 + 7.5, ry + 2.5, str(n), 6.2, bold=True)
        _para(c, x0 + 11, ry + 1.6, w - 19.5, label, 5.2, 2.1, max_lines=3)
    total_top = top + 5 + 17 * row + 1
    c.setStrokeColor(HexColor(LINE))
    c.setLineWidth(0.5)
    c.line(x0 * mm, _y(total_top + 1), (x0 + w) * mm, _y(total_top + 1))
    _text(c, x0 + 13, total_top + 8.2, "Nombre de cases marquées", 5.6, color=MUTED)
    _text(c, x0 + 3, total_top + 9, str(len(cases_a)), 10, bold=True)
    _text(c, x0 + w - 6.5, total_top + 9, str(len(cases_b)), 10, bold=True)


def _signature_box(c, x0, top, w, h, letter, fill, sig: dict | None, name: str, sig_path: str | None):
    _rect(c, x0, top, w, h, fill)
    _text(c, x0 + 1.5, top + 3.4, f"15. SIGNATURE DU CONDUCTEUR {letter}", 5.8, bold=True, color=MUTED)
    if sig and sig_path and Path(sig_path).exists():
        c.drawImage(ImageReader(sig_path), (x0 + 3) * mm, _y(top + h - 8), (w - 6) * mm, (h - 15) * mm, mask="auto", preserveAspectRatio=True, anchor="c")
        stamp = f"{name} — signé le {datetime.fromisoformat(sig['signed_at']):%d/%m/%Y à %H:%M} UTC"
        geo = f"Position : {sig['lat']:.4f}, {sig['lng']:.4f}" if sig.get("lat") is not None else "Position non communiquée"
        _para(c, x0 + 1.5, top + h - 5.2, w - 3, stamp, 5.8, max_lines=1)
        _para(c, x0 + 1.5, top + h - 2.4, w - 3, geo, 5.2, color=MUTED, max_lines=1)
    else:
        _text(c, x0 + w / 2 - 12, top + h / 2 + 2, "Non signé", 9, color="#94A3B8")


def _footer(c, constat: Constat, page: int, total: int):
    seal = f"scellé {constat.seal[:16]}…" if constat.seal else "non scellé"
    c.setStrokeColor(HexColor("#CBD5E1"))
    c.line(10 * mm, _y(288), 200 * mm, _y(288))
    _text(c, 10, 292, f"Constat {constat.id} · {seal} · généré le {datetime.now(UTC):%d/%m/%Y %H:%M} UTC", 5.8, color=MUTED)
    _text(c, 186, 292, f"Page {page}/{total}", 5.8, color=MUTED)


def _watermark(c, text: str):
    c.saveState()
    c.setFillColor(HexColor("#DC2626"))
    c.setFillAlpha(0.1)
    c.setFont("Helvetica-Bold", 58)
    c.translate(W / 2, H / 2)
    c.rotate(38)
    c.drawCentredString(0, 0, T(text))
    c.restoreState()


def _file_path(files: list[ConstatFile], file_id: int | None) -> str | None:
    return next((f.path for f in files if f.id == file_id), None)


def render(constat: Constat, files: list[ConstatFile]) -> bytes:
    settings = get_settings()
    a, b = constat.party_a, constat.party_b or {}
    signed = bool(constat.signature_a and constat.signature_b and constat.seal)
    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    c.setTitle(f"Constat amiable {constat.id}")
    c.setAuthor("Sentinelle")
    c.setSubject("Constat amiable d'accident automobile (numérique)")

    # ---- page 1: the report ----
    _rect(c, 10, 8, 190, 16, "#0F172A")
    c.setFillColor(HexColor("#67E8F9"))
    _text(c, 14, 15.5, "CONSTAT AMIABLE D'ACCIDENT AUTOMOBILE", 13.5, bold=True, color="#FFFFFF")
    subtitle = "Version numérique — signée électroniquement par les deux conducteurs" if signed else "Version numérique — projet en attente de signature"
    _text(c, 14, 20.8, subtitle, 6.8, color="#94A3B8")
    _text(c, 152, 15.5, "N°", 7, color="#94A3B8")
    _text(c, 158, 15.5, constat.id, 9.5, bold=True, color="#67E8F9")
    _text(c, 152, 20.8, f"Statut : {'signé' if signed else 'non signé'}", 6.5, color="#94A3B8")

    when = constat.accident_at
    _rect(c, 10, 27, 40, 19)
    _text(c, 11.5, 30.6, "1. DATE DE L'ACCIDENT", 5.6, bold=True, color=MUTED)
    _text(c, 11.5, 36.5, f"{when:%d/%m/%Y}", 11, bold=True)
    _text(c, 11.5, 41.8, f"Heure : {when:%H:%M}", 8)
    _rect(c, 50, 27, 80, 19)
    _text(c, 51.5, 30.6, "2. LIEU", 5.6, bold=True, color=MUTED)
    _para(c, 51.5, 35.2, 77, ", ".join(x for x in (constat.address, constat.city) if x), 8, max_lines=2)
    if constat.lat is not None:
        _text(c, 51.5, 43.6, f"GPS : {constat.lat:.5f}, {constat.lng:.5f}", 6.4, color=MUTED)
    _rect(c, 130, 27, 35, 19)
    _text(c, 131.5, 30.6, "3. BLESSÉS", 5.6, bold=True, color=MUTED)
    _text(c, 131.5, 37, "Non renseigné", 7.5, color="#94A3B8")
    _rect(c, 165, 27, 35, 19)
    _text(c, 166.5, 30.6, "4. AUTRES DÉGÂTS", 5.6, bold=True, color=MUTED)
    _text(c, 166.5, 37, "Non renseigné", 7.5, color="#94A3B8")

    _rect(c, 10, 47.5, 190, 18)
    _text(c, 11.5, 51, "5. TÉMOINS", 5.6, bold=True, color=MUTED)
    witnesses = constat.witnesses or []
    if witnesses:
        line = " · ".join(f"{w['name']}" + (f" ({w['phone']})" if w.get("phone") else "") for w in witnesses[:4])
        _para(c, 11.5, 55.5, 186, line, 7.5, max_lines=2)
    else:
        _text(c, 11.5, 56, "Aucun témoin déclaré", 7.5, color="#94A3B8")
    _text(c, 11.5, 62.5, "Noms, adresses et téléphones des témoins ; à défaut, le véhicule dans lequel ils se trouvaient.", 5.2, color=MUTED)

    _party_column(c, 10, 65, YELLOW, "A", a, constat, constat.transcript_a or a.get("observations"))
    _circumstances(c, 75, 60, set(a.get("cases", [])), set(b.get("cases", [])))
    _party_column(c, 135, 65, BLUE, "B", b, constat, b.get("observations"))

    _rect(c, 10, 216.5, 190, 20)
    _text(c, 11.5, 220, "13. CROQUIS DE L'ACCIDENT / LOCALISATION", 5.8, bold=True, color=MUTED)
    place = ", ".join(x for x in (constat.address, constat.city) if x) or "—"
    _para(c, 11.5, 225.2, 180, f"Lieu : {place}", 8, max_lines=1)
    gps = f"Coordonnées GPS relevées par le téléphone du conducteur A : {constat.lat:.5f}, {constat.lng:.5f}" if constat.lat is not None else "Coordonnées GPS non communiquées"
    _para(c, 11.5, 229.2, 180, gps, 6.6, color=MUTED, max_lines=1)
    _para(c, 11.5, 233.2, 180, "Le croquis à main levée du formulaire papier est remplacé par la géolocalisation horodatée.", 5.4, color=MUTED, max_lines=1)

    sig_a, sig_b = constat.signature_a, constat.signature_b
    _signature_box(c, 10, 238.5, 94, 47, "A", YELLOW, sig_a, a.get("name", ""), _file_path(files, sig_a and sig_a["file_id"]))
    _signature_box(c, 106, 238.5, 94, 47, "B", BLUE, sig_b, b.get("name", ""), _file_path(files, sig_b and sig_b["file_id"]))
    _footer(c, constat, 1, 2)
    if not signed:
        _watermark(c, "PROJET - NON SIGNÉ")
    c.showPage()

    # ---- page 2: integrity certificate + annex ----
    _rect(c, 10, 8, 190, 14, "#0F172A")
    _text(c, 14, 17, "CERTIFICAT D'INTÉGRITÉ ET ANNEXES", 12, bold=True, color="#FFFFFF")
    _text(c, 152, 17, constat.id, 9.5, bold=True, color="#67E8F9")

    _rect(c, 10, 26, 190, 62)
    _text(c, 12, 31, "SCELLÉ ÉLECTRONIQUE", 6.5, bold=True, color=MUTED)
    if signed:
        _text(c, 12, 38.5, "Empreinte SHA-256 du constat (contenu + signatures) :", 7)
        _text(c, 12, 44.5, constat.seal[:32], 9.5, bold=True, font="Courier-Bold")
        _text(c, 12, 49.5, constat.seal[32:], 9.5, bold=True, font="Courier-Bold")
        rows = [
            ("Signature du conducteur A", f"{datetime.fromisoformat(sig_a['signed_at']):%d/%m/%Y %H:%M:%S} UTC · empreinte {sig_a['sha256'][:20]}…"),
            ("Signature du conducteur B", f"{datetime.fromisoformat(sig_b['signed_at']):%d/%m/%Y %H:%M:%S} UTC · empreinte {sig_b['sha256'][:20]}…"),
        ]
        top = 56.5
        for name, value in rows:
            _text(c, 12, top, name, 6.3, color=MUTED)
            _text(c, 55, top, value, 6.8, font="Courier")
            top += 5.2
        _para(
            c, 12, top + 2, 118,
            "Toute modification du contenu du constat ou d'une signature après coup change cette empreinte : le "
            "document n'est alors plus authentique. Pour le vérifier, scannez le QR code ou ouvrez le lien de contrôle.",
            6.6, 3, color="#334155", max_lines=4,
        )
        link = f"{settings.public_app_url.rstrip('/')}/constat/verifier/{constat.id}?seal={constat.seal}"
        code = qr.QrCodeWidget(link)
        x1, y1, x2, y2 = code.getBounds()
        size = 38 * mm
        drawing = Drawing(size, size, transform=[size / (x2 - x1), 0, 0, size / (y2 - y1), 0, 0])
        drawing.add(code)
        renderPDF.draw(drawing, c, 158 * mm, _y(30 + 38))
        _text(c, 160, 72.5, "Scanner pour vérifier", 6, color=MUTED)
        _para(c, 12, top + 14, 140, link, 5.2, 2.2, color="#0369A1", font="Courier", max_lines=3)
    else:
        _text(c, 12, 40, "Ce constat n'est pas encore signé par les deux conducteurs : aucun scellé n'a été généré.", 8, color="#B91C1C")

    _rect(c, 10, 92, 190, 40)
    _text(c, 12, 97, "RÉCIT DU CONDUCTEUR A (TRANSCRIPTION AUTOMATIQUE DU MESSAGE VOCAL)", 6.2, bold=True, color=MUTED)
    _para(c, 12, 103.5, 186, constat.transcript_a or "Aucun récit enregistré.", 8, 3.8, max_lines=7)
    if b.get("observations"):
        _text(c, 12, 121.5, "Observations du conducteur B :", 6.2, bold=True, color=MUTED)
        _para(c, 12, 126, 186, b["observations"], 7.5, 3.5, max_lines=2)

    photos = [f for f in files if f.kind == "photo" and f.content_type.startswith("image/") and Path(f.path).exists()][:6]
    _rect(c, 10, 136, 190, 148)
    _text(c, 12, 141, "ANNEXE PHOTOGRAPHIQUE (FOURNIE PAR LE CONDUCTEUR A)", 6.2, bold=True, color=MUTED)
    if not photos:
        _text(c, 12, 150, "Aucune photo jointe.", 8, color="#94A3B8")
    for i, f in enumerate(photos):
        col, row = i % 3, i // 3
        px, py = 13 + col * 62, 145 + row * 66
        _rect(c, px, py, 58, 44, "#F8FAFC", lw=0.4)
        try:
            c.drawImage(ImageReader(f.path), (px + 0.5) * mm, _y(py + 43.5), 57 * mm, 43 * mm, preserveAspectRatio=True, anchor="c")
        except Exception:  # noqa: BLE001 - an unreadable image must not break the whole document
            _text(c, px + 4, py + 22, "image illisible", 7, color="#94A3B8")
        _text(c, px, py + 48.5, f"Photo {i + 1} — ajoutée le {f.at:%d/%m/%Y %H:%M} UTC", 5.8, color=MUTED)

    _para(
        c, 12, 278, 186,
        "Document généré électroniquement : il reprend uniquement les déclarations des conducteurs. Il ne préjuge pas de la "
        "responsabilité, qui relève de l'appréciation des assureurs.",
        5.4, 2.3, color=MUTED, max_lines=2,
    )
    _footer(c, constat, 2, 2)
    if not signed:
        _watermark(c, "PROJET - NON SIGNÉ")
    c.showPage()
    c.save()
    return buf.getvalue()
