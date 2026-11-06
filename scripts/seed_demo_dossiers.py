"""Seeds a realistic demo: partners, contracts, subscription photos, ~30 claim files spread
over the last 30 days and across every workflow stage, digital constats, and a
federation consortium. Planted fraud patterns (each one is caught by an agent/rule):

- a fraud ring: 3 files sharing a phone number and the same garage (Agent Réseau, R01);
- an accident photo reused across files of the ring (Agent Photo, P01);
- a photo whose EXIF date predates the accident (P02);
- a vehicle whose claim photo does not match its subscription photo colour (P05);
- a claim whose photos show no change vs subscription (P06);
- an overbilled garage quote (Agent Devis, G01);
- an expired contract (C03) and a vehicle that is not the insured one (C04);
- a third party who shows up in two constats (R05) and is flagged by another insurer (R07);
- a "complacent" constat where both drivers share phone and address (K03);
- a few files stuck past their SLA.

Usage:
    python scripts/seed_demo_dossiers.py            # rules-only agents (fast, no API cost)
    python scripts/seed_demo_dossiers.py --use-llm  # let LLM agents run if OPENAI_API_KEY has credit
"""
import argparse
import base64
import io
import random
import shutil
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from PIL import Image, ImageDraw, ImageFilter  # noqa: E402
from sqlalchemy import delete, select  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.constat import service as constat_service  # noqa: E402
from app.constat.schemas import ConstatCreate, ConvertRequest, Party, Signature, Witness  # noqa: E402
from app.db.engine import get_sessionmaker  # noqa: E402
from app.db.models import (  # noqa: E402
    Actor,
    ClaimRecord,
    ConsortiumEntry,
    Constat,
    ConstatFile,
    Contract,
    Document,
    Dossier,
    DossierEvent,
    Message,
    Notification,
    RuleConfig,
    SubscriptionPhoto,
)
from app.dossiers import service  # noqa: E402
from app.dossiers.schemas import DossierCreate, InsuredInfo, VehicleInfo  # noqa: E402
from app.fraud_rules import consortium  # noqa: E402

RNG = random.Random(7)
# Demo accounts (create them with scripts/manage_users.py). The insured demo account owns a few
# files; the expert/garage demo accounts are linked to EXP-01 / GAR-01.
DEMO_ASSURE_EMAIL = "assure.demo@sentinelle.example"
OWN_INSURER = "Votre compagnie"
OTHER_INSURERS = ["Assurances Atlas", "Compagnie Alpha", "Mutuelle Horizon"]

EXPERTS = [
    ("EXP-01", "Cabinet Ben Salah Expertises", "Tunis", ["collision", "theft", "fraude"], 4.7),
    ("EXP-02", "Mourad Trabelsi", "Sfax", ["collision", "fire"], 4.3),
    ("EXP-03", "Expertise Auto Sahel", "Sousse", ["collision", "vandalism"], 4.1),
    ("EXP-04", "Leila Hammami", "Ariana", ["theft", "fraude"], 4.8),
    ("EXP-05", "Nabil Gharbi", "Nabeul", ["fire", "other"], 3.9),
    ("EXP-06", "Cabinet Jlassi", "Tunis", ["collision", "vandalism"], 4.0),
]
GARAGES = [
    ("GAR-01", "Garage El Amen", "Tunis"),
    ("GAR-02", "Auto Service Sfax", "Sfax"),
    ("GAR-03", "Carthage Motors", "Ben Arous"),
    ("GAR-04", "Carrosserie Sahel", "Sousse"),
    ("GAR-05", "Garage Nour", "Ariana"),
    ("GAR-06", "Mécanique Cap Bon", "Nabeul"),
]
AGENCIES = [("AGT-01", "Agence Lac 2", "Tunis"), ("AGT-02", "Agence Sfax Centre", "Sfax")]

