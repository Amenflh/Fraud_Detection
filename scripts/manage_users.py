"""Manage role-bearing Supabase accounts (expert, garage, assuré, agent, gestionnaire).

The role is stored in the user's `app_metadata`, which only the *service role* can write: a user
cannot promote themselves, unlike `user_metadata`. This script therefore needs the service-role key
(Dashboard -> Project Settings -> API Keys -> service_role). Keep it secret: server-side only,
never in the frontend or in git.

    SUPABASE_URL=https://xxxx.supabase.co
    SUPABASE_SERVICE_ROLE_KEY=eyJ...

Usage:
    python scripts/manage_users.py list
    python scripts/manage_users.py create expert@example.com expert --actor-id EXP-01
    python scripts/manage_users.py set-role admin@example.com gestionnaire
    python scripts/manage_users.py create-demo          # one account per role, random passwords

No service key at hand? The same effect from the Supabase SQL editor:
    update auth.users
       set raw_app_meta_data = raw_app_meta_data || '{"role": "expert", "actor_id": "EXP-01"}'
     where email = 'expert@example.com';
"""
import argparse
import os
import secrets
import sys
from pathlib import Path

import httpx
from dotenv import load_dotenv

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

ROLES = ("gestionnaire", "agent", "expert", "garage", "assure")
PARTNER_ROLES = ("expert", "garage")

# Linked to the rows created by scripts/seed_demo_dossiers.py.
DEMO_ACCOUNTS = [
    ("gestionnaire.demo@sentinelle.example", "gestionnaire", None),
    ("assure.demo@sentinelle.example", "assure", None),
    ("expert.demo@sentinelle.example", "expert", "EXP-01"),
    ("garage.demo@sentinelle.example", "garage", "GAR-01"),
]


class AdminClient:
    """Thin wrapper over the GoTrue admin API (`/auth/v1/admin/users`)."""

    def __init__(self, url: str, service_key: str, http: httpx.Client | None = None) -> None:
        self.base = f"{url.rstrip('/')}/auth/v1/admin/users"
        self.http = http or httpx.Client(timeout=20)
        self.headers = {"apikey": service_key, "Authorization": f"Bearer {service_key}", "Content-Type": "application/json"}

    def _check(self, resp: httpx.Response) -> dict:
        if resp.status_code >= 400:
            raise SystemExit(f"Supabase a répondu {resp.status_code} : {resp.text[:300]}")
        return resp.json()

    def list_users(self) -> list[dict]:
        return self._check(self.http.get(self.base, params={"per_page": 200}, headers=self.headers)).get("users", [])

    def find(self, email: str) -> dict | None:
        return next((u for u in self.list_users() if (u.get("email") or "").lower() == email.lower()), None)

    def create(self, email: str, password: str, role: str, actor_id: str | None) -> dict:
        body = {"email": email, "password": password, "email_confirm": True, "app_metadata": app_metadata(role, actor_id)}
        return self._check(self.http.post(self.base, json=body, headers=self.headers))

    def set_role(self, user_id: str, role: str, actor_id: str | None) -> dict:
        body = {"app_metadata": app_metadata(role, actor_id)}
        return self._check(self.http.put(f"{self.base}/{user_id}", json=body, headers=self.headers))


def app_metadata(role: str, actor_id: str | None) -> dict:
    if role not in ROLES:
        raise SystemExit(f"Rôle inconnu : {role} (attendu : {', '.join(ROLES)})")
    if role in PARTNER_ROLES and not actor_id:
        raise SystemExit(f"Le rôle {role} exige --actor-id (ex. EXP-01 / GAR-01)")
    meta = {"role": role}
    if actor_id:
        meta["actor_id"] = actor_id
    return meta


def new_password() -> str:
    return secrets.token_urlsafe(12)


def main() -> None:
    load_dotenv()
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("list")
    create = sub.add_parser("create")
    create.add_argument("email")
    create.add_argument("role", choices=ROLES)
    create.add_argument("--actor-id")
    create.add_argument("--password", help="default: random, printed once")
    set_role = sub.add_parser("set-role")
    set_role.add_argument("email")
    set_role.add_argument("role", choices=ROLES)
    set_role.add_argument("--actor-id")
    sub.add_parser("create-demo")
    args = parser.parse_args()

    url, key = os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not (url and key):
        raise SystemExit("Définissez SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY (voir l'en-tête de ce script).")
    admin = AdminClient(url, key)

    if args.command == "list":
        for u in admin.list_users():
            meta = u.get("app_metadata") or {}
            print(f"{u['email']:<42} rôle={meta.get('role', '— (accès refusé)'):<13} actor={meta.get('actor_id', '')}")
    elif args.command == "create":
        password = args.password or new_password()
        admin.create(args.email, password, args.role, args.actor_id)
        print(f"Créé : {args.email} ({args.role})" + ("" if args.password else f"\nMot de passe (affiché une seule fois) : {password}"))
    elif args.command == "set-role":
        user = admin.find(args.email)
        if user is None:
            raise SystemExit(f"Aucun compte {args.email}")
        admin.set_role(user["id"], args.role, args.actor_id)
        print(f"{args.email} est maintenant {args.role}. Il doit se reconnecter pour que son jeton soit mis à jour.")
    elif args.command == "create-demo":
        print("Comptes de démonstration (mots de passe affichés une seule fois, notez-les) :\n")
        for email, role, actor in DEMO_ACCOUNTS:
            if admin.find(email):
                print(f"  {email:<40} existe déjà")
                continue
            password = new_password()
            admin.create(email, password, role, actor)
            print(f"  {email:<40} {role:<13} mot de passe : {password}")


if __name__ == "__main__":
    main()
