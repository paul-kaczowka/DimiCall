#!/usr/bin/env python3
"""
Script pour nettoyer les modules Node.js, le lockfile et le build Next,
puis réinstaller et démarrer le monorepo en mode développement.
Usage:
  python clean_and_dev.py
"""
import subprocess
import shutil
import sys
from pathlib import Path

def run(cmd, cwd=None):
    print(f">>> Exécution: {' '.join(cmd)}")
    result = subprocess.run(cmd, cwd=cwd, shell=False)
    if result.returncode != 0:
        print(f"Erreur lors de l'exécution de {' '.join(cmd)} (code {result.returncode})")
        sys.exit(result.returncode)


def main():
    root = Path(__file__).parent.resolve()

    # 1) Nettoyage des dossiers et fichiers
    targets = [
        root / 'node_modules',
        root / 'pnpm-lock.yaml',
        root / 'apps' / 'web' / '.next'
    ]
    for path in targets:
        if path.exists():
            if path.is_dir():
                print(f"Suppression du dossier: {path}")
                shutil.rmtree(path)
            else:
                print(f"Suppression du fichier: {path}")
                path.unlink()
        else:
            print(f"Non trouvé (skip): {path}")

    # 2) Nettoyage du cache pnpm
    run(['pnpm', 'store', 'prune'], cwd=root)

    # 3) Réinstallation des dépendances (force)
    run(['pnpm', 'install', '--force'], cwd=root)

    # 4) Lancement du serveur en mode développement
    run(['pnpm', 'dev'], cwd=root)

if __name__ == '__main__':
    main()