FIRST = ["Mohamed", "Amira", "Youssef", "Sana", "Ahmed", "Ines", "Karim", "Rania", "Walid", "Mariem", "Hatem", "Nour", "Bilel", "Salma", "Anis", "Olfa"]
LAST = ["Ben Ali", "Trabelsi", "Mejri", "Ayari", "Chaouch", "Bouazizi", "Jaziri", "Mansour", "Haddad", "Sassi", "Khelifi", "Ferchichi"]
CARS = ["Volkswagen Golf 6", "Peugeot 208", "Renault Clio 4", "Kia Picanto", "Hyundai i20", "Seat Ibiza", "Citroën C3", "Toyota Yaris", "Fiat Tipo", "Suzuki Swift"]
CITY_GARAGE = {"Tunis": "GAR-01", "Sfax": "GAR-02", "Ben Arous": "GAR-03", "Sousse": "GAR-04", "Ariana": "GAR-05", "Nabeul": "GAR-06"}
CITY_GPS = {"Tunis": (36.8065, 10.1815), "Ariana": (36.8665, 10.1647), "Ben Arous": (36.7531, 10.2189), "Sousse": (35.8256, 10.6084), "Sfax": (34.7406, 10.7603), "Nabeul": (36.4561, 10.7376)}
INCIDENTS = ["collision", "collision", "collision", "theft", "vandalism", "fire", "other"]
STORY = {
    "collision": (["Collision à un carrefour", "Accrochage en sortie de rond-point", "Choc à faible vitesse dans un embouteillage", "Collision lors d'un changement de file"],
                  ["pare-choc avant endommagé", "aile droite enfoncée", "phare gauche cassé", "portière arrière rayée"]),
    "theft": (["Vol du véhicule stationné devant le domicile", "Véhicule volé sur le parking du travail", "Vol constaté au réveil"],
              ["plainte déposée au poste de police", "clés toujours en possession de l'assuré", "véhicule retrouvé deux jours plus tard"]),
    "vandalism": (["Rétroviseurs cassés sur un parking public", "Carrosserie rayée pendant la nuit", "Pneus crevés devant le domicile"],
                  ["voisinage sans témoin", "caméra du parking consultée", "plainte en cours"]),
    "fire": (["Départ de feu dans le compartiment moteur", "Incendie du véhicule stationné", "Fumée puis flammes après un trajet autoroutier"],
             ["intervention de la protection civile", "véhicule non roulant", "extincteur utilisé par un passant"]),
    "other": (["Bris de glace suite à une projection de gravillons", "Chute d'une branche sur le toit", "Inondation du parking souterrain"],
              ["pare-brise fissuré", "toit enfoncé", "habitacle endommagé"]),
}
PHOTO_KINDS = [("photo_avant", "FACE AVANT"), ("photo_arriere", "FACE ARRIÈRE"), ("photo_gauche", "CÔTÉ GAUCHE"), ("photo_droite", "CÔTÉ DROIT")]

# (final stage, overdue in that stage?)
PLAN = (
    [("cloture", False)] * 8
    + [("en_reparation", False)] * 4
    + [("en_reparation", True)]
    + [("validation_devis", False)] * 2
    + [("validation_devis", True)]
    + [("expert_missionne", False)] * 3
    + [("expert_missionne", True)] * 2
    + [("analyse_ia", False)] * 2
)


def story(incident: str) -> str:
    openers, details = STORY[incident]
    return f"{RNG.choice(openers)}, {RNG.choice(details)}. {RNG.choice(['Constat amiable signé.', 'Photos prises sur place.', 'Aucun blessé.', 'Assuré joignable le matin.'])}"


