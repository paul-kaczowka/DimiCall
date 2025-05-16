#!/usr/bin/env python3
# -*- coding: utf-8 -*-

import os
import sys
import subprocess
import platform
import shutil
import time
from pathlib import Path

class Colors:
    """Couleurs pour l'affichage console."""
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    BOLD = '\033[1m'
    RESET = '\033[0m'

def print_status(message, status_type="info"):
    """Affiche un message avec formatage selon le type."""
    prefix = {
        "info": f"[{Colors.BOLD}INFO{Colors.RESET}] ",
        "success": f"[{Colors.BOLD}{Colors.GREEN}SUCCÈS{Colors.RESET}] ",
        "warning": f"[{Colors.BOLD}{Colors.YELLOW}ATTENTION{Colors.RESET}] ",
        "error": f"[{Colors.BOLD}{Colors.RED}ERREUR{Colors.RESET}] ",
    }
    print(f"{prefix.get(status_type, prefix['info'])}{message}")

def is_windows():
    """Vérifie si le système d'exploitation est Windows."""
    return platform.system().lower() == "windows"

def run_command(command, shell=False, check=True):
    """Exécute une commande et retourne le résultat."""
    try:
        result = subprocess.run(
            command, 
            shell=shell, 
            check=check, 
            stdout=subprocess.PIPE, 
            stderr=subprocess.PIPE,
            text=True
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.CalledProcessError as e:
        return e.returncode, e.stdout, e.stderr
    except FileNotFoundError:
        return 127, "", f"Commande non trouvée: {command[0] if not shell else command}"

def check_python():
    """Vérifie si Python est installé et obtient sa version."""
    print_status("Vérification de l'installation de Python...")
    
    if is_windows():
        command = ["python", "--version"]
    else:
        command = ["python3", "--version"]
        
    return_code, stdout, stderr = run_command(command, check=False)
    
    if return_code == 0:
        version = stdout.strip()
        print_status(f"Python détecté: {version}", "success")
        return True, version.split()[-1]
    else:
        print_status("Python n'est pas installé ou n'est pas dans le PATH.", "error")
        return False, None

def check_node():
    """Vérifie si Node.js est installé et obtient sa version."""
    print_status("Vérification de l'installation de Node.js...")
    
    return_code, stdout, stderr = run_command(["node", "--version"], check=False)
    
    if return_code == 0:
        version = stdout.strip()
        print_status(f"Node.js détecté: {version}", "success")
        return True, version
    else:
        print_status("Node.js n'est pas installé ou n'est pas dans le PATH.", "error")
        return False, None

def check_pnpm():
    """Vérifie si pnpm est installé et obtient sa version."""
    print_status("Vérification de l'installation de pnpm...")
    
    # Méthode 1: Commande pnpm directe
    return_code, stdout, stderr = run_command(["pnpm", "--version"], check=False)
    
    if return_code == 0:
        version = stdout.strip()
        print_status(f"pnpm détecté (méthode directe): {version}", "success")
        return True, version

    # Méthode 2: Vérifier via npm list -g (si Windows, car pnpm peut être installé via npm)
    if is_windows():
        print_status("pnpm non trouvé directement, vérification via npm list -g...", "info")
        npm_cmd = ["npm", "list", "-g", "--depth=0"]
        return_code_npm, stdout_npm, stderr_npm = run_command(npm_cmd, check=False)

        if return_code_npm == 0:
            if "pnpm@" in stdout_npm:
                # Essayer d'extraire la version de la sortie de npm list -g
                try:
                    version_line = [line for line in stdout_npm.splitlines() if "pnpm@" in line][0]
                    version = version_line.split("pnpm@")[1].strip()
                    print_status(f"pnpm détecté (via npm list -g): {version}", "success")
                    return True, version
                except IndexError:
                    # Si pnpm@ est là mais on ne peut pas parser, c'est étrange mais on le considère comme présent
                    print_status("pnpm détecté (via npm list -g, version non parsable mais présent)", "success")
                    return True, "Version inconnue (npm list)"

    # Méthode 3: Vérifier le chemin PNPM_HOME (souvent utilisé par le script d'installation de pnpm)
    pnpm_home = os.environ.get("PNPM_HOME")
    if pnpm_home and os.path.exists(os.path.join(pnpm_home, "pnpm.CMD" if is_windows() else "pnpm")):
        print_status(f"pnpm détecté via PNPM_HOME: {pnpm_home}", "info")
        # Essayer d'exécuter la commande version depuis ce chemin
        pnpm_executable = os.path.join(pnpm_home, "pnpm.CMD" if is_windows() else "pnpm")
        return_code_home, stdout_home, stderr_home = run_command([pnpm_executable, "--version"], check=False)
        if return_code_home == 0:
            version = stdout_home.strip()
            print_status(f"pnpm détecté (via PNPM_HOME executable): {version}", "success")
            return True, version
        else:
            print_status(f"pnpm trouvé dans PNPM_HOME mais impossible d'exécuter --version: {stderr_home}", "warning")
            # On le considère comme présent mais version inconnue si l'exécutable est là
            return True, "Version inconnue (PNPM_HOME)"
            
    print_status("pnpm n'est pas installé ou n'est pas dans le PATH / PNPM_HOME.", "error")
    return False, None

def check_adb():
    """Vérifie si ADB est installé et obtient sa version."""
    print_status("Vérification de l'installation d'ADB...")
    
    return_code, stdout, stderr = run_command(["adb", "version"], check=False)
    
    if return_code == 0:
        version = stdout.strip().split("\n")[0]
        print_status(f"ADB détecté: {version}", "success")
        return True, version
    else:
        print_status("ADB n'est pas installé ou n'est pas dans le PATH.", "warning")
        return False, None

def setup_python_venv(api_dir):
    """Configure l'environnement virtuel Python si nécessaire."""
    print_status("Configuration de l'environnement virtuel Python...")
    venv_dir = os.path.join(api_dir, ".venv")
    
    # Vérifier si l'environnement virtuel existe déjà
    if os.path.exists(venv_dir):
        print_status("Environnement virtuel Python déjà existant.", "success")
    else:
        print_status("Création d'un nouvel environnement virtuel Python...")
        
        if is_windows():
            command = [sys.executable, "-m", "venv", venv_dir]
        else:
            command = ["python3", "-m", "venv", venv_dir]
        
        return_code, stdout, stderr = run_command(command, check=False)
        
        if return_code != 0:
            print_status(f"Échec de la création de l'environnement virtuel Python: {stderr}", "error")
            return False
        
        print_status("Environnement virtuel Python créé avec succès.", "success")
    
    # Installer les dépendances Python
    print_status("Installation des dépendances Python...")
    
    pip_cmd = os.path.join(venv_dir, "Scripts" if is_windows() else "bin", "pip")
    requirements_file = os.path.join(api_dir, "requirements.txt")
    
    if not os.path.exists(requirements_file):
        print_status(f"Fichier requirements.txt introuvable à {requirements_file}", "error")
        return False
    
    return_code, stdout, stderr = run_command([pip_cmd, "install", "-r", requirements_file], check=False)
    
    if return_code != 0:
        print_status(f"Échec de l'installation des dépendances Python: {stderr}", "error")
        return False
    
    print_status("Dépendances Python installées avec succès.", "success")
    return True

def install_pnpm_if_needed():
    """Installe pnpm si nécessaire."""
    node_ok, _ = check_node()
    if not node_ok:
        print_status("Node.js est requis pour installer pnpm. Veuillez installer Node.js d'abord.", "error")
        return False
    
    print_status("Tentative d'installation de pnpm via npm (méthode recommandée)...", "info")
    
    # Méthode d'installation privilégiée: npm install -g pnpm
    # Cela fonctionne généralement mieux et est plus standard.
    install_cmd = ["npm", "install", "-g", "pnpm"]
    return_code, stdout, stderr = run_command(install_cmd, check=False)
    
    if return_code != 0:
        print_status(f"Échec de l'installation de pnpm via npm: {stderr}", "error")
        print_status("Si l'erreur persiste, veuillez installer pnpm manuellement: https://pnpm.io/installation", "info")
        return False
    
    print_status("pnpm installé avec succès via npm. Veuillez redémarrer ce script.", "success")
    # Après l'installation, il faut souvent un nouveau shell pour que le PATH soit mis à jour.
    return True # On retourne True mais le script principal devrait indiquer de redémarrer.

def install_node_dependencies(project_root):
    """Installe les dépendances Node.js."""
    print_status("Installation des dépendances Node.js...")
    
    # On doit être dans le répertoire racine du projet pour que pnpm fonctionne correctement
    current_dir = os.getcwd()
    os.chdir(project_root)
    
    return_code, stdout, stderr = run_command(["pnpm", "install"], check=False)
    
    # Revenir au répertoire d'origine
    os.chdir(current_dir)
    
    if return_code != 0:
        print_status(f"Échec de l'installation des dépendances Node.js: {stderr}", "error")
        return False
    
    print_status("Dépendances Node.js installées avec succès.", "success")
    return True

def start_application(project_root):
    """Démarre l'application (API et frontend)."""
    print_status("Démarrage de l'application...", "info")
    
    # On doit être dans le répertoire racine du projet
    current_dir = os.getcwd()
    os.chdir(project_root)
    
    if is_windows():
        command = ["start", "cmd", "/k", "pnpm", "dev"]
        subprocess.Popen(command, shell=True)
    else:
        command = ["pnpm", "dev"]
        subprocess.Popen(command)
    
    # Revenir au répertoire d'origine
    os.chdir(current_dir)
    
    print_status("Application démarrée ! L'interface web sera accessible à http://localhost:3000", "success")
    print_status("L'API sera accessible à http://localhost:8000", "success")
    return True

def welcome_message():
    """Affiche un message de bienvenue."""
    print("\n" + "="*80)
    print(f"{Colors.BOLD}Bienvenue dans le lanceur de l'application DIMI{Colors.RESET}")
    print("Ce script va vérifier les dépendances et lancer l'application.")
    print("="*80 + "\n")

def ensure_browser_opens(url="http://localhost:3000"):
    """Ouvre le navigateur par défaut à l'URL spécifiée après un court délai."""
    print_status(f"Ouverture du navigateur à {url} dans 5 secondes...", "info")
    time.sleep(5)  # Attendre que le serveur démarre
    
    if is_windows():
        os.system(f'start {url}')
    elif platform.system() == 'Darwin':  # macOS
        os.system(f'open {url}')
    else:  # Linux
        os.system(f'xdg-open {url} || sensible-browser {url} || x-www-browser {url} || gnome-open {url}')

def main():
    """Fonction principale."""
    welcome_message()
    
    # Déterminer le chemin du projet
    script_dir = os.path.dirname(os.path.abspath(__file__))
    project_root = script_dir  # Supposons que le script est exécuté depuis la racine du projet
    
    # Vérifier les chemins des sous-dossiers
    api_dir = os.path.join(project_root, "apps", "api")
    web_dir = os.path.join(project_root, "apps", "web")
    
    if not os.path.exists(api_dir) or not os.path.exists(web_dir):
        print_status("Structure de projet incorrecte. Vérifiez que vous exécutez ce script depuis le répertoire racine du projet.", "error")
        return False
    
    # Vérifier les dépendances
    python_ok, _ = check_python()
    node_ok, _ = check_node()
    pnpm_ok, _ = check_pnpm()
    adb_ok, _ = check_adb()  # ADB est optionnel
    
    # Vérifier et installer les dépendances manquantes
    if not python_ok:
        print_status("Python est requis et n'est pas installé. Veuillez l'installer: https://www.python.org/downloads/", "error")
        return False
    
    if not node_ok:
        print_status("Node.js est requis et n'est pas installé. Veuillez l'installer: https://nodejs.org/", "error")
        return False
    
    if not pnpm_ok:
        print_status("pnpm n'est pas détecté. Tentative d'installation...", "warning")
        if not install_pnpm_if_needed():
            return False # Arrêter si l'installation échoue
        # Important: Demander à l'utilisateur de redémarrer le script
        # car l'installation globale de pnpm via npm peut nécessiter une mise à jour du PATH
        # qui n'est pas toujours effective immédiatement dans le script courant.
        print_status("pnpm a été installé. Veuillez relancer ce script (start.bat) pour continuer.", "info")
        # On quitte ici pour que l'utilisateur relance.
        # On pourrait aussi essayer de trouver le pnpm fraîchement installé et continuer, mais c'est plus complexe.
        sys.exit(0) # Quitter proprement, l'utilisateur doit relancer.
    
    if not adb_ok:
        print_status("ADB n'est pas installé. Certaines fonctionnalités liées aux téléphones Android pourraient ne pas fonctionner.", "warning")
        print_status("Pour installer ADB: https://developer.android.com/studio/releases/platform-tools", "info")
    
    # Configurer l'environnement Python
    if not setup_python_venv(api_dir):
        return False
    
    # Installer les dépendances Node.js
    if not install_node_dependencies(project_root):
        return False
    
    # Démarrer l'application
    if not start_application(project_root):
        return False
    
    # Ouvrir le navigateur
    ensure_browser_opens()
    
    return True

if __name__ == "__main__":
    try:
        success = main()
        if not success:
            print_status("Le démarrage de l'application a échoué. Veuillez résoudre les problèmes ci-dessus et réessayer.", "error")
            sys.exit(1)
    except KeyboardInterrupt:
        print_status("\nOpération annulée par l'utilisateur.", "warning")
        sys.exit(1)
    except Exception as e:
        print_status(f"Une erreur inattendue s'est produite: {str(e)}", "error")
        sys.exit(1) 