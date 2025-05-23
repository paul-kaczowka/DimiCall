import asyncio
import subprocess
import os # Ajouté pour la création de dossier si besoin
from datetime import datetime, timezone
from typing import Union, List, Annotated, Optional, Dict
import io
import pandas as pd
import pyarrow # Juste pour s'assurer qu'il est importable, pandas l'utilisera
from pathlib import Path # Pour gérer les chemins de manière robuste
import uuid # Importer uuid pour générer des IDs uniques
import re # Importer re pour les expressions régulières
import platform # Ajouté pour la détection de l'OS
# import pytz # Commenté car nous allons utiliser zoneinfo
from zoneinfo import ZoneInfo # AJOUTÉ : pour une meilleure gestion des fuseaux horaires

# Comment out the Windows-specific event loop policy setting
# if platform.system() == "Windows":
#     asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

import schedule
import uvicorn
from fastapi import FastAPI, HTTPException, UploadFile, File, Form, BackgroundTasks, Response, Path as FastAPIPath, Body
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware # Importer CORSMiddleware
from fastapi import status

# Modèles Pydantic pour les requêtes et réponses (simplifiés)
class CallRequest(BaseModel):
    phone_number: str

# NOUVEAU MODÈLE pour la requête de raccrochage
class HangUpRequest(BaseModel):
    contact_id: Optional[str] = None

class EndCallRequest(BaseModel):
    contact_id: str
    call_start_time: str  # Format ISO, gardé pour info ou fallback si besoin
    measured_duration_seconds: Union[int, None] = None # AJOUTÉ

class ContactBase(BaseModel):
    firstName: str
    lastName: str
    email: Union[str, None] = None
    phoneNumber: Union[str, None] = None
    status: Union[str, None] = None
    comment: Union[str, None] = None
    dateRappel: Union[str, None] = None
    heureRappel: Union[str, None] = None
    dateRendezVous: Union[str, None] = None
    heureRendezVous: Union[str, None] = None
    dateAppel: Union[str, None] = None
    heureAppel: Union[str, None] = None
    dureeAppel: Union[str, None] = None
    callStartTime: Union[str, None] = None # AJOUTÉ: Heure de début d'appel ISO UTC
    source: Union[str, None] = None

class ContactUpdate(BaseModel): # Nouveau modèle pour la mise à jour partielle
    firstName: Union[str, None] = None
    lastName: Union[str, None] = None
    email: Union[str, None] = None
    phoneNumber: Union[str, None] = None
    status: Union[str, None] = None
    comment: Union[str, None] = None
    dateRappel: Union[str, None] = None
    heureRappel: Union[str, None] = None
    dateRendezVous: Union[str, None] = None
    heureRendezVous: Union[str, None] = None
    dateAppel: Union[str, None] = None
    heureAppel: Union[str, None] = None
    dureeAppel: Union[str, None] = None
    source: Union[str, None] = None
    callStartTime: Union[str, None] = None # AJOUTÉ: Heure de début d'appel ISO UTC

class ContactInDB(ContactBase):
    id: str

# --- Configuration de l'application FastAPI ---
app = FastAPI(
    title="Contacts API",
    description="API pour gérer les contacts, les appels et les backups.",
    version="0.1.0"
)

# --- Configuration CORS ---
# Définir les origines autorisées (votre frontend Next.js)
origins = [
    "http://localhost:3000", # URL de développement Next.js
    # Ajoutez d'autres origines si nécessaire (ex: votre URL de production)
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"], # Autoriser toutes les méthodes (GET, POST, etc.)
    allow_headers=["*"], # Autoriser tous les headers
)

# --- Chemins pour les backups et le stockage principal ---
BASE_DIR = Path(__file__).resolve().parent
BACKUP_DIR = BASE_DIR / "backups"
BACKUP_DIR.mkdir(parents=True, exist_ok=True) # S'assurer que le dossier existe
CONTACTS_STORAGE_FILE = BASE_DIR / "contacts_storage.parquet"

# --- Chemin pour le dossier d'autosauvegarde ---
PROJECT_ROOT_DIR = BASE_DIR.parent.parent  # Remonter de 2 niveaux pour être à la racine du projet
AUTOSAVE_DIR = PROJECT_ROOT_DIR / "Autosave"
AUTOSAVE_DIR.mkdir(parents=True, exist_ok=True)  # Créer le dossier s'il n'existe pas

# --- Constante pour le fuseau horaire de Paris ---
PARIS_TZ = ZoneInfo("Europe/Paris")

# --- Fonction d'aide pour le formatage des numéros de téléphone ---
def format_phone_number(num_str: Union[str, None, float]) -> Union[str, None]:
    if num_str is None or (isinstance(num_str, float) and pd.isna(num_str)):
        return None

    s = str(num_str).strip()
    
    # Supprimer les espaces, tirets, points, parenthèses et autres caractères non numériques sauf le + initial
    s = re.sub(r"[^\d+]", "", s)
    if not s.startswith('+'):
        s = re.sub(r"[^\d]", "", s) # Si pas de +, supprimer tous les non-numériques

    if not s:
        return None

    # Cas 1: Déjà au format international français (+33 suivi de 9 chiffres)
    if s.startswith("+33") and len(s) == 12 and s[3:].isdigit():
        return f"+33 {s[3]} {s[4:6]} {s[6:8]} {s[8:10]} {s[10:12]}"

    # Cas 2: Format national français (0 suivi de 9 chiffres)
    if s.startswith("0") and len(s) == 10 and s.isdigit():
        national_part = s[1:]
        return f"+33 {national_part[0]} {national_part[1:3]} {national_part[3:5]} {national_part[5:7]} {national_part[7:9]}"

    # Cas 3: Format international sans le '+' mais avec 33 (33 suivi de 9 chiffres pour mobile/fixe)
    if s.startswith("33") and len(s) == 11 and s[2:].isdigit():
        return f"+33 {s[2]} {s[3:5]} {s[5:7]} {s[7:9]} {s[9:11]}"

    # Cas 4: Numéro français court sans 0 ni +33 (ex: 612345678) - 9 chiffres, commençant par 1-7
    if len(s) == 9 and s.isdigit() and s[0] in ['1', '2', '3', '4', '5', '6', '7']:
        return f"+33 {s[0]} {s[1:3]} {s[3:5]} {s[5:7]} {s[7:9]}"
    
    # Si c'est un numéro international (commence par + mais pas +33, ou +33 mais format non standard ci-dessus)
    if s.startswith("+"):
        return s # Retourner tel quel (nettoyé des espaces etc. initiaux)

    # Pour les autres cas non reconnus (ni français formatable, ni international avec +),
    # On pourrait choisir de retourner None ou le numéro nettoyé.
    # Pour l'instant, retournons le numéro nettoyé.
    return s

