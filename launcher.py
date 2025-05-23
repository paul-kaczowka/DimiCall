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

def run_command(command, shell=False, check=True, cwd=None, env=None):
    """Exécute une commande et retourne le résultat."""
    effective_env = os.environ.copy()
    if env:
        effective_env.update(env)

    try:
        result = subprocess.run(
            command,
            shell=shell,
            check=check, # Si True, lève une exception pour les codes de retour non nuls
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            cwd=cwd,
            env=effective_env
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.CalledProcessError as e:
        stdout_val = e.stdout if e.stdout is not None else ""
        stderr_val = e.stderr if e.stderr is not None else ""
        # Afficher stdout/stderr en cas d'erreur si check=True était utilisé
        # Si check=False était utilisé, cette exception n'est pas levée par défaut.
        print_status(f"Commande '{str(command)}' échouée avec code {e.returncode}", "error")
        if stdout_val: print_status(f"STDOUT:\n{stdout_val.strip()}", "info")
        if stderr_val: print_status(f"STDERR:\n{stderr_val.strip()}", "error")
        return e.returncode, stdout_val, stderr_val
    except FileNotFoundError:
        cmd_name_for_error = command[0] if isinstance(command, list) and command else str(command)
        print_status(f"Commande non trouvée: {cmd_name_for_error}", "error")
        return 127, "", f"Commande non trouvée: {cmd_name_for_error}"
    except Exception as e:
        print_status(f"Erreur inattendue lors de l'exécution de la commande '{str(command)}': {str(e)}", "error")
        return -1, "", f"Erreur inattendue: {str(e)}"


def check_python_architecture():
    """Vérifie et affiche l'architecture de Python."""
    print_status("Vérification de l'architecture Python...")
    py_arch = platform.machine()
    print_status(f"Architecture machine détectée par Python: {py_arch}", "info")
    if "ARM64" not in py_arch.upper() and "AARCH64" not in py_arch.upper(): # Simple check
        print_status("Python ne semble pas être une version ARM64 native.", "warning")
    else:
        print_status("Python semble être une version ARM64 native.", "success")
    return py_arch

def check_node_architecture():
    """Vérifie et affiche l'architecture de Node.js."""
    print_status("Vérification de l'architecture Node.js...")
    return_code, stdout, stderr = run_command(["node", "-p", "process.arch"], check=False)
    if return_code == 0:
        node_arch = stdout.strip()
        print_status(f"Architecture détectée par Node.js: {node_arch}", "info")
        if "arm64" not in node_arch.lower():
            print_status("Node.js ne semble pas être une version ARM64 native.", "warning")
        else:
            print_status("Node.js semble être une version ARM64 native.", "success")
        return node_arch
    else:
        print_status("Impossible de déterminer l'architecture de Node.js.", "error")
        return None

# --- Fonctions existantes (check_python, check_node, check_pnpm, etc.) ---
# ... (gardez vos fonctions existantes ici, je ne les répète pas pour la concision)
# Assurez-vous que check_node retourne bien npm_executable_path
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
        check_python_architecture() # Appel à la nouvelle fonction
        return True, version.split()[-1]
    else:
        print_status(f"Python n'est pas installé ou n'est pas dans le PATH. Erreur: {stderr}", "error")
        return False, None

def check_node():
    """Vérifie si Node.js est installé et obtient sa version et le chemin de npm."""
    print_status("Vérification de l'installation de Node.js...")
    node_executable_path = shutil.which("node")
    npm_executable_path = None

    if node_executable_path:
        return_code, stdout, stderr = run_command([node_executable_path, "--version"], check=False)
        if return_code == 0:
            version = stdout.strip()
            print_status(f"Node.js détecté: {version} (Chemin: {node_executable_path})", "success")
            check_node_architecture() # Appel à la nouvelle fonction
            
            node_dir = Path(node_executable_path).parent
            npm_exe_name = "npm.cmd" if is_windows() else "npm"
            potential_npm_path = node_dir / npm_exe_name

            if potential_npm_path.exists() and potential_npm_path.is_file():
                npm_executable_path = str(potential_npm_path)
                print_status(f"{npm_exe_name} localisé à côté de node: {npm_executable_path}", "info")
            else:
                npm_exe_fallback = shutil.which(npm_exe_name)
                if npm_exe_fallback:
                    npm_executable_path = npm_exe_fallback
                    print_status(f"{npm_exe_name} localisé via PATH (fallback): {npm_executable_path}", "info")
                else:
                    print_status(f"{npm_exe_name} non trouvé à côté de node ou dans le PATH.", "warning")
            
            if npm_executable_path:
                 print_status(f"Chemin final pour npm: {npm_executable_path}", "info")
            return True, version, npm_executable_path
        else:
            print_status(f"Node.js trouvé à {node_executable_path} mais --version a échoué: {stderr.strip()}", "error")
            return False, None, None
    else:
        print_status("Node.js n'est pas installé ou n'est pas dans le PATH.", "error")
        return False, None, None

def check_pnpm(npm_exe_path):
    """Vérifie si pnpm est installé et obtient sa version."""
    print_status("Vérification de l'installation de pnpm...")
    pnpm_exe_name = "pnpm.cmd" if is_windows() else "pnpm"
    
    # Méthode 1: Commande pnpm directe (shutil.which pour trouver le chemin complet)
    pnpm_direct_path = shutil.which(pnpm_exe_name)
    if pnpm_direct_path:
        return_code, stdout, stderr = run_command([pnpm_direct_path, "--version"], check=False)
        if return_code == 0:
            version = stdout.strip()
            print_status(f"pnpm détecté (méthode directe: {pnpm_direct_path}): {version}", "success")
            return True, version

    # Méthode 2: Vérifier via PNPM_HOME
    pnpm_home = os.environ.get("PNPM_HOME")
    if pnpm_home:
        pnpm_home_executable = Path(pnpm_home) / pnpm_exe_name
        if pnpm_home_executable.exists() and pnpm_home_executable.is_file():
            print_status(f"pnpm détecté via PNPM_HOME: {pnpm_home_executable}", "info")
            return_code_home, stdout_home, stderr_home = run_command([str(pnpm_home_executable), "--version"], check=False)
            if return_code_home == 0:
                version = stdout_home.strip()
                print_status(f"pnpm (via PNPM_HOME executable): {version}", "success")
                return True, version
            else:
                print_status(f"pnpm trouvé dans PNPM_HOME mais --version a échoué: {stderr_home.strip()}", "warning")
                return True, "Version inconnue (PNPM_HOME)" # Considéré comme présent

    # Méthode 3: Vérifier via npm list -g (en dernier recours, peut être lent)
    if npm_exe_path and Path(npm_exe_path).is_file():
        print_status("pnpm non trouvé directement ou via PNPM_HOME, vérification via npm list -g...", "info")
        npm_cmd_list = [npm_exe_path, "list", "-g", "--depth=0", "--json"] # Utiliser --json pour un parsing plus fiable
        
        # Utiliser shell=True pour .cmd sous Windows si npm_exe_path est une chaîne de commande
        cmd_to_run_npm_list = subprocess.list2cmdline(npm_cmd_list) if is_windows() and isinstance(npm_exe_path, str) and npm_exe_path.lower().endswith(".cmd") else npm_cmd_list
        use_shell_npm_list = is_windows() and isinstance(npm_exe_path, str) and npm_exe_path.lower().endswith(".cmd")
            
        return_code_npm, stdout_npm, stderr_npm = run_command(cmd_to_run_npm_list, shell=use_shell_npm_list, check=False)

        if return_code_npm == 0 and stdout_npm:
            try:
                import json
                global_packages = json.loads(stdout_npm)
                if "pnpm" in global_packages.get("dependencies", {}):
                    version = global_packages["dependencies"]["pnpm"].get("version", "Version inconnue (npm list)")
                    print_status(f"pnpm détecté (via npm list -g): {version}", "success")
                    return True, version
            except json.JSONDecodeError:
                print_status(f"Impossible de parser la sortie JSON de 'npm list -g': {stdout_npm[:200]}...", "warning")
            except Exception as e:
                 print_status(f"Erreur lors du parsing de npm list -g: {e}", "warning")
        # else:
        #     print_status(f"Échec de 'npm list -g' (code: {return_code_npm}): {stderr_npm.strip()}", "warning")
            
    print_status("pnpm n'est pas installé ou n'est pas détectable (après toutes vérifications).", "error")
    return False, None

def install_pnpm_if_needed(npm_exe_path):
    """Installe pnpm si nécessaire."""
    if not npm_exe_path:
        print_status("Chemin vers npm non fourni. Impossible d'installer pnpm.", "error")
        print_status("Veuillez vérifier votre installation de Node.js et que npm est correctement configuré.", "info")
        print_status("Vous devrez peut-être installer pnpm manuellement: https://pnpm.io/installation", "info")
        return False
    
    print_status(f"Utilisation de npm trouvé à: {npm_exe_path} pour installer pnpm.", "info")
    if not os.path.isfile(npm_exe_path): # Redondant si shutil.which a fonctionné, mais double vérification
        print_status(f"Le chemin npm '{npm_exe_path}' ne semble pas être un fichier valide.", "error")
        return False

    print_status("Tentative d'installation de pnpm via npm (méthode recommandée)...", "info")
    
    install_cmd_list = [npm_exe_path, "install", "-g", "pnpm"]
    cmd_to_run = subprocess.list2cmdline(install_cmd_list) if is_windows() and npm_exe_path.lower().endswith(".cmd") else install_cmd_list
    use_shell = is_windows() and npm_exe_path.lower().endswith(".cmd")

    print_status(f"Exécution de la commande: {str(cmd_to_run)} (shell={use_shell})", "info")
    return_code, stdout, stderr = run_command(cmd_to_run, shell=use_shell, check=False) # check=False pour gérer l'erreur
    
    if return_code != 0:
        print_status(f"Échec de l'installation de pnpm via npm (code: {return_code})", "error")
        if stdout.strip(): print_status(f"STDOUT:\n{stdout.strip()}", "info")
        if stderr.strip(): print_status(f"STDERR:\n{stderr.strip()}", "error")
        print_status("Si l'erreur persiste, veuillez installer pnpm manuellement: https://pnpm.io/installation", "info")
        return False
    
    print_status("pnpm installé avec succès via npm.", "success")
    print_status(f"{Colors.BOLD}{Colors.YELLOW}IMPORTANT:{Colors.RESET} Veuillez {Colors.BOLD}FERMER ET RELANCER{Colors.RESET} ce script (ou votre terminal) pour que pnpm soit correctement détecté dans le PATH.", "warning")
    return True # Retourne True, mais le script principal devrait quitter après ça.

def check_adb():
    """Vérifie si ADB est installé et obtient sa version."""
    print_status("Vérification de l'installation d'ADB...")
    adb_exe = shutil.which("adb")
    if not adb_exe:
        print_status("ADB n'est pas trouvé dans le PATH.", "warning")
        return False, None

    return_code, stdout, stderr = run_command([adb_exe, "version"], check=False)
    if return_code == 0:
        version_line = stdout.strip().split("\n")[0] # Prend la première ligne
        version = version_line.replace("Android Debug Bridge version ", "") # Nettoie un peu
        print_status(f"ADB détecté: {version} (Chemin: {adb_exe})", "success")
        return True, version
    else:
        print_status(f"ADB trouvé à {adb_exe} mais --version a échoué: {stderr.strip()}", "warning")
        return False, None


def setup_python_venv(api_dir_path):
    """Configure l'environnement virtuel Python si nécessaire."""
    print_status("Configuration de l'environnement virtuel Python...")
    venv_dir = api_dir_path / ".venv"
    
    if not venv_dir.exists() or not (venv_dir / "pyvenv.cfg").exists(): # Vérification plus robuste
        print_status("Création d'un nouvel environnement virtuel Python...")
        python_exe_for_venv = sys.executable # Utiliser le Python qui exécute ce script
        
        return_code, stdout, stderr = run_command([python_exe_for_venv, "-m", "venv", str(venv_dir)], check=False)
        if return_code != 0:
            print_status(f"Échec de la création de l'environnement virtuel Python: {stderr.strip()}", "error")
            return False
        print_status(f"Environnement virtuel Python créé avec succès à {venv_dir}", "success")
    else:
        print_status(f"Environnement virtuel Python déjà existant à {venv_dir}", "success")
    
    print_status("Installation des dépendances Python depuis requirements.txt...")
    pip_exe_name = "pip.exe" if is_windows() else "pip"
    pip_cmd = venv_dir / ("Scripts" if is_windows() else "bin") / pip_exe_name
    requirements_file = api_dir_path / "requirements.txt"
    
    if not requirements_file.exists():
        print_status(f"Fichier requirements.txt introuvable à {requirements_file}", "error")
        return False
    if not pip_cmd.exists():
        print_status(f"pip non trouvé dans le venv à {pip_cmd}", "error")
        return False
        
    return_code, stdout, stderr = run_command([str(pip_cmd), "install", "-r", str(requirements_file)], check=False)
    if return_code != 0:
        print_status(f"Échec de l'installation des dépendances Python: {stderr.strip()}", "error")
        if stdout.strip(): print_status(f"STDOUT:\n{stdout.strip()}", "info")
        return False
    
    print_status("Dépendances Python installées avec succès.", "success")
    return True

def clean_node_modules(project_root_path):
    """Nettoie les node_modules, pnpm-lock.yaml et .next."""
    print_status("Nettoyage des installations Node.js précédentes...", "warning")
    
    node_modules_dir = project_root_path / "node_modules"
    pnpm_lock_file = project_root_path / "pnpm-lock.yaml"
    web_app_dir = project_root_path / "apps" / "web"
    next_dir = web_app_dir / ".next"

    items_to_remove = {
        "Dossier node_modules (racine)": node_modules_dir,
        "Fichier pnpm-lock.yaml": pnpm_lock_file,
        "Dossier .next (apps/web)": next_dir
    }

    for name, item_path in items_to_remove.items():
        if item_path.exists():
            print_status(f"Suppression de {name} à {item_path}...", "info")
            try:
                if item_path.is_file():
                    item_path.unlink()
                elif item_path.is_dir():
                    shutil.rmtree(item_path) # Attention, supprime récursivement
                print_status(f"{name} supprimé avec succès.", "success")
            except Exception as e:
                print_status(f"Échec de la suppression de {name}: {e}", "error")
                # Ne pas bloquer si la suppression échoue, mais avertir
        else:
            print_status(f"{name} non trouvé à {item_path} (pas besoin de supprimer).", "info")
    
    # Nettoyage du cache pnpm
    print_status("Nettoyage du cache pnpm (pnpm store prune)...", "info")
    # pnpm store prune doit être trouvé via le PATH
    pnpm_exe = shutil.which("pnpm.cmd" if is_windows() else "pnpm")
    if not pnpm_exe:
        print_status("pnpm non trouvé dans le PATH pour 'pnpm store prune'. Étape ignorée.", "warning")
        return

    return_code, stdout, stderr = run_command([pnpm_exe, "store", "prune"], check=False, cwd=str(project_root_path))
    if return_code != 0:
        print_status(f"Échec de 'pnpm store prune': {stderr.strip()}", "warning")
        if stdout.strip(): print_status(f"STDOUT:\n{stdout.strip()}", "info")
    else:
        print_status("'pnpm store prune' exécuté avec succès.", "success")
        if stdout.strip(): print_status(f"STDOUT:\n{stdout.strip()}", "info")


def install_node_dependencies(project_root_path, force_clean=False):
    """Installe les dépendances Node.js, avec option de nettoyage."""
    if force_clean:
        clean_node_modules(project_root_path) # Appel à la nouvelle fonction

    print_status("Installation des dépendances Node.js avec pnpm install...", "info")
    pnpm_exe = shutil.which("pnpm.cmd" if is_windows() else "pnpm")
    if not pnpm_exe:
        print_status("pnpm non trouvé dans le PATH pour 'pnpm install'.", "error")
        return False

    return_code, stdout, stderr = run_command([pnpm_exe, "install"], check=False, cwd=str(project_root_path))
        
    if return_code != 0:
        print_status(f"Échec de 'pnpm install': {stderr.strip()}", "error")
        if stdout.strip(): print_status(f"STDOUT:\n{stdout.strip()}", "info")
        return False
    
    print_status("Dépendances Node.js installées avec succès via 'pnpm install'.", "success")
    if stdout.strip(): print_status(f"Sortie de 'pnpm install':\n{stdout.strip()}", "info")
    return True

def start_application(project_root_path):
    """Démarre l'application (API et frontend)."""
    print_status("Démarrage de l'application (pnpm dev)...", "info")
    pnpm_exe = shutil.which("pnpm.cmd" if is_windows() else "pnpm")
    if not pnpm_exe:
        print_status("pnpm non trouvé dans le PATH pour 'pnpm dev'.", "error")
        return False
        
    # La commande 'pnpm dev' dans le package.json racine lance 'concurrently'
    # 'concurrently' gère les logs de web et api
    if is_windows():
        # Lancer dans une nouvelle fenêtre de commande qui reste ouverte.
        # 'pnpm dev' devrait résoudre 'concurrently' depuis node_modules/.bin
        start_command = f'start cmd /k "cd /d {str(project_root_path)} && {pnpm_exe} dev"'
        print_status(f"Exécution dans une nouvelle console Windows: {start_command}", "info")
        try:
            subprocess.Popen(start_command, shell=True)
        except Exception as e:
            print_status(f"Erreur lors du lancement de 'pnpm dev' dans une nouvelle console: {e}", "error")
            return False
    else: 
        try:
            # Sur Linux/macOS, on peut vouloir le lancer en arrière-plan,
            # mais pour un script de démarrage, il est souvent mieux de le garder au premier plan
            # ou de conseiller à l'utilisateur d'utiliser un gestionnaire de session comme tmux.
            # Pour l'instant, on le lance et on laisse Python attendre.
            # Pour le détacher, il faudrait utiliser des techniques comme nohup ou double fork.
            # Pour ce script, supposons qu'il est ok que le script Python attende ou que l'utilisateur le gère.
            # On va plutôt lancer et ne pas attendre la fin, mais l'utilisateur verra la sortie dans le terminal courant.
            # Si Popen est utilisé, il faut lire stdout/stderr pour éviter les blocages si les buffers sont pleins.
            # L'idéal est que 'pnpm dev' via 'concurrently' gère bien ses propres flux.
            print_status(f"Lancement de '{pnpm_exe} dev' dans le répertoire '{project_root_path}'. La sortie apparaîtra ci-dessous.", "info")
            print_status("Appuyez sur Ctrl+C dans ce terminal pour arrêter le serveur de développement.", "info")
            # Pour que 'concurrently' fonctionne bien avec les couleurs etc, on le lance directement
            # et on laisse le script Python se terminer après l'avoir lancé.
            # Ou on attend la fin de la commande :
            process = subprocess.Popen([pnpm_exe, "dev"], cwd=str(project_root_path), shell=False) # shell=False est plus sûr si pnpm_exe est un chemin
            # Pour ne pas attendre, on ne fait pas process.wait() ou communicate()
            # Mais le script Python se terminera et le processus pnpm dev continuera.
            # C'est généralement ce qu'on veut pour un script de lancement.
            # Si on voulait attendre et afficher la sortie :
            # process.wait() # Ceci bloquerait jusqu'à ce que pnpm dev soit arrêté.
            print_status("Commande de démarrage envoyée.", "info")

        except Exception as e:
            print_status(f"Erreur lors du lancement de 'pnpm dev': {e}", "error")
            return False
    
    print_status("Serveur de développement pnpm (concurrently) démarré (ou tentative de démarrage).", "success")
    print_status("L'interface web devrait être accessible à http://localhost:3000", "success")
    print_status("L'API devrait être accessible à http://localhost:8000", "success")
    return True

def welcome_message():
    """Affiche un message de bienvenue."""
    print("\n" + "="*80)
    print(f"{Colors.BOLD}Bienvenue dans le lanceur de l'application DimiCall-main{Colors.RESET}")
    print("Ce script va vérifier les dépendances, les nettoyer si besoin, et lancer l'application.")
    print("="*80 + "\n")

def ensure_browser_opens(url="http://localhost:3000"):
    """Ouvre le navigateur par défaut à l'URL spécifiée après un court délai."""
    print_status(f"Ouverture du navigateur à {url} dans 5 secondes...", "info")
    time.sleep(5)
    
    try:
        import webbrowser
        webbrowser.open(url)
        print_status(f"Tentative d'ouverture de {url} avec le module webbrowser.", "info")
    except Exception as e_wb:
        print_status(f"Échec de l'ouverture avec webbrowser: {e_wb}. Tentative avec des commandes OS spécifiques.", "warning")
        # ... (votre code existant pour start/open/xdg-open)
        cmd = None
        if is_windows(): cmd = f'start "" "{url}"' # Ajout de "" pour les titres avec espaces
        elif platform.system() == 'Darwin': cmd = f'open "{url}"'
        else: cmd = f'xdg-open "{url}"' # Plus robuste
        
        if cmd:
            try:
                run_command(cmd, shell=True, check=False) # Utiliser run_command pour la gestion d'erreur
                print_status(f"Tentative d'ouverture de {url} avec '{cmd}'.", "info")
            except Exception as e_cmd:
                print_status(f"Échec de l'ouverture avec la commande OS '{cmd}': {e_cmd}", "error")
        else:
            print_status("Impossible de déterminer la commande pour ouvrir le navigateur sur cet OS.", "error")


def main():
    """Fonction principale."""
    welcome_message()
    
    project_root = Path(__file__).parent.resolve() # Plus robuste
    api_dir = project_root / "apps" / "api"
    web_dir = project_root / "apps" / "web" # Inutilisé pour le moment mais bon à avoir
    
    if not api_dir.exists() or not (project_root / "apps" / "web").exists(): # web_dir n'est pas utilisé directement après
        print_status("Structure de projet incorrecte. Vérifiez que 'apps/api' et 'apps/web' existent.", "error")
        return False
    
    python_ok, _ = check_python()
    node_ok, _, npm_path = check_node()
    adb_ok, _ = check_adb()
    
    if not python_ok or not node_ok: # npm_path sera None si node_ok est False
        print_status("Python et Node.js sont requis. Veuillez les installer et réessayer.", "error")
        return False
    
    pnpm_ok, _ = check_pnpm(npm_path)
    if not pnpm_ok:
        print_status("pnpm n'est pas détecté. Tentative d'installation...", "warning")
        if install_pnpm_if_needed(npm_path):
            # Le message d'arrêt est déjà dans install_pnpm_if_needed
            sys.exit(0) # Quitter pour que l'utilisateur relance
        else:
            print_status("Échec de l'installation de pnpm. Veuillez l'installer manuellement.", "error")
            return False
            
    if not adb_ok:
        print_status("ADB n'est pas installé. Certaines fonctionnalités pourraient ne pas fonctionner.", "warning")
    
    if not setup_python_venv(api_dir):
        return False
    
    # Demander à l'utilisateur s'il veut forcer un nettoyage
    force_clean_input = input(f"{Colors.YELLOW}Voulez-vous forcer un nettoyage complet des dépendances Node.js (supprime node_modules, pnpm-lock.yaml, .next et nettoie le cache pnpm) ? (o/N): {Colors.RESET}").strip().lower()
    should_force_clean = force_clean_input == 'o'

    if not install_node_dependencies(project_root, force_clean=should_force_clean):
        print_status("Échec de l'installation des dépendances Node.js.", "error")
        print_status("Essayez de relancer le script avec l'option de nettoyage (o) si ce n'est pas déjà fait.", "info")
        return False
    
    if not start_application(project_root):
        return False
    
    ensure_browser_opens()
    return True

if __name__ == "__main__":
    try:
        success = main()
        if not success:
            print_status("Le démarrage de l'application a échoué. Veuillez résoudre les problèmes ci-dessus et réessayer.", "error")
            if is_windows(): os.system("pause")
            sys.exit(1)
        else:
            print_status("Le lanceur a terminé ses opérations. L'application devrait être en cours d'exécution.", "info")
            if is_windows():
                 print_status("Vous pouvez fermer cette fenêtre de lanceur si l'application est démarrée dans une autre console (sinon, laissez-la ouverte pour voir les logs si pnpm dev n'a pas été lancé avec 'start').", "info")
    except KeyboardInterrupt:
        print_status("\nOpération annulée par l'utilisateur.", "warning")
        if is_windows(): os.system("pause")
        sys.exit(1)
    except Exception as e:
        print_status(f"Une erreur inattendue et non gérée s'est produite dans le lanceur: {str(e)}", "error")
        import traceback
        traceback.print_exc()
        if is_windows(): os.system("pause")
        sys.exit(1)