def car_photo(label: str, color: tuple[int, int, int], taken_at: datetime | None, seed: int, damage: bool = True) -> bytes:
    """Synthetic vehicle photo. The layout depends only on `seed`, so the subscription photo
    (damage=False) and the claim photo (damage=True) of the same face are aligned."""
    rng = random.Random(seed)
    w, h = 960, 640
    img = Image.new("RGB", (w, h))
    draw = ImageDraw.Draw(img)
    top, bottom = (rng.randint(150, 200),) * 3, (rng.randint(70, 110),) * 3
    for y in range(h):
        t = y / h
        draw.line([(0, y), (w, y)], fill=tuple(int(top[i] * (1 - t) + bottom[i] * t) for i in range(3)))
    for _ in range(14):
        x, y = rng.randint(0, w), rng.randint(0, h)
        r = rng.randint(20, 90)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=tuple(rng.randint(60, 200) for _ in range(3)))
    img = img.filter(ImageFilter.GaussianBlur(14))
    draw = ImageDraw.Draw(img)

    ox, oy = rng.randint(-60, 60), rng.randint(-30, 30)
    draw.rounded_rectangle([150 + ox, 280 + oy, 810 + ox, 470 + oy], radius=60, fill=color)
    draw.rounded_rectangle([280 + ox, 170 + oy, 680 + ox, 300 + oy], radius=50, fill=color)
    draw.rounded_rectangle([310 + ox, 190 + oy, 650 + ox, 290 + oy], radius=30, fill=(170, 200, 220))
    for cx in (290, 670):
        draw.ellipse([cx - 70 + ox, 410 + oy, cx + 70 + ox, 550 + oy], fill=(25, 25, 28))
        draw.ellipse([cx - 32 + ox, 448 + oy, cx + 32 + ox, 512 + oy], fill=(150, 150, 155))
    if damage:
        dmg = random.Random(seed * 31 + 7)
        cx, cy = dmg.randint(300, 660) + ox, dmg.randint(330, 410) + oy
        draw.ellipse([cx - 110, cy - 55, cx + 110, cy + 55], fill=tuple(max(0, c - 90) for c in color))
        for _ in range(dmg.randint(6, 10)):
            x, y = cx + dmg.randint(-90, 90), cy + dmg.randint(-45, 45)
            draw.line([(x, y), (x + dmg.randint(-90, 90), y + dmg.randint(-45, 45))], fill=(30, 30, 30), width=dmg.randint(4, 9))
    draw.rectangle([0, 0, w, 56], fill=(10, 20, 40))
    draw.text((24, 18), f"{label}  ·  photo de démonstration générée", fill=(230, 240, 255))

    exif = Image.Exif()
    if taken_at:
        exif[306] = taken_at.strftime("%Y:%m:%d %H:%M:%S")
    buf = io.BytesIO()
    img.save(buf, "JPEG", quality=88, exif=exif)
    return buf.getvalue()