# --- Fonctions de traitement en arrière-plan ---
async def process_imported_file(file_contents: bytes, content_type: str):
    """Traite le fichier importé (CSV ou XLSX) et met à jour le fichier de stockage Parquet."""
    print(f"[Background Task] Début du traitement du fichier de type: {content_type}")
    try:
        new_df: pd.DataFrame
        if content_type == "text/csv":
            new_df = pd.read_csv(io.BytesIO(file_contents))
        elif content_type in ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]:
            new_df = pd.read_excel(io.BytesIO(file_contents))
        else:
            print(f"[Background Task] Type de fichier non supporté: {content_type}")
            return

        # Normaliser les noms de colonnes: minuscule, sans espaces, sans underscores, sans apostrophes
        new_df.columns = [
            str(col).lower().replace(" ", "").replace("_", "").replace("'", "") 
            for col in new_df.columns
        ]
        
        rename_map = {
            'prénom': 'firstName',
            'nom': 'lastName',
            'courriel': 'email',
            'mail': 'email',
            'téléphone': 'phoneNumber',
            'telephone': 'phoneNumber',
            'numero': 'phoneNumber',  # Ajout du mappage pour "Numéro"
            'numéro': 'phoneNumber',  # Ajout du mappage pour "Numéro" avec accent
            'prenom': 'firstName',
            'nomdefamille': 'lastName',
            'statut': 'status',
            'commentaire': 'comment',
            'rappel': 'dateRappel',
            'heurerappel': 'heureRappel',
            'daterendez-vous': 'dateRendezVous',
            'heurerendez-vous': 'heureRendezVous',
            'datedappel': 'dateAppel', # Apostrophe déjà supprimée lors de la normalisation
            'heureappel': 'heureAppel', # Apostrophe déjà supprimée
            'dureeappel': 'dureeAppel', # Apostrophe déjà supprimée
            'source': 'source',
        }
        new_df.rename(columns=rename_map, inplace=True)

        contact_model_fields_with_id = list(ContactInDB.model_fields.keys())
        fields_from_file = [field for field in contact_model_fields_with_id if field != 'id']

        for col in fields_from_file:
            if col not in new_df.columns:
                new_df[col] = pd.NA

        if 'firstName' in new_df.columns and 'lastName' in new_df.columns:
            new_df.dropna(subset=['firstName', 'lastName'], inplace=True)
        elif 'firstName' in new_df.columns:
            new_df.dropna(subset=['firstName'], inplace=True)
        elif 'lastName' in new_df.columns:
            new_df.dropna(subset=['lastName'], inplace=True)
        else:
            print("[Background Task] firstName ou lastName manquant pour toutes les lignes, aucun contact à importer.")
            return
        
        if new_df.empty:
            print("[Background Task] Aucun contact valide à ajouter après filtrage.")
            return

        new_df['id'] = [str(uuid.uuid4()) for _ in range(len(new_df))]
        
        for field in fields_from_file:
            if field in new_df.columns: # Traiter uniquement les colonnes qui existent
                if field == 'phoneNumber':
                    new_df[field] = new_df[field].apply(format_phone_number)
                else:
                    # Pour tous les autres champs (qui sont Union[str, None])
                    # Convertir en string, remplacer les <NA> de pandas par vide, puis fillna vide.
                    new_df[field] = new_df[field].astype(str).replace({'<NA>': ''}).fillna('')
            else:
                # Cela ne devrait pas arriver si la création de colonnes manquantes ci-dessus a fonctionné
                new_df[field] = '' # ou None, selon la préférence pour les champs manquants

        # S'assurer que toutes les colonnes du modèle ContactInDB sont présentes pour la sélection finale
        final_df_columns = [col for col in contact_model_fields_with_id if col in new_df.columns]
        final_df = new_df[final_df_columns].copy()
        
        # Charger les contacts existants s'il y en a
        if CONTACTS_STORAGE_FILE.exists():
            try:
                existing_df = pd.read_parquet(CONTACTS_STORAGE_FILE)
                # Concaténer, en ignorant les index pour éviter les conflits et réinitialiser
                # On pourrait ajouter une logique de déduplication ici basée sur email ou nom/prénom
                combined_df = pd.concat([existing_df, final_df], ignore_index=True)
                 # Déduplication simple basée sur un sous-ensemble de colonnes, gardant la dernière occurrence
                combined_df.drop_duplicates(subset=['firstName', 'lastName', 'email'], keep='last', inplace=True)
            except Exception as e_read_parquet:
                print(f"[Background Task] Erreur lors de la lecture du fichier Parquet existant {CONTACTS_STORAGE_FILE}: {e_read_parquet}. Le fichier sera écrasé.")
                combined_df = final_df
        else:
            combined_df = final_df

        combined_df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
        print(f"[Background Task] {len(final_df)} nouveaux contacts traités. Total de {len(combined_df)} contacts dans {CONTACTS_STORAGE_FILE}.")

    except Exception as e:
        print(f"[Background Task] Erreur majeure lors du traitement du fichier importé: {e}")

# --- Fonctions de gestion des données (chargement, sauvegarde, recherche) ---

def load_contacts_from_storage() -> List[Dict]:
    """Charge les contacts depuis le fichier Parquet."""
    if not CONTACTS_STORAGE_FILE.exists() or CONTACTS_STORAGE_FILE.stat().st_size == 0:
        return []
    try:
        df = pd.read_parquet(CONTACTS_STORAGE_FILE)
        return df.to_dict(orient='records')
    except Exception as e:
        print(f"[API ERREUR] Impossible de charger {CONTACTS_STORAGE_FILE}: {e}")
        return []

def save_contacts_to_storage(contacts_list: List[Dict]):
    """Sauvegarde la liste complète des contacts dans le fichier Parquet."""
    try:
        df = pd.DataFrame(contacts_list)
        # S'assurer que toutes les colonnes attendues par ContactInDB sont présentes, même si vides
        for col in ContactInDB.model_fields.keys():
            if col not in df.columns:
                df[col] = pd.NA # Ou None, ou une valeur par défaut appropriée
        df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
        print(f"[API INFO] Contacts sauvegardés dans {CONTACTS_STORAGE_FILE}")
    except Exception as e:
        print(f"[API ERREUR] Impossible de sauvegarder dans {CONTACTS_STORAGE_FILE}: {e}")

# NOUVELLE FONCTION D'AIDE (ou à adapter si elle existe déjà sous un autre nom)
def find_contact_by_id(contact_id: str) -> Optional[Dict]:
    """Trouve un contact par son ID dans le stockage actuel."""
    contacts_list = load_contacts_from_storage()
    for contact in contacts_list:
        if contact.get("id") == contact_id:
            return contact
    return None

