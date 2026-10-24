# Détection de fraude assurance - Agents LLM orchestrés

Système de détection de fraude sur les sinistres d'assurance auto, combinant un modèle
ML (IsolationForest + XGBoost) et un pipeline multi-agents LLM (LangGraph) pour
investiguer et motiver chaque décision.

## Architecture

```
Sinistre
   |
   v
[Preprocessing Agent] -- validation + feature engineering
   |
   v
[Risk Analyst Agent] -- score de risque (IsolationForest + XGBoost)
   |
   +-- risque faible --------------------+
   |                                     |
   v (risque elevé/ambigu)               v
[Investigator Agent] -- raisonnement   [Decision Agent]
LLM + historique du client  ---------->  verdict final + rapport
```

- **Preprocessing Agent** : valide le sinistre et calcule les features.
- **Risk Analyst Agent** : calcule un score de risque via le modèle ML entraîné.
- **Investigator Agent** (LLM) : analysé en profondeur uniquement les sinistres à
  risque ambigu/élevé (économie d'appels LLM), croise l'historique du client.
- **Decision Agent** (LLM) : rend un verdict final (`fraud` / `not_fraud` /
  `needs_human_review`) avec un rapport lisible.

Chaque agent LLM fonctionne **sans clé API** : en l'absence de `OPENAI_API_KEY`, il
bascule automatiquement sur une logique déterministe à base de règles, et le signale
dans la réponse. L'application démarre et répond toujours, même sans aucune
configuration.

## Installation

```bash
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
```

> Si l'installation de `xgboost`/`numpy` échoue (interpréteur Python trop récent),
> recréez le venv avec Python 3.11 ou 3.12 : `py -3.12 -m venv .venv`.

## Démarrage rapide (sans aucune clé API)

```bash
python scripts/generate_synthetic_data.py
python scripts/build_features.py
python -m app.ml.train
alembic upgrade head            # crée data/local.db (SQLite)
pytest -v
python scripts/run_dev_server.py
```

Puis testez :

```bash
curl http://127.0.0.1:8000/health
```

> Sans `SUPABASE_JWT_SECRET` configuré, les routes `/claims/analyze`, `/claims/{id}/report`,
> `/claims` et `/stats` renvoient **503** (auth non configurée côté serveur) plutôt que de
> planter — voir la section Authentification ci-dessous pour les activer.

## Gestion des dossiers sinistres (multi-acteurs + agents IA)

Au-delà du scoring, l'application gère le cycle de vie complet d'un dossier
(`Déclaré → Analyse IA → Expertise → Validation devis → En réparation → Clôturé`, ou `Rejeté`)
entre assuré, agent, expert, garage et gestionnaire, avec 5 agents supplémentaires :

| Agent | Rôle | Fichier |
|---|---|---|
| Photo Forensics | photo réutilisée dans un autre dossier (dHash), date EXIF antérieure à l'accident, logiciel de retouche | `app/agents/photo_forensics_agent.py` |
| Devis | compare le devis garage aux dossiers similaires (ratio devis / montant déclaré) → surfacturation | `app/agents/quote_agent.py` |
| Dispatch | classe les experts (ville, spécialité, habilitation fraude, charge, note) et explique le score | `app/agents/dispatch_agent.py` |
| Réseau | relie les dossiers partageant téléphone / email / CIN / immatriculation / garage suspect | `app/agents/network_agent.py` |
| Copilote | résumé, prochaine action et SMS assuré (LLM, repli sur règles) | `app/agents/copilot_agent.py` |

À la déclaration, `app/agents/dossier_graph.py` (LangGraph) enchaîne : pipeline antifraude → Réseau → Dispatch.
Les KPIs par étape / acteur (durée vs SLA, retards, tendances 30 jours) sont calculés dans `app/dossiers/kpis.py`.

```bash
alembic upgrade head                     # crée les tables actors / dossiers / events / messages / documents
python scripts/seed_demo_dossiers.py     # 26 dossiers de démo + un réseau de fraude caché
```

Pages : `/dossiers` (Kanban), `/dossiers/{id}` (fiche à onglets + chat + Copilote), `/declarer`
(parcours mobile assuré), `/performance` (KPIs), `/reseau` (cartographie des réseaux).

## e-Constat et moteur de règles antifraude

**e-Constat** (`app/constat/`, page `/constat`, page publique `/constat/b/{token}`) : identification du
véhicule par contrat + immatriculation, géolocalisation, récit vocal transcrit puis converti en cases
officielles par l'**Agent Circonstances**, photos, partage par **QR code** avec le second conducteur
(sans compte), double signature électronique, **scellé SHA-256**, barème de responsabilité
(**Agent Responsabilité**) et contrôles de cohérence (complaisance, zones de choc, signature à distance…).
Un constat signé se transforme en dossier sinistre en un clic.

**Moteur de règles** (`app/fraud_rules/`, page `/regles`) : 45 règles explicables en 7 familles
(contrat, sinistre, photos, devis/garage, réseau, constat, comportement), combinées au score ML en un
**indice de fraude** ; activation/poids paramétrables avec **backtest** avant application.
**Agent Dommages** : comparaison photo de souscription ↔ photo de sinistre (carte d'impact, véhicule différent).
**Base mutualisée** : identifiants pseudonymisés par HMAC-SHA256 partagés entre compagnies.
**API SaaS** : `POST /api/v1/fraud/check` (en-tête `X-API-Key`, variable `FRAUD_API_KEY`).

## Utiliser un vrai dataset Kaggle

1. Créez un token API sur https://www.kaggle.com/settings (Account > API > Create New Token).
2. Placez le fichier téléchargé `kaggle.json` dans `C:\Users\<vous>\.kaggle\kaggle.json`
   (ou renseignez `KAGGLE_USERNAME`/`KAGGLE_KEY` dans `.env`).
3. Téléchargez le dataset :
   ```bash
   python scripts/download_kaggle_dataset.py
   ```
   Dataset par défaut : `buntyshah/auto-insurance-claims-data`. En cas d'indisponibilité,
   essayez `--dataset shivamb/vehicle-claim-fraud-detection`.
4. Reconstruisez les features puis réentraînez :
   ```bash
   python scripts/build_features.py
   python -m app.ml.train
   ```

## Base de données

Par défaut, l'application utilise un fichier **SQLite local** (`data/local.db`,
`DATABASE_URL=sqlite:///./data/local.db`) — aucune configuration nécessaire pour
développer ou lancer les tests. Chaque sinistre analysé (verdict complet) y est
persisté, ce qui alimente `/stats`, `/claims` et `/claims/{id}/report`.

Pour passer sur **Supabase Postgres** en production :

1. Créez un projet sur [supabase.com](https://supabase.com).
2. **Project Settings → Database → Connection string** (URI) → copiez-la dans `.env` :
   ```
   DATABASE_URL=postgresql+psycopg2://postgres:<password>@db.<project>.supabase.co:5432/postgres
   ```
   (préfixe `postgresql+psycopg2://`, pas `postgresql://`, pour le driver SQLAlchemy).
3. Appliquez les migrations sur cette base :
   ```bash
   alembic upgrade head
   ```

## Authentification (Supabase)

Les routes `/claims/analyze`, `/claims/{id}/report`, `/claims` et `/stats` exigent un
token Supabase valide (`Authorization: Bearer <token>`). `/health` reste public.

**Backend** — `.env` :
```
# Dashboard -> Project Settings -> API -> JWT Settings -> JWT Secret
SUPABASE_JWT_SECRET=...
```

**Frontend** — `frontend/.env.local` :
```
# Dashboard -> Project Settings -> API
NEXT_PUBLIC_SUPABASE_URL=https://<project>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

**Créer le premier compte** : il n'y a pas de page d'inscription (hors scope pour l'instant).
Dans le Dashboard Supabase → **Authentication → Users → Add user**, créez un compte
email/mot de passe, puis connectez-vous sur `http://localhost:3000/login`.

## Activer le LLM (OpenAI)

```bash
cp .env.example .env
# puis éditez .env et renseignez OPENAI_API_KEY=sk-...
```

Redémarrez le serveur : `/health` indique alors `openai_configured: true`, et les
rapports générés par `Investigator`/`Decision` sont rédigés par le LLM plutôt que par
les règles de repli.

## Interface web

Une interface Next.js (`frontend/`, shadcn/ui) permet de se connecter (Supabase Auth),
de soumettre un sinistre et de visualiser un dashboard de statistiques (taux de fraude,
distribution des scores de risque). Sans session valide, `/` et `/dashboard` redirigent
vers `/login`.

Pour lancer l'ensemble en local (2 terminaux) :

```bash
# Terminal 1 - backend
python scripts/run_dev_server.py        # http://127.0.0.1:8000

# Terminal 2 - frontend
cd frontend
npm run dev                             # http://localhost:3000
```

Ouvrez `http://localhost:3000` pour le formulaire de soumission, et
`http://localhost:3000/dashboard` pour les statistiques. L'URL de l'API est configurée
dans `frontend/.env.local` (`NEXT_PUBLIC_API_BASE_URL`).

## Déploiement (Render + Vercel)

### Backend sur Render

1. Poussez le dépôt sur GitHub.
2. Sur [render.com](https://render.com) : **New > Web Service**, connectez le repo.
   Render détecte automatiquement `render.yaml` à la racine (build command, start
   command, variables d'environnement déjà définis).
3. Dans l'onglet **Environment**, renseignez `OPENAI_API_KEY`, `DATABASE_URL` (chaîne
   Postgres Supabase) et `SUPABASE_JWT_SECRET` (marquées `sync: false` dans
   `render.yaml`, donc à saisir manuellement dans l'interface Render).
4. Notez l'URL générée (ex. `https://fraud-detection-api.onrender.com`).

> Le `buildCommand` de `render.yaml` génère un dataset synthétique et entraîne le
> modèle au déploiement (car `data/models/` est gitignored). Pour déployer avec le
> vrai dataset Kaggle, entraînez-le en local (`python -m app.ml.train`), retirez
> `data/models/` du `.gitignore`, committez les artefacts, et simplifiez le
> `buildCommand` à `pip install -r requirements.txt`.

### Frontend sur Vercel

1. Sur [vercel.com](https://vercel.com) : **Add New > Project**, importez le même repo.
2. Dans **Root Directory**, sélectionnez `frontend` (Next.js est auto-détecté).
3. Ajoutez les variables d'environnement : `NEXT_PUBLIC_API_BASE_URL` (l'URL Render
   obtenue ci-dessus), `NEXT_PUBLIC_SUPABASE_URL` et `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (Dashboard Supabase → Project Settings → API).
4. Déployez. Vercel vous donne une URL (ex. `https://mon-app.vercel.app`).

### Dernière étape : relier les deux

Sur Render, mettez à jour la variable `CORS_ALLOWED_ORIGINS` avec l'URL Vercel exacte
(ex. `https://mon-app.vercel.app`), puis redéployez le backend. Sans ça, le navigateur
bloquera les appels du frontend vers l'API (erreur CORS).

## Tests

```bash
pytest -v
```

Tous les tests passent sans réseau ni clé API : le LLM est simulé (`FakeChatModel`)
et les données proviennent du jeu synthétique.

## Structure du projet

- `app/config.py`, `app/schemas.py` — configuration et schémas Pydantic partagés.
- `app/llm/client.py` — wrapper OpenAI paresseux (ne lève qu'à l'usage réel).
- `app/ml/` — feature engineering, modèle (`FraudModel`), entraînement (`train.py`).
- `app/agents/` — état LangGraph, graphe (`graph.py`), les 4 agents, outils.
- `app/db/` — persistance SQLAlchemy (`engine.py`, `models.py`, `repository.py`),
  `migrations/` — migrations Alembic.
- `app/auth.py` — vérification des JWT Supabase (`Depends(get_current_user)`).
- `app/api/` — routes FastAPI (`/health`, `/claims/analyze`, `/claims`, `/claims/{id}/report`, `/stats`).
- `scripts/` — téléchargement Kaggle, génération synthétique, build features, serveur dev.
- `tests/` — tests unitaires et d'intégration, 100% mockés/offline (DB SQLite temporaire,
  auth bypassée via `dependency_overrides`).
- `frontend/src/lib/supabase/`, `frontend/src/middleware.ts` — auth Supabase côté client/serveur
  et protection des routes.
- `frontend/src/components/ui/` — primitives shadcn/ui ; `frontend/src/app/components/` —
  composants applicatifs (`ClaimForm`, `VerdictCard`, `StatsSummary`, `NavBar`).