def signature_png(seed: int) -> str:
    rng = random.Random(seed)
    img = Image.new("RGBA", (420, 160), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    points = [(30 + i * 24, 80 + rng.randint(-45, 45)) for i in range(16)]
    draw.line(points, fill=(20, 30, 80, 255), width=4, joint="curve")
    buf = io.BytesIO()
    img.save(buf, "PNG")
    return "data:image/png;base64," + base64.b64encode(buf.getvalue()).decode()


def person(i: int) -> tuple[InsuredInfo, VehicleInfo]:
    name = f"{FIRST[i % len(FIRST)]} {LAST[(i * 5) % len(LAST)]}"
    insured = InsuredInfo(
        name=name,
        phone=f"+216 {RNG.choice([20, 22, 50, 55, 92, 97, 98])} {RNG.randint(100, 999)} {RNG.randint(100, 999)}",
        email=f"{name.split()[0].lower()}.{i}@exemple.tn",
        cin=f"{RNG.randint(10000000, 19999999)}",
    )
    vehicle = VehicleInfo(plate=f"{RNG.randint(100, 245)} TU {RNG.randint(1000, 9999)}", make_model=RNG.choice(CARS), year=RNG.randint(2010, 2024))
    return insured, vehicle


def reset(db) -> None:
    for model in (Notification, ConstatFile, Constat, Document, Message, DossierEvent, Dossier, Actor, Contract, SubscriptionPhoto, ConsortiumEntry, RuleConfig):
        db.execute(delete(model))
    db.execute(delete(ClaimRecord).where(ClaimRecord.claim_id.like("SIN-%")))
    db.commit()
    shutil.rmtree(service.UPLOAD_DIR, ignore_errors=True)


def seed_actors(db) -> None:
    for id_, name, city, specs, rating in EXPERTS:
        db.add(Actor(id=id_, role="expert", name=name, city=city, specialties=specs, rating=rating, phone=f"+216 71 {RNG.randint(100, 999)} {RNG.randint(100, 999)}", email=f"{id_.lower()}@sentinelle.example"))
    for id_, name, city in GARAGES:
        db.add(Actor(id=id_, role="garage", name=name, city=city, specialties=["carrosserie", "mécanique"], rating=round(RNG.uniform(3.6, 4.8), 1), phone=f"+216 71 {RNG.randint(100, 999)} {RNG.randint(100, 999)}", email=f"{id_.lower()}@sentinelle.example"))
    for id_, name, city in AGENCIES:
        db.add(Actor(id=id_, role="agent", name=name, city=city, specialties=[], rating=4.5))
    db.commit()


def add_contract(db, policy_id, insured: InsuredInfo, vehicle: VehicleInfo, city, start: date, end: date, plate: str | None = None) -> None:
    db.merge(
        Contract(
            policy_id=policy_id,
            plate=plate or vehicle.plate,
            holder_name=insured.name,
            phone=insured.phone,
            cin=insured.cin,
            email=insured.email,
            make_model=vehicle.make_model,
            year=vehicle.year,
            city=city,
            start_date=start,
            end_date=end,
            insurer=OWN_INSURER,
        )
    )


def add_subscription_photos(db, plate: str, color, seed: int, taken: date, faces=PHOTO_KINDS) -> None:
    folder = service.UPLOAD_DIR / "subscriptions" / service.normalize_plate(plate)
    folder.mkdir(parents=True, exist_ok=True)
    for k, (kind, label) in enumerate(faces):
        path = folder / f"{kind}.jpg"
        path.write_bytes(car_photo(label, color, datetime.combine(taken, datetime.min.time()), seed + k, damage=False))
        db.add(SubscriptionPhoto(plate=service.normalize_plate(plate), kind=kind, path=str(path), taken_at=datetime.combine(taken, datetime.min.time())))
    db.commit()


def run_to_stage(db, d: Dossier, target: str, overdue: bool, t: datetime, now: datetime, color, photo_seed: int, quote_factor: float, damage: bool = True):
    """Walks a file through the workflow, spacing events realistically."""

    def step(lo: float, hi: float, stage: str) -> datetime:
        nonlocal t
        if stage == target and overdue:
            return t  # stays in this stage until now (past its SLA)
        t = min(t + timedelta(hours=RNG.uniform(lo, hi)), now - timedelta(minutes=5))
        return t

    claim_date = date.fromisoformat(d.claim_json["claim_date"])
    for k, (kind, label) in enumerate(PHOTO_KINDS):
        taken = datetime.combine(claim_date, datetime.min.time()) + timedelta(hours=RNG.uniform(1, 20))
        photo = car_photo(label, color, taken, photo_seed + k, damage=damage)
        service.add_document(db, d, "assure", kind, f"{kind}.jpg", "image/jpeg", photo, at=t + timedelta(minutes=1))

    if target == "analyse_ia":
        return

    at = step(2, 20, "analyse_ia")
    service.assign_expert(db, d, d.ai_json["dispatch"][0]["expert_id"], "gestionnaire", at=at)
    if target == "expert_missionne":
        return

    at = step(18, 60, "expert_missionne")
    quote = round(d.claim_json["claim_amount"] * quote_factor, -1)
    service.add_document(db, d, "garage", "devis", "devis.pdf", "application/pdf", b"%PDF-1.4 devis de demonstration", amount=quote, at=at)
    if target == "validation_devis":
        return

    at = step(8, 40, "validation_devis")
    service.add_document(db, d, "expert", "rapport_expertise", "rapport_expertise.pdf", "application/pdf", b"%PDF-1.4 rapport", at=at)
    service.advance(db, d, "en_reparation", "expert", "Devis validé après expertise", at=at)
    if target == "en_reparation":
        return

    at = step(60, 190, "en_reparation")
    service.advance(db, d, "cloture", "gestionnaire", "Réparation terminée, règlement effectué au garage", at=at)


def seed_workflow_dossiers(db, now: datetime) -> None:
    plan = PLAN[:]
    RNG.shuffle(plan)
    overbilled = plan.index(("validation_devis", False))
    no_damage = plan.index(("analyse_ia", False))
    expired = plan.index(("expert_missionne", False))
    swapped = [i for i, p in enumerate(plan) if p == ("expert_missionne", False)][1]

    for i, (target, overdue) in enumerate(plan):
        insured, vehicle = person(i)
        if i in (0, 4):
            insured.email = DEMO_ASSURE_EMAIL  # files the insured demo account can open
        city = RNG.choice(list(CITY_GARAGE))
        incident = RNG.choice(INCIDENTS)
        # Files further along the workflow are older.
        age_days = {"cloture": (14, 29), "en_reparation": (5, 8), "validation_devis": (2.5, 4.5), "expert_missionne": (1, 2.5), "analyse_ia": (0, 0.8)}[target]
        if overdue:
            age_days = (age_days[0] + 4, age_days[1] + 6)
        created = now - timedelta(days=RNG.uniform(*age_days))
        claim_date = (created - timedelta(days=RNG.randint(0, 3))).date()
        days_since_start = RNG.randint(200, 3000)
        policy_id = f"POL-{RNG.randint(100000, 999999)}"
        start = claim_date - timedelta(days=days_since_start)
        end = claim_date - timedelta(days=12) if i == expired else start + timedelta(days=365 * (days_since_start // 365 + 1))
        add_contract(db, policy_id, insured, vehicle, city, start, end, plate="117 TU 5023" if i == swapped else None)
        color = tuple(RNG.randint(40, 220) for _ in range(3))
        add_subscription_photos(db, vehicle.plate, color, i * 97, start)

        payload = DossierCreate(
            policy_id=policy_id,
            claim_amount=round(RNG.uniform(1500, 14000), -1),
            claim_date=claim_date,
            incident_type=incident,
            days_since_policy_start=days_since_start,
            prior_claims_count=RNG.choice([0, 0, 0, 1, 1, 2]),
            vehicle_age=RNG.randint(1, 14),
            claim_description=story(incident),
            insured=insured,
            vehicle=vehicle,
            city=city,
            address=f"Avenue {RNG.choice(['Habib Bourguiba', '18 Janvier', 'de la Liberté', 'Mohamed V'])}, {city}",
            garage_id=CITY_GARAGE[city],
            channel=RNG.choice(["mobile", "mobile", "mobile", "agence", "papier"]),
        )
        d = service.create_dossier(db, payload, at=created)
        quote_factor = 1.85 if i == overbilled else RNG.uniform(0.8, 1.1)
        run_to_stage(db, d, target, overdue, created, now, color, photo_seed=i * 97, quote_factor=quote_factor, damage=i != no_damage)
        if i % 3 == 0:
            service.add_message(db, d, "assure", insured.name, "Bonjour, avez-vous reçu mes photos ? Merci.", at=created + timedelta(hours=1))
            service.add_message(db, d, "gestionnaire", "Gestionnaire sinistres", "Bien reçues, votre dossier est en cours d'analyse.", at=created + timedelta(hours=2))


def seed_ring(db, now: datetime) -> None:
    """Same phone + same garage, reused photo, antedated photo, photo of another car."""
    ring_phone = "+216 98 765 432"
    ring_photo = car_photo("FACE AVANT", (180, 30, 30), None, seed=4242)
    ring = []
    for j, (name, days_ago) in enumerate([("Slim Haddad", 9), ("Hela Haddad", 5), ("Fares Ben Amor", 1.5)]):
        created = now - timedelta(days=days_ago)
        insured = InsuredInfo(name=name, phone=ring_phone, email=f"contact{j}@exemple.tn", cin=f"{RNG.randint(10000000, 19999999)}")
        vehicle = VehicleInfo(plate=f"{RNG.randint(100, 245)} TU {RNG.randint(1000, 9999)}", make_model="Volkswagen Golf 6", year=2019)
        claim_date = (created - timedelta(days=1)).date()
        days_since_start = [150, 90, 200][j]
        policy_id = f"POL-{RNG.randint(100000, 999999)}"
        start = claim_date - timedelta(days=days_since_start)
        add_contract(db, policy_id, insured, vehicle, "Ben Arous", start, start + timedelta(days=365))
        # Subscribed with a white car: the red car in the claim photos is another vehicle.
        add_subscription_photos(db, vehicle.plate, (235, 235, 235), 4242, start, faces=PHOTO_KINDS[:1])
        payload = DossierCreate(
            policy_id=policy_id,
            claim_amount=[9000, 12000, 8000][j],
            claim_date=claim_date,
            incident_type=["theft", "fire", "theft"][j],
            days_since_policy_start=days_since_start,
            prior_claims_count=[5, 2, 6][j],
            vehicle_age=3,
            claim_description="Véhicule retrouvé endommagé, pas de témoin.",
            insured=insured,
            vehicle=vehicle,
            city="Ben Arous",
            address="Zone industrielle, Ben Arous",
            garage_id="GAR-03",
            channel="mobile",
        )
        d = service.create_dossier(db, payload, at=created)
        ring.append(d)
        service.add_document(db, d, "assure", "photo_avant", "IMG_2041.jpg", "image/jpeg", ring_photo, at=created + timedelta(minutes=3))
        if j == 2:
            antedated = datetime.combine(claim_date, datetime.min.time()) - timedelta(days=24)
            service.add_document(db, d, "assure", "photo_arriere", "IMG_1877.jpg", "image/jpeg", car_photo("FACE ARRIÈRE", (180, 30, 30), antedated, seed=999_999), at=created + timedelta(minutes=4))
    service.add_message(db, ring[2], "assure", "Fares Ben Amor", "Je voudrais être indemnisé rapidement svp, je dois partir à l'étranger.", at=now - timedelta(hours=20))
    service.assign_expert(db, ring[0], "EXP-04", "gestionnaire", at=ring[0].created_at + timedelta(hours=5))
    service.advance(db, ring[0], "rejete", "gestionnaire", "Réseau de fraude confirmé : téléphone partagé, photos réutilisées", at=now - timedelta(days=3))


def seed_consortium(db) -> None:
    def add(kind, value, company, reason, days_ago):
        db.add(
            ConsortiumEntry(
                kind=kind,
                identifier_hash=consortium.hash_identifier(kind, value),
                company=company,
                reason=reason,
                reported_at=service.utcnow() - timedelta(days=days_ago),
            )
        )

    add("phone", "+216 98 765 432", "Compagnie Alpha", "Réseau de faux vols", 120)
    add("phone", "+216 55 123 456", "Assurances Atlas", "Tiers de complaisance récurrent", 60)
    for n in range(18):
        add(
            RNG.choice(["phone", "plate", "cin"]),
            f"fictif-{n}-{RNG.randint(1000, 9999)}",
            RNG.choice(OTHER_INSURERS),
            RNG.choice(["Fraude documentaire", "Sinistre fictif", "Surfacturation garage", "Faux témoin"]),
            RNG.randint(5, 400),
        )
    db.commit()


def seed_constats(db, now: datetime) -> None:
    def party(name, phone, plate, model, policy=None, cases=(), damage=(), address=None, insurer=OWN_INSURER, cin=None):
        return Party(name=name, phone=phone, cin=cin, plate=plate, make_model=model, policy_id=policy, insurer=insurer, cases=list(cases), damage=list(damage), address=address)

    def contract_for(p: Party, city: str, years: int):
        start = (now - timedelta(days=365 * years)).date()
        add_contract(db, p.policy_id, InsuredInfo(name=p.name, phone=p.phone, cin=p.cin, email=DEMO_ASSURE_EMAIL if p.policy_id == "POL-584120" else None), VehicleInfo(plate=p.plate, make_model=p.make_model, year=2018), city, start, start + timedelta(days=365 * (years + 1)))

    scenarios = [
        {
            "days_ago": 6, "hour": 18, "city": "Tunis", "address": "Avenue Mohamed V, Tunis", "amount": 2800, "garage": "GAR-01",
            "a": party("Mehdi Ben Youssef", "+216 20 456 789", "180 TU 2025", "Peugeot 301", "POL-700100", cin="08123456"),
            "transcript": "J'étais arrêté au feu rouge avenue Mohamed V quand le véhicule derrière moi m'a percuté à l'arrière.",
            "b": party("Nizar Gharbi", "+216 22 334 455", "201 TU 7788", "Renault Symbol", cases=[8], damage=["avant"], insurer="Assurances Atlas"),
            "witnesses": [],
        },
        {
            "days_ago": 4, "hour": 9, "city": "Ariana", "address": "Rond-point de l'Ariana", "amount": 3600, "garage": "GAR-05",
            "a": party("Ines Kaabi", "+216 50 777 120", "198 TU 3344", "Kia Rio", "POL-700200", cin="09456123"),
            "transcript": "Je roulais sur le rond-point quand une voiture s'engageait dans le rond-point sans regarder et a touché ma portière droite.",
            "b": party("Sami Trabelsi", "+216 55 123 456", "176 TU 9012", "Hyundai Accent", cases=[6], damage=["avant"], insurer="Compagnie Alpha", cin="11223344"),
            "witnesses": [],
        },
        {
            "days_ago": 2, "hour": 23, "city": "Ben Arous", "address": "Rue de l'Industrie, Ben Arous", "amount": 7400, "garage": "GAR-03",
            "a": party("Hedi Mansour", "+216 97 222 111", "205 TU 5566", "Seat Leon", "POL-700300", address="12 rue des Oliviers, Ben Arous", cin="07894561"),
            "transcript": "Je sortais d'un parking et une voiture m'a heurté sur le côté gauche de ma voiture.",
            "b": party("Rim Mansour", "+216 97 222 111", "222 TU 1010", "Fiat Punto", cases=[], damage=["arriere"], address="12 rue des Oliviers, Ben Arous", insurer="Mutuelle Horizon"),
            "witnesses": [Witness(name="Sami Trabelsi", phone="+216 55 123 456", cin="11223344")],
        },
    ]

    for k, s in enumerate(scenarios):
        created = now - timedelta(days=s["days_ago"])
        lat, lng = CITY_GPS[s["city"]]
        contract_for(s["a"], s["city"], years=3)
        add_subscription_photos(db, s["a"].plate, (60, 90, 160), 5000 + k * 10, (now - timedelta(days=900)).date())
        c = constat_service.create(
            db,
            ConstatCreate(
                accident_at=created.replace(hour=s["hour"], minute=10),
                lat=lat + RNG.uniform(-0.004, 0.004),
                lng=lng + RNG.uniform(-0.004, 0.004),
                address=s["address"],
                city=s["city"],
                party_a=s["a"],
                transcript_a=s["transcript"],
                witnesses=s["witnesses"],
            ),
            at=created,
            owner_email=DEMO_ASSURE_EMAIL if k == 0 else None,
        )
        for face, label in PHOTO_KINDS[:2]:
            constat_service.add_file(db, c, "a", "photo", f"{face}.jpg", "image/jpeg", car_photo(label, (60, 90, 160), created, 5000 + k * 10, damage=True))
        constat_service.sign_a(db, c, Signature(image=signature_png(k), lat=lat, lng=lng))
        constat_service.submit_b(db, c, s["b"], Signature(image=signature_png(k + 50), lat=lat, lng=lng))
        d = constat_service.convert(db, c, ConvertRequest(claim_amount=s["amount"], garage_id=s["garage"]), at=created + timedelta(hours=1))
        if k == 2:
            service.add_message(db, d, "assure", "Hedi Mansour", "Est-il possible d'être réglé en espèces directement au garage ?", at=created + timedelta(hours=3))

    # One report still waiting for the other driver: handy to demo the QR / link flow.
    pending = party("Sana Mejri", "+216 22 418 903", "212 TU 4471", "Peugeot 208", "POL-584120", cin="09876543")
    contract_for(pending, "Tunis", years=4)
    lat, lng = CITY_GPS["Tunis"]
    constat_service.create(
        db,
        ConstatCreate(
            accident_at=now - timedelta(hours=2),
            lat=lat,
            lng=lng,
            address="Avenue Habib Bourguiba, Tunis",
            city="Tunis",
            party_a=pending,
            transcript_a="Je tournais à droite quand une voiture qui doublait par la droite m'a heurté sur ma portière droite.",
        ),
        at=now - timedelta(hours=1),
        owner_email=DEMO_ASSURE_EMAIL,
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--use-llm", action="store_true")
    args = parser.parse_args()
    if not args.use_llm:
        get_settings().openai_api_key = None
    # Seeded people/addresses are fictitious: never queue real SMS/e-mails while loading them.
    get_settings().notifications_enabled = False

    db = get_sessionmaker()()
    reset(db)
    seed_actors(db)
    seed_consortium(db)
    now = service.utcnow()

    # Contracts for the demo profiles used by the declaration page examples.
    for name, phone, cin, plate, model, policy, days in [
        ("Sana Mejri", "+216 22 418 903", "09876543", "212 TU 4471", "Peugeot 208", "POL-584120", 1460),
        ("Karim Haddad", "+216 98 765 432", "14725836", "231 TU 8890", "Volkswagen Golf 6", "POL-990211", 120),
    ]:
        start = (now - timedelta(days=days)).date()
        email = DEMO_ASSURE_EMAIL if name == "Sana Mejri" else None
        add_contract(db, policy, InsuredInfo(name=name, phone=phone, cin=cin, email=email), VehicleInfo(plate=plate, make_model=model, year=2019), "Tunis", start, start + timedelta(days=365 * (days // 365 + 1)))
    db.commit()

    seed_workflow_dossiers(db, now)
    seed_ring(db, now)
    seed_constats(db, now)

    # Final pass: network/similarity rules depend on the whole portfolio.
    pool = db.execute(select(Dossier)).scalars().all()
    for d in pool:
        service.refresh_copilot(db, d, pool)
    db.commit()

    print(
        f"Seeded {len(pool)} dossiers, {db.query(Constat).count()} constats, {db.query(Contract).count()} contracts, "
        f"{db.query(Actor).count()} partners, {db.query(Document).count()} documents, {db.query(ConsortiumEntry).count()} consortium entries."
    )
    db.close()


if __name__ == "__main__":
    main()
