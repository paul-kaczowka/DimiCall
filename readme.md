## Contexte général

Tu dois créer une application **monorepo** qui combine **Next.js 15** (App Router, React 19) et **FastAPI 0.115**.  
Le front exploite **TanStack** (Table v8, Virtual, Query v5, Form 1.11, Store 0.7), **shadcn/ui** sur **Tailwind CSS v4** (mode sombre par défaut via la classe `dark`) et des micro-interactions **Framer Motion** inspirées d’iOS/macOS (coins 2xl, ombres douces, transitions ≈ 120 ms, fallback `prefers-reduced-motion`).

Le back expose trois routes REST simples :

1. `POST /call` — lance `adb shell am start -a android.intent.action.CALL -d tel:<num>`.  
2. `GET /contacts/export` — streaming CSV par défaut ou Parquet si `?format=parquet`.  
3. `POST /contacts/import` — import CSV/XLSX en streaming.

Une tâche de sauvegarde serveur écrit un fichier Parquet daté toutes les **30 min** à l’aide de la librairie Python **schedule** (processus in-app, pas de Celery, pas d’APScheduler).

Le **Ruban** type Excel flotte au-dessus d’une grille virtuelle de contacts : appeler, ouvrir un pop-up **Cal.com** (iframe), envoyer un e-mail, etc.  
Les données se détectent type-automatiquement (date, durée…), se filtrent, se trient, se virtualisent et s’éditent inline via des widgets (date-picker, select).

L’appli inclut un **autosave temps réel** :

* **Navigateur** : `persistQueryClient` + `idb-keyval` (throttle 1 s) ; toast discret si quota IndexedDB bientôt saturé.  
* **Fichier** : création d’un `contacts-autosave.csv` via la **File System Access API** ; l’utilisateur choisit l’emplacement une seule fois, puis réécriture silencieuse à chaque mutation ou toutes les 60 s.  
* **Serveur** : la tâche `schedule` sauvegarde les contacts en Parquet.

> **Objectif :** appli offline-first, scroll 60 FPS sur > 10 000 lignes, sauvegardes automatiques, code back ultra-lisible.

---

## Architecture détaillée simplifiée

| Couche / Domaine      | Technologie pivot                        | Rôle & exigences 2025                                   |
| --------------------- | ---------------------------------------- | ------------------------------------------------------- |
| **UI**                | Next.js 15 (App Router)                  | Server Actions prio, rendu React 19                     |
| **Tableau**           | TanStack Table v8 + Virtual              | Pinning colonnes/lignes, overscan dynamique             |
| **État & I/O**        | TanStack Query v5 + IndexedDB            | Cache réseau, persistance 1 s throttle                  |
| **Formulaires**       | TanStack Form + Zod                      | Validation partagée front/back                          |
| **Autosave fichier**  | File System Access API                   | Fichier CSV réécrit silencieusement                     |
| **Backend**           | FastAPI 0.115 + Pydantic v2 strict       | 3 routes REST + tâche `schedule` pour backups           |
| **Téléphonie**        | ADB CLI (installé localement)            | Intent CALL                                             |
| **Dev**               | PNPM scripts `dev` & `build`             | *Pas de Docker, CI, tests complexes*                    |

---

## Installations, configurations et bonnes pratiques (sans code)

1. **Monorepo**  
   * Initialise un workspace PNPM avec deux apps : `apps/web` et `apps/api`.  
   * Pas de cache distant Turborepo ; builds locaux suffisent.

2. **Front – dépendances**  
   * Ajoute React Table/Virtual/Query/Persist, idb-keyval, Form, Store, Framer Motion, Papaparse, XLSX, Dexie, lucide-react.  
   * Initialise shadcn/ui ; configure Tailwind v4 avec `darkMode: 'class'` et couleurs OKLCH.

3. **Server Actions**  
   * Utilise-les pour `call`, `import`, `export` quand possible ; fallback route API pour navigateurs non compatibles.

4. **Table virtuelle**  
   * Active le pinning pour « Nom » & « Prénom ».  
   * Calcule l’overscan selon la hauteur conteneur / ligne.  
   * Menu contextuel : copier/coller, suppression, « backup now ».

5. **Autosave IndexedDB**  
   * Persiste le cache Query, throttle 1 s ; clean GC toutes les 24 h.  
   * Toast si quota proche du max.

6. **Autosave fichier**  
   * Première ouverture : `showSaveFilePicker()`, handle stocké (localStorage).  
   * Réécriture intégrale à chaque mutation validée ou toutes les 60 s.  
   * Sur Safari < 17, désactive et offre bouton « Télécharger ».

7. **Backend FastAPI**  
   * Un seul fichier `main.py`.  
   * **Routes** : `/call`, `/contacts/export`, `/contacts/import`.  
   * `BackgroundTasks` pour exporter Parquet async après réponse.  
   * Scheduler :

```python
import schedule, asyncio

def backup():
    # exporter la table de contacts en Parquet daté
    ...

schedule.every(30).minutes.do(backup)

async def run_scheduler():
    while True:
        schedule.run_pending()
        await asyncio.sleep(1)

app.add_event_handler("startup", lambda: asyncio.create_task(run_scheduler()))
Bridge ADB

Appelle ADB directement via subprocess.run([...]), le binaire étant présent sur le PC.

Scripts NPM

dev : concurrently "next dev" "uvicorn apps.api.main:app --reload"

build : next build && tsc -p apps/api (aucun conteneur).

Flux utilisateur cible

L’utilisateur dépose un CSV/XLSX ; parse vers Store + IndexedDB.

Édits inline → mutation Server Action + persistance.

Ruban : appel (ADB), e-mail, Cal.com, rappel.

Backup Parquet serveur auto + export CSV manuel possible.

Crash navigateur → reload depuis IndexedDB + offre de restauration fichier autosave.

En-tête « Instructions à l’IA génératrice »
Crée le workspace PNPM (sans Turborepo distant).

Configure Tailwind v4 (dark par classe, OKLCH).

Génère :

ContactTable (TanStack v8 + Virtual, pinning, autosave diff, widgets).

Ribbon (actions via Server Actions).

ContactFormDialog (TanStack Form + Zod).

Implémente hooks useImport, useExport, useAutosaveFile, useCall, useSendMail.

Pages (contacts)/page.tsx avec Suspense + Query dehydrated.

Route handlers / Server Actions pour appel, export, import.

Élabore main.py FastAPI avec routes + scheduler simple.

Scripts NPM dev & build sans Docker.

Active persistance IndexedDB + backup fichier, gestion d’erreurs UX.

Résultat attendu
Application offline-first, résiliente, récupération immédiate après plantage.

Scroll 60 FPS sur des dizaines de milliers de lignes, hardware modeste.

Sauvegardes locales + serveur automatiques sans configuration complexe.

Back-end compact : un seul fichier, zéro conteneur, ADB natif.