# --- Logique de Backup (Scheduler) ---
def perform_backup_contacts():
    """Sauvegarde les contacts en format Parquet."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = BACKUP_DIR / f"contacts_backup_{timestamp}.parquet"
    print(f"[Scheduler] Exécution du backup des contacts vers {filename}...")
    
    if not CONTACTS_STORAGE_FILE.exists():
        print("[Scheduler] Aucun contact à sauvegarder.")
        return

    try:
        # Convertir le fichier Parquet en DataFrame
        df = pd.read_parquet(CONTACTS_STORAGE_FILE)
        df.to_parquet(filename, index=False)
        print(f"[Scheduler] Backup {filename} terminé avec succès.")
    except Exception as e:
        print(f"[Scheduler] Erreur lors de la création du backup Parquet: {e}")

schedule.every(30).minutes.do(perform_backup_contacts)
# schedule.every(10).seconds.do(perform_backup_contacts) # Pour test

async def run_scheduler():
    """Exécute les tâches planifiées en continu."""
    while True:
        schedule.run_pending()
        await asyncio.sleep(1)

@app.on_event("startup")
async def startup_event():
    print("Application FastAPI démarrée...")
    asyncio.create_task(run_scheduler())
    print("Scheduler démarré.")
    # Lancer un premier backup au démarrage si souhaité
    # perform_backup_contacts()

# --- Fonctions ADB ---

def run_adb_command(command_parts: list[str], timeout_seconds: int = 10) -> str:
    try:
        adb_executable = "adb"
        # Si vous avez adb dans un emplacement spécifique et non dans le PATH :
        # adb_path_env = os.getenv("ADB_PATH")
        # if adb_path_env:
        # adb_executable = adb_path_env

        command = [adb_executable] + command_parts
        print(f"[API] Exécution de la commande ADB : {' '.join(command)}")
        
        # Utilisation de subprocess.run avec timeout
        result = subprocess.run(
            command, 
            capture_output=True, 
            text=True, 
            check=False, # On vérifiera le returncode manuellement
            shell=False, # Important pour la sécurité
            timeout=timeout_seconds
        )

        if result.returncode != 0:
            # Essayons de décoder stderr avec des encodages courants si ce n'est pas de l'UTF-8 valide
            decoded_stderr = result.stderr.strip()
            try:
                # Tenter UTF-8 d'abord, puis des encodages courants pour Windows
                decoded_stderr.encode('utf-8') # Teste si c'est déjà de l'UTF-8 valide
            except UnicodeEncodeError: # Signifie que ce n'est pas de l'UTF-8 valide si ça vient de text=True et capture_output=True
                try:
                    decoded_stderr = result.stderr.strip().encode('latin-1').decode('cp1252', errors='replace')
                except Exception: # Fallback si tout échoue
                    decoded_stderr = result.stderr.strip().encode('utf-8', errors='replace').decode('utf-8', errors='replace')


            error_message = f"Erreur lors de l'exécution de la commande ADB. Code: {result.returncode}, Stderr: {decoded_stderr}"
            print(f"[API ERREUR] {error_message}")
            raise subprocess.CalledProcessError(result.returncode, command, output=result.stdout, stderr=result.stderr)

        print(f"[API] Commande ADB exécutée avec succès. Output: {result.stdout.strip()}")
        return result.stdout.strip()

    except FileNotFoundError:
        print("[API ERREUR] Commande ADB non trouvée. Assurez-vous qu\'ADB est installé et dans le PATH (ou variable ADB_PATH configurée).")
        raise HTTPException(status_code=500, detail="ADB non trouvé sur le serveur.")
    except subprocess.TimeoutExpired:
        error_message = f"Timeout lors de l'exécution de la commande ADB : {' '.join(command_parts)}"
        print(f"[API ERREUR] {error_message}")
        raise HTTPException(status_code=500, detail=error_message)
    except subprocess.CalledProcessError as e: 
        # stderr devrait déjà être une string ici si text=True était utilisé dans subprocess.run
        # Si e.stderr est bytes, il faudrait le décoder.
        stderr_str = e.stderr
        if isinstance(stderr_str, bytes):
            try:
                stderr_str = stderr_str.decode('utf-8', errors='replace')
            except: # Fallback si le décodage utf-8 échoue
                 stderr_str = str(stderr_str) # Représentation brute des bytes

        error_message = f"Erreur lors de l'exécution de la commande ADB ({' '.join(e.cmd)}, code {e.returncode}): {stderr_str.strip()}"
        print(f"[API ERREUR] {error_message}")
        raise HTTPException(status_code=500, detail=error_message)
    except Exception as e:
        error_message = f"Erreur inattendue avec ADB: {str(e)}"
        print(f"[API ERREUR] {error_message}")
        raise HTTPException(status_code=500, detail=error_message)

# --- Routes API ---
@app.post("/call", summary="Initier un appel téléphonique via ADB")
async def make_call(call_request: CallRequest):
    phone_number = call_request.phone_number
    print(f"[API] Requête pour appeler le numéro : {phone_number}")
    try:
        cleaned_phone_number = phone_number.replace(" ", "")
        print(f"[API DEBUG] Numéro nettoyé AVANT appel ADB: '{cleaned_phone_number}'")
        command = ["adb", "shell", "am", "start", "-a", "android.intent.action.CALL", "-d", f"tel:{cleaned_phone_number}"]
        print(f"[API] Exécution de la commande ADB : {' '.join(command)}")
        
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        # Utiliser datetime.now(timezone.utc) pour un datetime conscient du fuseau UTC
        call_time_utc_aware = datetime.now(timezone.utc)
        call_time_iso_utc = call_time_utc_aware.isoformat() # Pydantic/FastAPI sérialisera correctement en ISO avec Z

        if process.returncode == 0:
            print(f"[API] Commande ADB exécutée avec succès. Output: {stdout.decode() if stdout else 'N/A'}")
            return {
                "message": f"Appel vers {phone_number} initié.",
                "phone_number_called": phone_number,
                "call_time": call_time_iso_utc # Renvoyer l'heure UTC aware
            }
        else:
            decoded_stderr = ""
            if stderr:
                try:
                    # Essayer les encodages courants pour Windows (français)
                    decoded_stderr = stderr.decode('cp1252')
                except UnicodeDecodeError:
                    try:
                        decoded_stderr = stderr.decode('latin-1')
                    except UnicodeDecodeError:
                        # Fallback vers UTF-8 avec remplacement des caractères non mappables
                        decoded_stderr = stderr.decode('utf-8', errors='replace')
            
            error_message = decoded_stderr if decoded_stderr else "Erreur ADB inconnue (stderr vide ou problème de décodage)"
            
            decoded_stdout = ""
            if stdout:
                try:
                    decoded_stdout = stdout.decode('cp1252')
                except UnicodeDecodeError:
                    try:
                        decoded_stdout = stdout.decode('latin-1')
                    except UnicodeDecodeError:
                        decoded_stdout = stdout.decode('utf-8', errors='replace')

            print(f"[API] Erreur lors de l'exécution de la commande ADB.")
            print(f"[API] Code de retour: {process.returncode}")
            print(f"[API] Stderr: {error_message}")
            print(f"[API] Stdout: {decoded_stdout if decoded_stdout else 'N/A'}")
            # Il est important de ne pas retourner call_time_iso_utc ici car l'appel a échoué
            raise HTTPException(status_code=500, detail=f"Erreur ADB: {error_message}")

    except FileNotFoundError:
        print("[API] Erreur: Commande ADB non trouvée. Assurez-vous qu'ADB est installé et dans le PATH.")
        raise HTTPException(status_code=500, detail="Commande ADB non trouvée. Assurez-vous qu'ADB est installé et dans le PATH.")
    except Exception as e:
        print(f"[API] Erreur inattendue lors de l'appel : {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/adb/status", summary="Vérifier le statut de l'appareil ADB")
async def get_adb_device_status():
    print("[API] Requête pour vérifier le statut de l'appareil ADB")
    try:
        command = ["adb", "devices"]
        print(f"[API] Exécution de la commande ADB : {' '.join(command)}")
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout_bytes, stderr_bytes = await process.communicate()

        # Décodage avec gestion d'erreurs potentielles
        stdout = stdout_bytes.decode('utf-8', errors='replace') if stdout_bytes else ""
        stderr = stderr_bytes.decode('utf-8', errors='replace') if stderr_bytes else ""

        if process.returncode == 0:
            # print(f"[API] Commande ADB 'devices' exécutée. Output:\n{stdout}") # Commenté pour réduire la verbosité
            
            lines = stdout.splitlines() # Utiliser splitlines() pour la robustesse
            devices = []
            # La première ligne est généralement "List of devices attached" ou similaire, ou peut être vide.
            # On itère sur toutes les lignes et on ne traite que celles qui contiennent une tabulation.
            for line in lines:
                line_stripped = line.strip()
                if not line_stripped or line_stripped.lower() == "list of devices attached":
                    continue # Ignorer la ligne d'en-tête ou les lignes vides
                
                parts = line_stripped.split('\t') # Utiliser un simple '\t' pour la tabulation
                if len(parts) == 2:
                    device_id = parts[0].strip()
                    device_status = parts[1].strip()
                    if device_id: # S'assurer que l'ID n'est pas vide après strip
                        devices.append({"id": device_id, "status": device_status})
                else:
                    # Ligne non standard, pourrait être un message d'erreur ou autre information non pertinente
                    print(f"[API] Ligne ignorée (format inattendu): {line_stripped}")
            
            if not devices:
                # Si aucun appareil n'est listé après le parsing, même si la commande a réussi
                return {"status": "no_device_detected", "devices": []}
            
            return {"status": "success", "devices": devices}
        else:
            error_message = stderr if stderr else "Erreur ADB inconnue lors de la récupération du statut (returncode non nul)"
            print(f"[API] Erreur lors de la commande ADB 'devices'. Return code: {process.returncode}. Error: {error_message}")
            raise HTTPException(status_code=500, detail=f"Erreur ADB (devices): {error_message}")

    except FileNotFoundError:
        print("[API] Erreur critique: Commande ADB non trouvée pour 'devices'. Vérifiez l'installation et le PATH.")
        raise HTTPException(status_code=500, detail="Commande ADB non trouvée. Assurez-vous qu'ADB est installé et dans le PATH.")
    except Exception as e:
        print(f"[API] Erreur inattendue majeure lors de la vérification du statut ADB : {e}")
        # Il est utile de logger l'exception complète pour le débogage
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur lors de la vérification du statut ADB: {str(e)}")

@app.get("/adb/battery", summary="Récupérer le niveau de batterie de l'appareil ADB")
async def get_adb_battery_status():
    print("[API] Requête pour récupérer le niveau de batterie ADB")
    try:
        # Commande pour obtenir le niveau de batterie
        # Note: 'adb shell dumpsys battery' donne beaucoup d'infos, 'grep level' extrait la ligne avec le niveau
        # Pour éviter d'utiliser grep directement dans la commande (qui pourrait ne pas être dispo sur tous les OS de la même manière via Python)
        # nous allons récupérer tout le 'dumpsys battery' et parser le niveau en Python.
        command = ["adb", "shell", "dumpsys", "battery"]
        print(f"[API] Exécution de la commande ADB : {' '.join(command)}")
        
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()

        if process.returncode == 0:
            output = stdout.decode()
            # print(f"[API] Commande ADB 'dumpsys battery' exécutée. Output:\n{output[:300]}...") # Commenté pour réduire la verbosité
            
            level_line = None
            for line in output.splitlines():
                if "level:" in line:
                    level_line = line.strip()
                    break
            
            if level_line:
                # Exemple de ligne: "  level: 100"
                try:
                    level = int(level_line.split(":")[1].strip())
                    return {"status": "success", "level": level}
                except (IndexError, ValueError) as e:
                    print(f"[API] Erreur lors du parsing du niveau de batterie: {e}. Ligne: {level_line}")
                    raise HTTPException(status_code=500, detail="Erreur de parsing du niveau de batterie.")
            else:
                # Tenter de voir si un appareil est au moins connecté si 'level' n'est pas trouvé
                # Cela pourrait arriver si l'appareil est en mode spécial ou si la sortie de dumpsys change.
                status_command = ["adb", "devices"]
                status_process = await asyncio.create_subprocess_exec(*status_command, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE)
                status_stdout, _ = await status_process.communicate()
                if status_process.returncode == 0 and "device" in status_stdout.decode(): # Vérifie si au moins un appareil est listé comme 'device'
                     print("[API] Impossible de trouver 'level:' dans la sortie de 'dumpsys battery', mais un appareil est connecté.")
                     raise HTTPException(status_code=500, detail="Impossible d'extraire le niveau de batterie, mais un appareil est connecté.")
                else:
                     print("[API] Impossible de trouver 'level:' et aucun appareil 'device' détecté.")
                     # Cela pourrait aussi signifier qu'aucun appareil n'est connecté ou autorisé.
                     raise HTTPException(status_code=404, detail="Appareil non trouvé ou impossible de lire le niveau de batterie.")
        else:
            error_message = stderr.decode() if stderr else "Erreur ADB inconnue lors de la récupération de la batterie"
            print(f"[API] Erreur lors de la commande ADB 'dumpsys battery'. Error: {error_message}")
            # Vérifier si l'erreur est "device offline" ou "device not found"
            if "device offline" in error_message.lower():
                 raise HTTPException(status_code=404, detail="Appareil ADB déconnecté (offline).")
            elif "device" in error_message.lower() and "not found" in error_message.lower(): # ex: "error: device '(null)' not found"
                 raise HTTPException(status_code=404, detail="Aucun appareil ADB trouvé.")
            raise HTTPException(status_code=500, detail=f"Erreur ADB (battery): {error_message}")

    except FileNotFoundError:
        print("[API] Erreur: Commande ADB non trouvée pour 'dumpsys battery'.")
        raise HTTPException(status_code=500, detail="Commande ADB non trouvée.")
    except Exception as e:
        print(f"[API] Erreur inattendue lors de la récupération de la batterie ADB : {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/contacts/export", summary="Exporter les contacts")
async def export_contacts(format: str = "csv"):
    print(f"[API] Requête d'exportation des contacts au format : {format}")
    if not CONTACTS_STORAGE_FILE.exists():
        # Retourner une réponse vide avec le bon type de contenu si aucun contact
        if format.lower() == "csv":
             return StreamingResponse(iter([]), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=contacts.csv"})
        elif format.lower() == "parquet":
             return StreamingResponse(iter([]), media_type="application/octet-stream", headers={"Content-Disposition": "attachment; filename=contacts.parquet"})
        else:
            raise HTTPException(status_code=400, detail="Format non supporté et aucun contact à exporter.")

    df = pd.read_parquet(CONTACTS_STORAGE_FILE)

    if format.lower() == "csv":
        output = io.StringIO()
        df.to_csv(output, index=False)
        csv_data = output.getvalue()
        output.close()
        return StreamingResponse(
            iter([csv_data]),
            media_type="text/csv",
            headers={"Content-Disposition": "attachment; filename=contacts.csv"}
        )
    elif format.lower() == "parquet":
        output = io.BytesIO()
        df.to_parquet(output, index=False)
        parquet_data = output.getvalue()
        output.close()
        return StreamingResponse(
            iter([parquet_data]),
            media_type="application/octet-stream", # ou application/vnd.apache.parquet
            headers={"Content-Disposition": "attachment; filename=contacts.parquet"}
        )
    else:
        raise HTTPException(status_code=400, detail="Format non supporté. Utilisez 'csv' ou 'parquet'.")

@app.post("/contacts/import", summary="Importer des contacts")
async def import_contacts_file(
    background_tasks: BackgroundTasks,
    file: Annotated[UploadFile, File(description="Fichier de contacts (CSV ou XLSX)")]
):
    if not file:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    allowed_types = ["text/csv", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-excel"]
    if file.content_type not in allowed_types:
        raise HTTPException(status_code=400, detail=f"Type de fichier non supporté: {file.content_type}. Veuillez utiliser {', '.join(allowed_types)}.")

    print(f"[API] Réception du fichier d'import: {file.filename}, Type: {file.content_type}")
    
    # Lire le contenu du fichier avant de le passer à la tâche de fond
    # car l'objet UploadFile pourrait ne plus être accessible ou son contenu consommé.
    file_contents = await file.read()
    await file.close() # Fermer le fichier après lecture

    background_tasks.add_task(process_imported_file, file_contents, file.content_type)
    
    return {"message": f"Fichier {file.filename} reçu et mis en file pour traitement.", "filename": file.filename}

@app.get("/contacts", summary="Lister tous les contacts")
async def list_contacts() -> List[ContactInDB]:
    if not CONTACTS_STORAGE_FILE.exists():
        return []
    try:
        df = pd.read_parquet(CONTACTS_STORAGE_FILE)
        # Convertir les NaN en None pour Pydantic (surtout pour email et phoneNumber)
        df = df.where(pd.notnull(df), None)
        contacts = [ContactInDB(**row) for row in df.to_dict(orient='records')]
        return contacts
    except Exception as e:
        print(f"[API GET /contacts] Erreur lors de la lecture du fichier Parquet {CONTACTS_STORAGE_FILE}: {e}")
        # Selon la politique, on pourrait lever une HTTPException ou retourner une liste vide.
        # Pour la robustesse, retourner une liste vide si le fichier est corrompu.
        return []

@app.post("/contacts", response_model=ContactInDB, summary="Créer un nouveau contact")
async def create_contact(contact_data: ContactBase) -> ContactInDB:
    # Formater le numéro de téléphone avant de créer l'objet ContactInDB
    contact_data.phoneNumber = format_phone_number(contact_data.phoneNumber)
    
    new_id = str(uuid.uuid4())
    new_contact = ContactInDB(id=new_id, **contact_data.model_dump())
    
    new_contact_df = pd.DataFrame([new_contact.model_dump()])

    try:
        if CONTACTS_STORAGE_FILE.exists() and CONTACTS_STORAGE_FILE.stat().st_size > 0:
            existing_df = pd.read_parquet(CONTACTS_STORAGE_FILE)
            # Vérification des doublons (email ou nom/prénom)
            if new_contact.email and not existing_df[existing_df['email'] == new_contact.email].empty:
                raise HTTPException(status_code=409, detail=f"Un contact avec l'email {new_contact.email} existe déjà.")
            if not existing_df[(existing_df['firstName'] == new_contact.firstName) & (existing_df['lastName'] == new_contact.lastName)].empty:
                 raise HTTPException(status_code=409, detail=f"Un contact nommé {new_contact.firstName} {new_contact.lastName} existe déjà.")
            
            combined_df = pd.concat([existing_df, new_contact_df], ignore_index=True)
        else:
            combined_df = new_contact_df
        
        combined_df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
        print(f"[API POST /contacts] Contact créé avec ID: {new_id}")
        return new_contact
    except HTTPException:
        raise
    except Exception as e:
        print(f"[API POST /contacts] Erreur lors de la création du contact : {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur lors de la création du contact: {str(e)}")

@app.patch("/contacts/{contact_id}", response_model=ContactInDB, summary="Mettre à jour un contact existant")
async def update_contact(contact_id: str, contact_update_data: ContactUpdate) -> ContactInDB:
    if not CONTACTS_STORAGE_FILE.exists() or CONTACTS_STORAGE_FILE.stat().st_size == 0:
        raise HTTPException(status_code=404, detail=f"Aucun contact à mettre à jour. Le fichier de stockage est vide ou n'existe pas.")

    try:
        df = pd.read_parquet(CONTACTS_STORAGE_FILE)
        contact_index = df.index[df['id'] == contact_id].tolist()

        if not contact_index:
            raise HTTPException(status_code=404, detail=f"Contact avec ID {contact_id} non trouvé.")
        
        idx = contact_index[0]

        # Mettre à jour uniquement les champs fournis dans update_data_dict
        update_data_dict = contact_update_data.model_dump(exclude_unset=True)
        
        # Formater le numéro de téléphone s'il est présent dans les données de mise à jour
        if 'phoneNumber' in update_data_dict and update_data_dict['phoneNumber'] is not None: # AJOUT: conditionner le formatage
            update_data_dict['phoneNumber'] = format_phone_number(update_data_dict['phoneNumber'])
            # Si le formatage retourne None et que le champ était explicitement envoyé à None,
            # il sera stocké comme None (ou chaîne vide si le DataFrame l'impose plus tard, à vérifier).
            # Si le formatage retourne None pour un numéro invalide qui n'était pas None,
            # il sera aussi stocké comme None.
        elif 'phoneNumber' in update_data_dict and update_data_dict['phoneNumber'] is None:
            # Permettre de mettre explicitement le numéro de téléphone à None
             update_data_dict['phoneNumber'] = None

        if not update_data_dict: # Si aucun champ n'est fourni pour la mise à jour
            # On pourrait retourner le contact existant sans modification ou une erreur 304 Not Modified
            # Pour l'instant, nous allons récupérer et retourner le contact existant.
            # Ou lever une HTTPException si l'on considère que c'est une requête invalide.
            existing_contact_data = df.loc[idx].to_dict()
            for key, value in existing_contact_data.items():
                if pd.isna(value):
                    existing_contact_data[key] = None
            return ContactInDB(**existing_contact_data)

        # Logique de vérification des doublons d'email (si l'email est en cours de modification)
        if 'email' in update_data_dict and update_data_dict['email'] is not None: # S'assurer que l'email est fourni et non None
            new_email = update_data_dict['email']
            current_email = df.loc[idx, 'email']
            if new_email != current_email and not df[df['email'] == new_email].empty:
                raise HTTPException(status_code=409, detail=f"Un autre contact avec l'email {new_email} existe déjà.")
        
        # Appliquer les mises à jour au DataFrame
        for field, value in update_data_dict.items():
            # Autoriser les valeurs NULL pour tous les champs liés aux dates et heures
            if value is not None or field == 'phoneNumber' or field == 'callStartTime' or field == 'email' or field.startswith('date') or field.startswith('heure'):
                df.loc[idx, field] = value
            # Pour les autres champs que phoneNumber, si la valeur est None et qu'ils ne peuvent pas être None,
            # on pourrait vouloir les ignorer ou les convertir en une chaîne vide (déjà géré par Pydantic ou DataFrame?)
            # Actuellement, on permet de mettre à jour avec None si le modèle Pydantic le permet.

        df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
        
        updated_contact_data = df.loc[idx].to_dict()
        # Assurer que les champs None sont bien None et pas NaN pour Pydantic
        for key, value in updated_contact_data.items():
            if pd.isna(value):
                updated_contact_data[key] = None
        
        print(f"[API PUT /contacts] Contact avec ID {contact_id} mis à jour avec {update_data_dict}.")
        return ContactInDB(**updated_contact_data)

    except HTTPException: # Re-lever les HTTPException
        raise
    except Exception as e:
        print(f"[API PUT /contacts] Erreur lors de la mise à jour du contact {contact_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur lors de la mise à jour du contact: {str(e)}")

@app.delete("/contacts/all", status_code=status.HTTP_204_NO_CONTENT)
async def clear_all_contacts():
    """
    Supprime toutes les données de contacts (le fichier contacts_storage.parquet).
    """
    try:
        if os.path.exists(CONTACTS_STORAGE_FILE):
            os.remove(CONTACTS_STORAGE_FILE)
            print(f"[API] Fichier {CONTACTS_STORAGE_FILE} supprimé.")
            return Response(status_code=status.HTTP_204_NO_CONTENT)
        else:
            print(f"[API] Fichier {CONTACTS_STORAGE_FILE} non trouvé, aucune action de suppression nécessaire.")
            return Response(status_code=status.HTTP_204_NO_CONTENT)
    except Exception as e:
        print(f"[API] Erreur lors de la suppression du fichier {CONTACTS_STORAGE_FILE}: {e}")
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Erreur interne du serveur lors de la suppression des données.")

@app.delete("/contacts/{contact_id}", status_code=204, summary="Supprimer un contact")
async def delete_contact(contact_id: str):
    if not CONTACTS_STORAGE_FILE.exists() or CONTACTS_STORAGE_FILE.stat().st_size == 0:
        raise HTTPException(status_code=404, detail=f"Aucun contact à supprimer. Le fichier de stockage est vide ou n'existe pas.")

    try:
        df = pd.read_parquet(CONTACTS_STORAGE_FILE)
        
        original_count = len(df)
        df = df[df['id'] != contact_id]

        if len(df) == original_count:
            raise HTTPException(status_code=404, detail=f"Contact avec ID {contact_id} non trouvé.")
        
        if df.empty:
            df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
        else:
            df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
        
        print(f"[API DELETE /contacts] Contact avec ID {contact_id} supprimé.")
        return

    except HTTPException:
        raise
    except Exception as e:
        print(f"[API DELETE /contacts] Erreur lors de la suppression du contact {contact_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Erreur interne du serveur lors de la suppression du contact: {str(e)}")

@app.get("/")
async def read_root():
    return {"message": "API for ADB Interaction"}

@app.post("/call/end", summary="Terminer un appel téléphonique et enregistrer sa durée")
async def end_call(end_call_request: EndCallRequest):
    contact_id = end_call_request.contact_id
    call_start_time_str_from_client = end_call_request.call_start_time
    measured_duration_seconds_from_client = end_call_request.measured_duration_seconds
    
    print(f"[API /call/end] Requête pour terminer l'appel pour le contact ID: {contact_id}")
    print(f"[API /call/end] Heure de début d'appel reçue (string du client): {call_start_time_str_from_client}")
    print(f"[API /call/end] Durée mesurée par le client (secondes): {measured_duration_seconds_from_client}")
    
    try:
        command = ["adb", "shell", "input", "keyevent", "KEYCODE_ENDCALL"]
        print(f"[API /call/end] Exécution de la commande ADB : {' '.join(command)}")
        
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        # stdout, stderr = await process.communicate()

        call_end_time_utc_aware = datetime.now(timezone.utc) # Toujours utile pour savoir quand la requête est arrivée
        print(f"[API /call/end] Heure de réception requête /fin (serveur, UTC aware): {call_end_time_utc_aware.isoformat()}")

        formatted_duration: str
        final_duration_seconds: float

        if measured_duration_seconds_from_client is not None and measured_duration_seconds_from_client >= 0:
            print(f"[API /call/end] Utilisation de la durée fournie par le client: {measured_duration_seconds_from_client}s")
            final_duration_seconds = float(measured_duration_seconds_from_client)
            formatted_duration = format_duration(final_duration_seconds)
        else:
            print(f"[API /call/end] Durée client non fournie ou invalide. Fallback sur calcul par timestamps.")
            # Fallback: Calculer la durée avec les timestamps (susceptible au problème de synchro serveur)
            start_time_utc_aware = None
            try:
                if call_start_time_str_from_client.endswith('Z'):
                    dt_str_iso_compatible = call_start_time_str_from_client[:-1] + "+00:00"
                    start_time_utc_aware = datetime.fromisoformat(dt_str_iso_compatible)
                else:
                    start_time_utc_aware = datetime.fromisoformat(call_start_time_str_from_client)
                
                if start_time_utc_aware.tzinfo is None:
                    start_time_utc_aware = start_time_utc_aware.replace(tzinfo=timezone.utc)
                else:
                    start_time_utc_aware = start_time_utc_aware.astimezone(timezone.utc)
                print(f"[API /call/end Fallback] Heure de début parsée (client, UTC aware): {start_time_utc_aware.isoformat()}")

                duration_delta = call_end_time_utc_aware - start_time_utc_aware
                calculated_duration_seconds = duration_delta.total_seconds()
                print(f"[API /call/end Fallback] Durée calculée (brute en secondes): {calculated_duration_seconds}")

                if calculated_duration_seconds < 0:
                    print(f"[API /call/end Fallback CRITICAL WARNING] Durée d'appel NÉGATIVE ({calculated_duration_seconds}s) détectée.")
                    # ... (logs d'avertissement comme avant) ...
                    print(f"                     La durée sera fixée à 0 secondes.")
                    final_duration_seconds = 0.0
                else:
                    final_duration_seconds = calculated_duration_seconds
                
                formatted_duration = format_duration(final_duration_seconds)

            except ValueError as ve_iso:
                print(f"[API /call/end Fallback] Échec du parsing ISO pour '{call_start_time_str_from_client}': {ve_iso}.")
                print(f"[API /call/end Fallback] Utilisation d'une durée par défaut de 0s car fallback a échoué.")
                final_duration_seconds = 0.0
                formatted_duration = format_duration(final_duration_seconds) # Sera "00:00"

        print(f"[API /call/end] Durée finale retenue et formatée: {formatted_duration} ({final_duration_seconds:.2f}s)")
            
        # Mettre à jour les données du contact (logique inchangée, utilise formatted_duration)
        # ... (code de mise à jour du contact comme avant) ...
        updated_contact_object_for_response = None
        if contact_id:
            try:
                if not CONTACTS_STORAGE_FILE.exists():
                    print(f"[API /call/end] Fichier de stockage {CONTACTS_STORAGE_FILE} non trouvé. Impossible de mettre à jour le contact.")
                else:
                    df = pd.read_parquet(CONTACTS_STORAGE_FILE)
                    if contact_id not in df['id'].values:
                        print(f"[API /call/end] Contact avec ID {contact_id} non trouvé. Impossible de mettre à jour la durée.")
                    else:
                        contact_index = df[df['id'] == contact_id].index[0]
                        df.at[contact_index, 'dureeAppel'] = formatted_duration
                        df.to_parquet(CONTACTS_STORAGE_FILE, index=False)
                        print(f"[API /call/end] Durée d'appel de {formatted_duration} enregistrée pour le contact ID {contact_id}")
                        
                        updated_contact_row = df.loc[contact_index].to_dict()
                        for key, value in updated_contact_row.items():
                            if pd.isna(value): updated_contact_row[key] = None
                        updated_contact_object_for_response = updated_contact_row
            
            except Exception as update_error:
                print(f"[API /call/end] Erreur lors de la mise à jour du contact: {update_error}")

        response_data = {
            "message": "Appel terminé et durée enregistrée",
            "contact_id": contact_id,
            "call_start_time": call_start_time_str_from_client, # On renvoie ce qu'on a reçu
            "call_end_time": call_end_time_utc_aware.isoformat(), 
            "duration": formatted_duration,
            "contact": updated_contact_object_for_response 
        }
        print(f"[API /call/end] Données de réponse prêtes à être envoyées : {response_data}")
        return response_data
            
    except FileNotFoundError:
        print("[API] Erreur: Commande ADB non trouvée. Assurez-vous qu'ADB est installé et dans le PATH.")
        raise HTTPException(status_code=500, detail="Commande ADB non trouvée. Assurez-vous qu'ADB est installé et dans le PATH.")
    except Exception as e:
        print(f"[API] Erreur inattendue lors de la fin de l'appel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/call/status", summary="Vérifier si un appel est en cours")
async def check_call_status():
    """
    Vérifie via ADB si un appel téléphonique est en cours.
    Retourne le statut de l'appel (en cours ou non).
    """
    print("[API GET /call/status] Requête pour vérifier si un appel est en cours")
    try:
        # Utiliser dumpsys telephony.registry pour vérifier l'état de l'appel
        command = ["adb", "shell", "dumpsys", "telephony.registry"]
        print(f"[API GET /call/status] Exécution de la commande ADB : {' '.join(command)}")
        
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE
        )
        stdout, stderr = await process.communicate()
        
        if process.returncode == 0:
            output = stdout.decode('utf-8', errors='replace')
            # Chercher des indicateurs d'un appel en cours
            call_in_progress = False
            call_state_line = None
            call_state = None
            
            for line in output.splitlines():
                if "mCallState" in line:
                    call_state_line = line.strip()
                    # mCallState généralement à 0 si pas d'appel, 1 si sonnerie en cours, 2 si appel en cours
                    # Extrait la valeur numérique
                    try:
                        call_state_parts = call_state_line.split("=")
                        if len(call_state_parts) >= 2:
                            call_state = int(call_state_parts[1].strip())
                            call_in_progress = call_state > 0  # 1 = sonnerie, 2 = appel en cours
                            break
                    except ValueError:
                        continue
            
            # Si nous n'avons pas trouvé mCallState, essayer d'autres méthodes de détection
            if call_state_line is None:
                # Essayer avec une autre commande pour plus de certitude
                print("[API GET /call/status] Méthode principale échouée, tentative alternative...")
                try:
                    alt_output = run_adb_command(["shell", "dumpsys", "telecom"], timeout_seconds=5)
                    call_in_progress = "ongoing call" in alt_output.lower() or "active connections" in alt_output.lower()
                    print(f"[API GET /call/status] Détection alternative: appel en cours = {call_in_progress}")
                except Exception as alt_error:
                    print(f"[API GET /call/status] Erreur lors de la détection alternative: {alt_error}")
            
            print(f"[API GET /call/status] Résultat: appel en cours = {call_in_progress}, état = {call_state}")
            
            return {
                "status": "success",
                "call_in_progress": call_in_progress,
                "call_state": call_state,
                "call_state_raw": call_state_line if call_state_line else "Non trouvé"
            }
        else:
            error_message = stderr.decode('utf-8', errors='replace') if stderr else "Erreur ADB inconnue"
            print(f"[API GET /call/status] Erreur lors de la commande ADB. Error: {error_message}")
            raise HTTPException(status_code=500, detail=f"Erreur ADB: {error_message}")
            
    except FileNotFoundError:
        print("[API GET /call/status] Erreur: Commande ADB non trouvée.")
        raise HTTPException(status_code=500, detail="Commande ADB non trouvée.")
    except Exception as e:
        print(f"[API GET /call/status] Erreur inattendue lors de la vérification du statut d'appel: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# Fonction utilitaire pour formater la durée
def format_duration(seconds):
    """Formate une durée en secondes au format MM:SS ou HH:MM:SS"""
    minutes, seconds = divmod(int(seconds), 60)
    hours, minutes = divmod(minutes, 60)
    
    if hours > 0:
        return f"{hours:02d}:{minutes:02d}:{seconds:02d}"
    else:
        return f"{minutes:02d}:{seconds:02d}"

# Future ADB related endpoints will go here

# --- Points de terminaison de l'API ---

@app.post("/adb/hangup", summary="Terminer un appel téléphonique via ADB")
async def adb_hangup_call(request_body: Optional[HangUpRequest] = Body(None)): # request_body peut être None
    contact_id_info = ""
    contact_id = None
    if request_body and request_body.contact_id:
        contact_id = request_body.contact_id
        contact_id_info = f" (Info contact ID: {contact_id})"
    
    print(f"[API POST /adb/hangup] Requête pour raccrocher l'appel{contact_id_info}.")
    # Obtenir l'heure de fin d'appel UTC effective AVANT d'envoyer la commande ADB, au cas où la commande prend du temps
    # ou pour avoir une référence temporelle si la commande elle-même ne retourne pas d'heure.
    effective_hang_up_time_utc = datetime.now(timezone.utc)
    
    try:
        # Commande ADB pour raccrocher. KEYCODE_ENDCALL est un bon point de départ.
        print(f"[API DEBUG /adb/hangup] Envoi de la commande KEYCODE_ENDCALL via ADB{contact_id_info}")
        run_adb_command(["shell", "input", "keyevent", "KEYCODE_ENDCALL"])
        
        # Vérifier si l'appel est vraiment terminé
        print(f"[API DEBUG /adb/hangup] Vérification que l'appel est bien terminé{contact_id_info}")
        try:
            call_status_output = run_adb_command(["shell", "dumpsys", "telephony.registry"], timeout_seconds=8)
            call_active = "mCallState=2" in call_status_output  # 2 = CALL_STATE_OFFHOOK
            if call_active:
                print(f"[API DEBUG /adb/hangup] Première tentative échouée, l'appel semble toujours actif. Tentative de secours{contact_id_info}")
                # Seconde tentative avec une autre méthode
                run_adb_command(["shell", "input", "keyevent", "KEYCODE_POWER"], timeout_seconds=5) # Appuyer sur Power peut parfois interrompre un appel
                run_adb_command(["shell", "input", "keyevent", "KEYCODE_ENDCALL"], timeout_seconds=5) # Réessayer avec ENDCALL
                
                # Vérifier à nouveau
                call_status_output = run_adb_command(["shell", "dumpsys", "telephony.registry"], timeout_seconds=8)
                call_still_active = "mCallState=2" in call_status_output
                if call_still_active:
                    print(f"[API DEBUG /adb/hangup] ATTENTION: L'appel semble toujours actif après seconde tentative{contact_id_info}")
                else:
                    print(f"[API DEBUG /adb/hangup] Seconde tentative réussie, l'appel est bien terminé{contact_id_info}")
            else:
                print(f"[API DEBUG /adb/hangup] L'appel a été correctement terminé à la première tentative{contact_id_info}")
        except Exception as verify_error:
            print(f"[API DEBUG /adb/hangup] Erreur lors de la vérification du statut d'appel: {str(verify_error)}")
            # On continue même s'il y a une erreur dans la vérification
        
        # Après que la commande de raccrochage ADB a été envoyée (et supposée réussie par run_adb_command)
        message = f"Commande de raccrochage envoyée avec succès{contact_id_info}."
        
        # AJOUT: Si nous avons un ID de contact, mettre à jour les informations d'appel
        updated_contact = None
        if contact_id:
            try:
                # Récupérer le contact par ID
                contact = find_contact_by_id(contact_id)
                if contact:
                    # Convertir l'heure de fin d'appel au fuseau de Paris pour l'affichage
                    hang_up_time_paris = effective_hang_up_time_utc.astimezone(PARIS_TZ)
                    
                    # Formater la date et l'heure pour l'affichage (dd/mm/yyyy et HH:MM:SS)
                    dateAppel = hang_up_time_paris.strftime("%d/%m/%Y")
                    heureAppel = hang_up_time_paris.strftime("%H:%M:%S")
                    
                    # Calculer la durée de l'appel si nous avons une heure de début
                    dureeAppel = None
                    if contact.get('callStartTime'):
                        try:
                            # Convertir callStartTime en datetime pour calculer la durée
                            call_start_time_utc = datetime.fromisoformat(contact['callStartTime'].replace('Z', '+00:00'))
                            
                            # Calculer la durée en secondes
                            duration_seconds = (effective_hang_up_time_utc - call_start_time_utc).total_seconds()
                            
                            # Formater la durée en MM:SS
                            dureeAppel = format_duration(int(duration_seconds))
                            
                            print(f"[API DEBUG /adb/hangup] Durée calculée: {dureeAppel} pour l'appel du contact {contact_id}")
                        except Exception as e:
                            print(f"[API DEBUG /adb/hangup] Erreur lors du calcul de la durée: {str(e)}")
                    
                    # Créer l'objet de mise à jour du contact
                    contact_update = ContactUpdate(
                        dateAppel=dateAppel,
                        heureAppel=heureAppel,
                        dureeAppel=dureeAppel
                    )
                    
                    # Mettre à jour le contact dans le stockage
                    contacts = load_contacts_from_storage()
                    for c in contacts:
                        if c["id"] == contact_id:
                            # Mise à jour des champs spécifiés dans contact_update
                            if contact_update.dateAppel is not None:
                                c["dateAppel"] = contact_update.dateAppel
                            if contact_update.heureAppel is not None:
                                c["heureAppel"] = contact_update.heureAppel
                            if contact_update.dureeAppel is not None:
                                c["dureeAppel"] = contact_update.dureeAppel
                            updated_contact = c
                            break
                    
                    if updated_contact:
                        # Sauvegarder les modifications
                        save_contacts_to_storage(contacts)
                        print(f"[API DEBUG /adb/hangup] Contact {contact_id} mis à jour avec succès")
                        message = f"Appel terminé et durée enregistrée pour le contact {contact_id}"
                    else:
                        print(f"[API DEBUG /adb/hangup] Contact {contact_id} non trouvé dans le stockage après récupération")
                else:
                    print(f"[API DEBUG /adb/hangup] Contact {contact_id} non trouvé")
            except Exception as e:
                print(f"[API DEBUG /adb/hangup] Erreur lors de la mise à jour du contact {contact_id}: {str(e)}")
        
        print(f"[API POST /adb/hangup] {message}")
        
        response_data = {
            "message": message, 
            "status": "success",
            "hang_up_time_utc": effective_hang_up_time_utc.isoformat() # Renvoyer l'heure de fin
        }
        
        # Ajouter le contact mis à jour à la réponse s'il existe
        if updated_contact:
            response_data["contact"] = updated_contact
        
        return response_data
    except HTTPException as e:
        # Rediffuser l'exception HTTP si elle vient de run_adb_command
        # ou la transformer si nécessaire
        # e.g., if e.status_code == 500 and "ADB non trouvé" in e.detail:
        #   raise HTTPException(status_code=503, detail="Service ADB non disponible pour le raccrochage.")
        raise e 
    except Exception as e: # Gérer d'autres exceptions non-HTTPException
        error_message = f"Erreur serveur lors de la tentative de raccrochage via ADB: {str(e)}"
        print(f"[API POST /adb/hangup] ERREUR: {error_message}")
        raise HTTPException(status_code=500, detail=error_message)

@app.get("/contacts/{contact_id}", response_model=ContactInDB, summary="Récupérer un contact par son ID")
async def get_contact_by_id_endpoint(contact_id: str = FastAPIPath(..., title="L'ID du contact à récupérer", min_length=1)):
    print(f"[API GET /contacts/{{contact_id}}] Requête pour récupérer le contact ID: {contact_id}")
    contact = find_contact_by_id(contact_id) 
    if not contact:
        print(f"[API GET /contacts/{{contact_id}}] Contact ID: {contact_id} non trouvé.")
        raise HTTPException(status_code=404, detail=f"Contact avec ID {contact_id} non trouvé")
    print(f"[API GET /contacts/{{contact_id}}] Contact trouvé: {contact.get('firstName', 'N/A')}")
    return ContactInDB(**contact) # Assurer la conformité avec le modèle de réponse

# --- Exécution de l'application (pour débogage local) ---
if __name__ == "__main__":
    # Décommentez pour exécuter le planificateur en arrière-plan avec l'application
    # asyncio.create_task(run_scheduler()) 
    # uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")
    pass 

# --- Fonctions de gestion de l'autosauvegarde ---
def save_to_autosave_file(csv_data: str, file_path: str) -> bool:
    """
    Enregistre les données CSV dans le fichier d'autosauvegarde.
    
    Args:
        csv_data: Le contenu CSV à sauvegarder
        file_path: Le chemin relatif du fichier à créer/mettre à jour
    
    Returns:
        bool: True si la sauvegarde a réussi, False sinon
    """
    try:
        # Nettoyer le chemin pour éviter les problèmes de sécurité
        relative_path = file_path.strip('/')
        # Construire le chemin absolu dans le dossier Autosave
        target_path = AUTOSAVE_DIR / relative_path
        
        # Créer les répertoires intermédiaires si nécessaire
        target_path.parent.mkdir(parents=True, exist_ok=True)
        
        # Supprimer les lignes vides superflues
        lines = csv_data.splitlines()
        non_empty_lines = [line for line in lines if line.strip()]
        clean_csv_data = '\n'.join(non_empty_lines)
        
        # Écrire le fichier
        with open(target_path, 'w', encoding='utf-8') as f:
            f.write(clean_csv_data)
        
        print(f"[Autosave] Fichier sauvegardé avec succès: {target_path}")
        return True
    except Exception as e:
        print(f"[Autosave] Erreur lors de la sauvegarde du fichier {file_path}: {e}")
        return False

# --- Endpoint pour l'autosauvegarde ---
@app.post("/api/autosave", status_code=status.HTTP_200_OK)
async def autosave_contacts(
    csvData: str = Form(..., description="Données CSV des contacts"),
    path: str = Form(..., description="Chemin relatif du fichier à sauvegarder")
):
    """
    Enregistre les données CSV dans le fichier d'autosauvegarde.
    
    Returns:
        dict: Message de confirmation avec le statut de l'opération
    """
    try:
        if not csvData:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Aucune donnée CSV fournie"
            )
        
        success = save_to_autosave_file(csvData, path)
        
        if success:
            return {"message": "Fichier d'autosauvegarde enregistré avec succès"}
        else:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Erreur lors de la sauvegarde du fichier"
            )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur inattendue: {str(e)}"
        )

# --- Endpoint pour vérifier si un fichier d'autosauvegarde existe ---
@app.head("/Autosave/{file_path:path}")
async def check_autosave_file_exists(file_path: str):
    """
    Vérifie si un fichier d'autosauvegarde existe.
    
    Args:
        file_path: Chemin relatif du fichier à vérifier
    
    Returns:
        Response: Vide avec code 200 si le fichier existe, 404 sinon
    """
    try:
        # Nettoyer le chemin pour éviter les problèmes de sécurité
        file_path = Path(file_path).name  # Ne garder que le nom du fichier
        target_path = AUTOSAVE_DIR / file_path
        
        if target_path.exists() and target_path.is_file():
            return Response(status_code=status.HTTP_200_OK)
        else:
            return Response(status_code=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"[Autosave] Erreur lors de la vérification du fichier {file_path}: {e}")
        return Response(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR)

# --- Endpoint pour récupérer un fichier d'autosauvegarde ---
@app.get("/Autosave/{file_path:path}")
async def get_autosave_file(file_path: str):
    """
    Récupère un fichier d'autosauvegarde.
    
    Args:
        file_path: Chemin relatif du fichier à récupérer
    
    Returns:
        FileResponse: Le contenu du fichier
    """
    try:
        # Nettoyer le chemin pour éviter les problèmes de sécurité
        file_path = Path(file_path).name  # Ne garder que le nom du fichier
        target_path = AUTOSAVE_DIR / file_path
        
        if target_path.exists() and target_path.is_file():
            return FileResponse(target_path)
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Fichier {file_path} non trouvé"
            )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Erreur lors de la récupération du fichier: {str(e)}"
        )

# Ajout d'un endpoint /health pour vérifier que l'API est en ligne
@app.get("/health", summary="Vérifier la santé de l'API")
async def health_check():
    return {"status": "OK"} 