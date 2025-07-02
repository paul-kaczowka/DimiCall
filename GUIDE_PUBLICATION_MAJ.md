# Guide Complet pour la Publication de Mises à Jour de DimiCall

Ce document détaille la procédure complète pour publier une nouvelle version de l'application DimiCall, en s'assurant que le système de mise à jour automatique fonctionne de manière fluide, sécurisée et transparente pour l'utilisateur final.

---

## Sommaire
1. [Prérequis](#1-prérequis)
2. [Processus de Publication Étape par Étape](#2-processus-de-publication-étape-par-étape)
    - [Étape A : Finaliser le Développement](#étape-a--finaliser-le-développement)
    - [Étape B : Incrémenter la Version de l'Application](#étape-b--incrémenter-la-version-de-lapplication)
    - [Étape C : Lancer la Publication](#étape-c--lancer-la-publication)
    - [Étape D : Finaliser la Release sur GitHub](#étape-d--finaliser-la-release-sur-github)
3. [Le Cycle de Test (Recommandé)](#3-le-cycle-de-test-recommandé)
4. [Dépannage des Erreurs Courantes](#4-dépannage-des-erreurs-courantes)

---

## 1. Prérequis

Avant de pouvoir publier une mise à jour, assurez-vous que les points suivants sont toujours valides. Ils ont été configurés lors de la mise en place initiale et ne devraient pas changer.

- **Token d'accès GitHub (`GH_TOKEN`)** : Une variable d'environnement nommée `GH_TOKEN` doit être configurée sur la machine qui effectue la publication. Ce token doit avoir les permissions `repo` pour pouvoir créer des releases sur votre dépôt privé.

- **Configuration dans `package.json`** : Le fichier doit contenir la configuration correcte pour `electron-builder`.
  - **Dépôt** : La section `build.publish` doit pointer vers le bon propriétaire (`owner`) et nom de dépôt (`repo`), et spécifier que le dépôt est privé (`"private": true`).
  - **Installeur Silencieux (NSIS)** : La section `build.nsis` doit être configurée pour une installation en un clic et non-interactive, ce qui est crucial pour des mises à jour transparentes.

```json
// package.json (extraits)
"build": {
  "publish": {
    "provider": "github",
    "owner": "paul-kaczowka",
    "repo": "DimiCall",
    "private": true
  },
  // ... autres configurations ...
  "nsis": {
    "oneClick": true,
    "perMachine": false,
    "allowToChangeInstallationDirectory": false,
    "createDesktopShortcut": true,
    "createStartMenuShortcut": true
  }
}
```

---

## 2. Processus de Publication Étape par Étape

### Étape A : Finaliser le Développement

1.  **Commitez vos changements** : Assurez-vous que toutes les modifications, nouvelles fonctionnalités et corrections de bugs sont commitées dans votre branche principale (ex: `main` ou `master`).

### Étape B : Incrémenter la Version de l'Application

C'est l'étape la plus **critique**. `electron-updater` ne détectera une mise à jour que si le numéro de version est supérieur à la version actuellement installée.

1.  **Ouvrez le fichier `package.json`**.
2.  **Trouvez la ligne `"version"`**.
3.  **Incrémentez le numéro** en suivant le versionnage sémantique (SemVer) :
    - **PATCH** (ex: `3.0.5` -> `3.0.6`) : Pour des corrections de bugs rétrocompatibles. C'est le cas le plus courant.
    - **MINOR** (ex: `3.0.6` -> `3.1.0`) : Pour de nouvelles fonctionnalités rétrocompatibles.
    - **MAJOR** (ex: `3.1.0` -> `4.0.0`) : Pour des changements qui cassent la rétrocompatibilité (très rare).

**Exemple pour une nouvelle version patch :**

```json
// package.json
{
  // ...
  "version": "3.0.6", // Anciennement "3.0.5"
  // ...
}
```

### Étape C : Lancer la Publication

Une fois la version mise à jour et le code sauvegardé, une seule commande suffit.

1.  **Ouvrez un terminal** à la racine de votre projet.
2.  **Exécutez la commande de publication** :

```bash
npm run publish
```

**Que fait cette commande ?**
- Elle compile le code de votre application (`npm run build`).
- Elle utilise `electron-builder` pour "packager" votre application dans un installeur NSIS pour Windows.
- Grâce à la configuration, cet installeur est de type "one-click" (silencieux).
- Elle se connecte à GitHub avec votre `GH_TOKEN`.
- Elle crée une nouvelle **"Draft Release"** (brouillon) sur la page des releases de votre dépôt.
- Elle téléverse les fichiers nécessaires à cette release :
  - L'installeur (ex: `DimiCall Setup 3.0.6.exe`).
  - Le fichier de "blockmap" (pour les mises à jour différentielles).
  - Le fichier `latest.yml` (qui indique à `electron-updater` quelle est la dernière version).

### Étape D : Finaliser la Release sur GitHub

Par sécurité, le processus crée un brouillon. Vous devez le publier manuellement.

1.  **Rendez-vous sur votre dépôt GitHub** dans un navigateur.
2.  Allez dans la section **"Releases"**.
3.  Vous devriez voir une nouvelle release avec le tag de votre nouvelle version (ex: `v3.0.6`) et le statut **"Draft"**.
4.  Cliquez sur **"Edit"** (l'icône crayon) à côté de la release.
5.  **Rédigez les notes de version** : C'est une étape cruciale pour l'utilisateur ! C'est ce texte qui apparaîtra dans la boîte de dialogue de mise à jour. Soyez clair et concis.
    - Utilisez des listes à puces pour les nouveautés et les corrections.
    - Exemple :
      ```markdown
      ### Nouveautés ✨
      - Ajout de la synchronisation des contacts avec Google.

      ### Corrections de bugs 🐛
      - Correction d'un bug qui provoquait un crash lors de l'import de fichiers volumineux.
      - Amélioration des performances de l'affichage de la liste de contacts.
      ```
6.  Assurez-vous que la case "This is a pre-release" n'est PAS cochée (sauf si c'est une version bêta).
7.  Cliquez sur le bouton **"Publish release"**.

Et voilà ! La mise à jour est en ligne. Toute application avec une version antérieure détectera automatiquement la nouvelle version au prochain démarrage.

---

## 3. Le Cycle de Test (Recommandé)

Pour être 100% sûr avant de publier, suivez le cycle de test que nous avons mis en place :
1.  **Publiez votre nouvelle version** (ex: `3.0.6`) en suivant les étapes ci-dessus.
2.  **Récupérez un ancien installeur** (ex: `DimiCall Setup 3.0.5.exe`) que vous auriez gardé de côté.
3.  **Désinstallez** complètement la version actuelle de DimiCall sur votre machine de test.
4.  **Installez l'ancienne version** avec l'installeur.
5.  **Lancez l'application**. Elle devrait détecter la mise à jour `3.0.6`.
6.  **Acceptez la mise à jour** quand la boîte de dialogue apparaît.
7.  Vérifiez que l'application redémarre de manière **transparente et silencieuse** et qu'elle est bien passée à la nouvelle version.

---

## 4. Dépannage des Erreurs Courantes

- **`HttpError: 401 Unauthorized`**
  - **Cause** : Votre `GH_TOKEN` est soit manquant, soit incorrect, soit il n'a pas les bonnes permissions (`repo`).
  - **Solution** : Vérifiez votre variable d'environnement et les permissions du token sur GitHub.

- **`existing type not compatible with publishing type`** ou erreur 422
  - **Cause** : Une release (ou juste un tag Git) avec le même numéro de version existe déjà sur GitHub.
  - **Solution** : Allez sur la page "Releases" de GitHub, supprimez la release conflictuelle, et relancez la commande `npm run publish`.

- **La mise à jour n'est pas silencieuse (l'installeur s'affiche)**
  - **Cause** : La version que vous avez publiée ne contient pas la configuration `nsis` pour `oneClick: true` dans son `package.json`.
  - **Solution** : Assurez-vous que la configuration est correcte, puis republiez la version (n'oubliez pas d'incrémenter à nouveau ou de supprimer la release précédente).

- **La mise à jour n'est pas détectée**
  - **Cause 1** : Vous avez oublié d'incrémenter le numéro de version dans `package.json` avant de publier.
  - **Cause 2** : La release sur GitHub est toujours en état de "Draft".
  - **Solution** : Vérifiez ces deux points. Si la version est la même, il faut l'incrémenter et refaire tout le processus. Si elle est en "Draft", publiez-la simplement.

- **`Error: Cannot find module '...'` après mise à jour**
  - **Cause** : Il peut y avoir un problème avec le cache de l'application.
  - **Solution** : Pour un utilisateur, une désinstallation/réinstallation propre résout souvent ce problème. Pour le développement, c'est rare si le processus de build se déroule correctement. 