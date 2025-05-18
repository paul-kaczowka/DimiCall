'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Contact } from '@/types/contact'; // Assurez-vous que ce type est correct
import Papa from 'papaparse';
import { toast } from 'react-toastify';

const FILE_HANDLE_KEY = 'contactsFileHandle';

// Constants pour le système d'autosauvegarde
const AUTOSAVE_FILENAME = 'contacts-autosave.csv';
const API_URL = 'http://localhost:8000';
const AUTOSAVE_ENDPOINT = `/Autosave/${AUTOSAVE_FILENAME}`;
const AUTOSAVE_ENABLED_KEY = 'autosaveEnabled';

function isSafari(): boolean {
  if (typeof window === 'undefined') return false; // Vérification pour SSR si jamais utilisé côté serveur
  const ua = window.navigator.userAgent;
  const isSafariBrowser = /^((?!chrome|android).)*safari/i.test(ua);
  // Exclure Chrome, Edge, et autres navigateurs basés sur Chromium qui pourraient avoir "Safari" dans l'UA
  const isChrome = /chrome/i.test(ua);
  const isEdge = /edg/i.test(ua); // Edge Chromium
  // Les iPads récents peuvent masquer leur UA comme un Mac Safari
  const isIOS = /iPad|iPhone|iPod/.test(ua) && !((window as Window & typeof globalThis & { MSStream?: unknown }).MSStream);

  if (isIOS) return true; // Sur iOS, c'est WebKit (Safari)
  if (isSafariBrowser && !isChrome && !isEdge) return true;
  
  return false;
}

// Types pour l'API File System Access
// (Ces interfaces peuvent être étendues ou provenir d'une bibliothèque de types comme @types/wicg-file-system-access)
interface FileSystemFileHandle {
  createWritable: (options?: FileSystemWritableFileStreamOptions) => Promise<FileSystemWritableFileStream>;
  queryPermission: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  requestPermission: (descriptor?: FileSystemHandlePermissionDescriptor) => Promise<PermissionState>;
  readonly kind: 'file';
  readonly name: string;
}

interface FileSystemWritableFileStream extends WritableStream {
  write: (data: FileSystemWriteChunkType) => Promise<void>;
  seek: (position: number) => Promise<void>;
  truncate: (size: number) => Promise<void>;
  close: () => Promise<void>;
}

interface FileSystemWritableFileStreamOptions {
  keepExistingData?: boolean;
}

interface FileSystemHandlePermissionDescriptor {
  mode?: 'read' | 'readwrite';
}

type FileSystemWriteChunkType = BufferSource | Blob | string | WriteParams;

interface WriteParams {
  type: 'write' | 'seek' | 'truncate';
  data?: BufferSource | Blob | string;
  position?: number;
  size?: number;
}

// Déclarations supplémentaires pour TypeScript (APIs expérimentales)
declare global {
  // Interfaces expérimentales sans conflit
  interface FileSystemHandlePolyfill {
    name: string;
    kind: string;
    serialize?(): Promise<unknown>;
  }
  
  interface FileSystemFileHandlePolyfill extends FileSystemHandlePolyfill {
    createWritable(options?: { keepExistingData?: boolean }): Promise<FileSystemWritableFileStream>;
    queryPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    requestPermission(descriptor?: { mode?: 'read' | 'readwrite' }): Promise<PermissionState>;
    getFile(): Promise<File>;
  }
  
  // Extension pour le constructeur File System Handle
  interface FileSystemHandleConstructorPolyfill {
    deserialize(serialized: unknown): Promise<FileSystemFileHandlePolyfill>;
  }
  
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
    FileSystemHandle?: FileSystemHandleConstructorPolyfill;
  }
}

// Type utilitaire pour contourner les erreurs TypeScript avec les APIs expérimentales
type ExperimentalFileHandle = FileSystemFileHandle & {
  serialize?: () => Promise<unknown>;
  getFile?: () => Promise<File>;
};

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept?: Record<string, string | string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
}

export function useAutosaveFile(getContactsData: () => Promise<Contact[]>) {
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSafariDetected, setIsSafariDetected] = useState(false);
  const [isFileSystemAccessSupported, setIsFileSystemAccessSupported] = useState(false);
  const lastSavedDataRef = useRef<string | null>(null);
  const lastSavedContactsRef = useRef<Contact[] | null>(null);
  const filePickerInProgressRef = useRef<boolean>(false);
  const [isAutoSaveRestored, setIsAutoSaveRestored] = useState(false);
  const useLocalFileSystem = true;

  // Vérifier si un fichier d'autosauvegarde existe déjà au démarrage
  useEffect(() => {
    const checkExistingAutosaveFile = async () => {
      try {
        // Vérifier si le fichier existe dans le dossier Autosave
        const response = await fetch(`${API_URL}${AUTOSAVE_ENDPOINT}?t=${new Date().getTime()}`, { method: 'HEAD' });
        
        if (response.ok) {
          console.info("Fichier d'autosauvegarde existant détecté");
          setIsAutoSaveRestored(true);
          
          // Notifier l'utilisateur que l'autosauvegarde est activée
          toast.info("Autosauvegarde activée: un fichier de sauvegarde existant a été détecté", {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
          
          // Tenter de lire et analyser le fichier existant (pour initialiser lastSavedDataRef)
          try {
            const fileResponse = await fetch(`${API_URL}${AUTOSAVE_ENDPOINT}`);
            const csvText = await fileResponse.text();
            lastSavedDataRef.current = csvText;
          } catch (error) {
            console.warn("Impossible de lire le contenu du fichier d'autosauvegarde existant", error);
          }
          
          localStorage.setItem(AUTOSAVE_ENABLED_KEY, 'true');
          return true;
        }
      } catch (error) {
        console.warn("Erreur lors de la vérification du fichier d'autosauvegarde", error);
      }
      
      return false;
    };

    // Déterminer le support de l'API File System Access
    const safari = isSafari();
    setIsSafariDetected(safari);
    const fsaSupported = !!window.showSaveFilePicker;
    setIsFileSystemAccessSupported(fsaSupported);

    // Si l'autosauvegarde était activée dans la session précédente
    const wasEnabled = localStorage.getItem(AUTOSAVE_ENABLED_KEY) === 'true';
    
    if (wasEnabled) {
      checkExistingAutosaveFile().then(exists => {
        if (exists) {
          setIsAutoSaveRestored(true);
        } else {
          // Notifier l'utilisateur que l'autosauvegarde est en attente de configuration
          toast.info("Autosauvegarde non configurée: aucun fichier de sauvegarde existant", {
            position: "top-right",
            autoClose: 5000,
            hideProgressBar: false,
            closeOnClick: true,
            pauseOnHover: true,
            draggable: true,
          });
        }
      });
    }
  }, []);

  // Nouvelle fonction pour sauvegarder dans le système de fichiers local
  const saveToLocalFileSystem = useCallback(async (contacts: Contact[]) => {
    try {
      // Générer le CSV avec Papa.unparse
      const csvData = Papa.unparse(contacts);
      
      // S'assurer qu'il n'y a pas de lignes vides dans le CSV
      const lines = csvData.split('\n');
      const nonEmptyLines = lines.filter(line => line.trim());
      const cleanCsvData = nonEmptyLines.join('\n');
      
      // Pour les besoins du développement, simulons une sauvegarde locale
      // Dans un environnement de production, cela devrait être remplacé par une requête fetch POST
      console.info(`[Autosave] Sauvegarde de ${contacts.length} contacts dans ${AUTOSAVE_FILENAME}`);
      
      // Exemple de code pour envoyer au backend (décommenté en production)
      const formData = new FormData();
      formData.append('csvData', cleanCsvData);
      formData.append('path', AUTOSAVE_FILENAME);
      
      const response = await fetch(`${API_URL}/api/autosave`, {
        method: 'POST',
        body: formData
      });
      
      if (!response.ok) {
        throw new Error(`Erreur lors de la sauvegarde: ${response.statusText}`);
      }
      
      lastSavedDataRef.current = cleanCsvData;
      return true;
    } catch (error) {
      console.error("Erreur lors de la sauvegarde dans le système de fichiers local:", error);
      setError(`Erreur lors de la sauvegarde locale: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }, []);

  // Fonction modifiée pour demander le fichier (ou utiliser le dossier local)
  const requestFileHandle = useCallback(async () => {
    if (useLocalFileSystem) {
      // Utiliser le dossier Autosave local
      setIsAutoSaveRestored(true);
      localStorage.setItem(AUTOSAVE_ENABLED_KEY, 'true');
      return { name: AUTOSAVE_FILENAME } as FileSystemFileHandle;
    }
    
    // Si on préfère l'API File System Access
    if (isSafariDetected || !isFileSystemAccessSupported) {
      setError(isSafariDetected ? "Fonctionnalité non supportée sur Safari." : "L'API File System Access n'est pas supportée par ce navigateur.");
      return null;
    }
    
    if (!window.showSaveFilePicker) {
        console.warn("showSaveFilePicker n'est pas disponible bien que isFileSystemAccessSupported soit vrai. Cela ne devrait pas arriver.");
        setError("L'API File System Access n'est pas disponible (incohérence détectée).");
        return null;
    }
    
    if (filePickerInProgressRef.current) {
      console.log('Une sélection de fichier est déjà en cours, ignoré.');
      return null;
    }
    
    filePickerInProgressRef.current = true;
    
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: AUTOSAVE_FILENAME,
        types: [
          {
            description: 'Fichier CSV',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      });
      localStorage.setItem(FILE_HANDLE_KEY, 'true'); 
      localStorage.setItem(AUTOSAVE_ENABLED_KEY, 'true');
      setFileHandle(handle);
      setError(null);
      return handle;
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        console.info('Sélection de fichier annulée par l\'utilisateur.');
        setError(null);
      } else if (err instanceof Error) {
        console.error('Erreur lors de la demande de handle de fichier:', err);
        setError(`Erreur lors de la sélection du fichier: ${err.message}`);
      } else {
        console.error('Erreur inconnue lors de la demande de handle de fichier:', err);
        setError('Erreur inconnue lors de la sélection du fichier.');
      }
      return null;
    } finally {
      setTimeout(() => {
        filePickerInProgressRef.current = false;
      }, 500);
    }
  }, [isSafariDetected, isFileSystemAccessSupported, useLocalFileSystem]);

  // Fonction pour comparer deux listes de contacts et vérifier s'il y a des changements
  const hasContactsChanged = useCallback(async (newContacts: Contact[]): Promise<boolean> => {
    if (!lastSavedContactsRef.current) return true; // Premier enregistrement
    
    // Si le nombre de contacts est différent, il y a eu un changement
    if (lastSavedContactsRef.current.length !== newContacts.length) return true;
    
    // Créer une map d'ID pour recherche rapide
    const savedContactsMap = new Map(
      lastSavedContactsRef.current.map(contact => [contact.id, contact])
    );
    
    // Vérifier si des contacts ont été modifiés
    for (const contact of newContacts) {
      const savedContact = savedContactsMap.get(contact.id);
      
      // Si ce contact n'existe pas dans la sauvegarde précédente
      if (!savedContact) return true;
      
      // Comparer les propriétés pour détecter des modifications
      for (const key in contact) {
        if (key === 'id') continue; // Ignorer l'ID pour la comparaison
        
        // @ts-expect-error - on compare dynamiquement les propriétés
        if (contact[key] !== savedContact[key]) {
          return true;
        }
      }
    }
    
    // Aucune modification détectée
    return false;
  }, []);

  const saveFile = useCallback(async (currentFileHandle: FileSystemFileHandle | null, dataToSave?: Contact[], forceSave = false) => {
    // Si on utilise le système de fichiers local (par défaut)
    if (useLocalFileSystem) {
      setIsSaving(true);
      setError(null);
      
      try {
        const contacts = dataToSave || await getContactsData();
        
        // Vérifier s'il y a des changements avant de sauvegarder
        if (!forceSave) {
          const hasChanges = await hasContactsChanged(contacts);
          if (!hasChanges) {
            console.info('Aucun changement détecté, sauvegarde ignorée.');
            setIsSaving(false);
            return;
          }
        }
        
        const result = await saveToLocalFileSystem(contacts);
        
        if (result) {
          console.info('Fichier sauvegardé avec succès dans le dossier Autosave.');
          // Mettre à jour la référence des derniers contacts sauvegardés
          lastSavedContactsRef.current = [...contacts];
        }
      } catch (error) {
        console.error("Erreur lors de la sauvegarde dans le dossier Autosave:", error);
        setError(`Erreur d'autosave: ${error instanceof Error ? error.message : String(error)}`);
      } finally {
        setIsSaving(false);
      }
      return;
    }
    
    // Sinon, utilisation de l'API File System Access standard
    if (isSafariDetected) {
      console.warn("Tentative de sauvegarde fichier sur Safari via une méthode non supportée pour l'autosave.");
      setError("Sauvegarde automatique non supportée sur Safari.");
      return;
    }
    
    let handleToUse = currentFileHandle;

    if (!handleToUse) {
      const newHandle = await requestFileHandle();
      if (!newHandle) return;
      handleToUse = newHandle;
    }
    
    if (!handleToUse) {
        setError("Aucun handle de fichier disponible pour l'enregistrement.");
        return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const contacts = dataToSave || await getContactsData();
      
      // Vérifier si le fichier existe déjà et a un contenu
      let existingData = '';
      let existingContacts: Contact[] = [];
      let isNewFile = false;
      
      try {
        // Tenter de lire le fichier existant
        const experimentalHandle = handleToUse as ExperimentalFileHandle;
        if (!experimentalHandle.getFile) {
          throw new Error("L'API getFile n'est pas supportée par ce navigateur");
        }
        const file = await experimentalHandle.getFile();
        existingData = await file.text();
        
        // Analyser les données existantes comme CSV
        if (existingData.trim()) {
          existingContacts = Papa.parse(existingData, { header: true }).data as Contact[];
        }
      } catch (error) {
        console.log('Le fichier est probablement nouveau ou inaccessible:', error);
        isNewFile = true;
      }

      // Si c'est un nouveau fichier ou si on force la sauvegarde, on écrit tout le contenu
      if (isNewFile || forceSave) {
        const csvData = Papa.unparse(contacts);
        const writable = await handleToUse.createWritable({ keepExistingData: false });
        await writable.write({ type: 'write', data: csvData, position: 0 });
        await writable.close();
        lastSavedDataRef.current = csvData;
        console.info('Fichier créé ou remplacé avec succès.');
      } 
      // Sinon, on fait un append uniquement des nouveaux contacts
      else {
        // Identifier les nouveaux contacts en comparant les ID
        const existingIds = new Set(existingContacts.map(c => c.id));
        const newContacts = contacts.filter(c => !existingIds.has(c.id));
        
        if (newContacts.length === 0) {
          console.info('Aucun nouveau contact à ajouter, sauvegarde ignorée.');
          setIsSaving(false);
          return;
        }
        
        // Convertir uniquement les nouveaux contacts en CSV (sans l'en-tête si le fichier existe déjà)
        const csvOptions = { header: existingData.trim() === '' };
        const newContactsCSV = Papa.unparse(newContacts, csvOptions);
        
        // Préparer les données à ajouter (avec ou sans saut de ligne initial)
        const dataToAppend = existingData.trim() ? 
          '\n' + newContactsCSV.split('\n').slice(csvOptions.header ? 1 : 0).join('\n') : 
          newContactsCSV;
        
        // Écrire à la fin du fichier
        const writable = await handleToUse.createWritable({ keepExistingData: true });
        
        if (existingData.trim()) {
          // Si le fichier existe, on se positionne à la fin et on ajoute les nouvelles données
          await writable.seek(existingData.length);
          await writable.write(dataToAppend);
        } else {
          // Si le fichier est vide, on écrit depuis le début
          await writable.write(newContactsCSV);
        }
        
        await writable.close();
        console.info(`${newContacts.length} nouveaux contacts ajoutés avec succès au fichier existant.`);
      }
    } catch (err) {
      if (err instanceof Error) {
        console.error('Erreur lors de l\'écriture dans le fichier:', err);
        setError(`Erreur lors de la sauvegarde du fichier: ${err.message}`);
      } else {
        console.error('Erreur inconnue lors de l\'écriture dans le fichier:', err);
        setError('Erreur inconnue lors de la sauvegarde du fichier.');
      }
    } finally {
      setIsSaving(false);
    }
  }, [getContactsData, requestFileHandle, isSafariDetected, useLocalFileSystem, saveToLocalFileSystem, hasContactsChanged]);

  // Suppression de l'intervalle périodique, on ne sauvegarde que sur changement
  useEffect(() => {
    // Fonction vide - on ne configure plus d'intervalle périodique
    return () => {
      // Fonction de nettoyage vide
    };
  }, [fileHandle, saveFile, isSafariDetected, useLocalFileSystem]);

  const triggerSave = async (data?: Contact[], force = false, showNotification = false) => {
    if (useLocalFileSystem) {
      if (showNotification) {
        toast.info("Démarrage de l'autosauvegarde...", {
          position: "top-right",
          autoClose: 2000,
          hideProgressBar: false,
        });
      }
      await saveFile(null, data, force || !!data);
      if (showNotification) {
        toast.success("Autosauvegarde configurée et activée", {
          position: "top-right",
          autoClose: 3000,
          hideProgressBar: false,
        });
      }
      return;
    }
    
    // Sinon, API File System Access
    if (isSafariDetected || !isFileSystemAccessSupported) {
        setError(isSafariDetected ? "Sauvegarde automatique de fichier non supportée sur Safari." : "L'API File System Access n'est pas supportée par ce navigateur.");
        console.warn("triggerSave appelé alors que File System Access API n'est pas supportée ou Safari détecté.");
        return;
    }
    
    await saveFile(fileHandle, data, force || !!data);
  };

  const downloadFileManually = async () => {
    try {
      const contacts = await getContactsData();
      const csvData = Papa.unparse(contacts);
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement("a");
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", "contacts-backup.csv");
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success("Téléchargement du fichier de contacts démarré.");
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Une erreur inconnue est survenue.';
      toast.error(`Erreur lors du téléchargement manuel: ${errorMessage}`);
      setError(`Erreur lors du téléchargement manuel: ${errorMessage}`); 
    }
  };

  const resetFileHandle = useCallback(() => {
    if (useLocalFileSystem) {
      localStorage.removeItem(AUTOSAVE_ENABLED_KEY);
      lastSavedDataRef.current = null;
      setIsAutoSaveRestored(false);
      
      console.info("Configuration d'autosave réinitialisée.");
      return;
    }
    
    // Réinitialisation pour l'API File System Access
    setFileHandle(null);
    localStorage.removeItem(FILE_HANDLE_KEY);
    localStorage.removeItem(AUTOSAVE_ENABLED_KEY);
    lastSavedDataRef.current = null;
    
    setError(null);
    setIsAutoSaveRestored(false);
    console.info("File handle and autosave state have been reset.");
  }, [useLocalFileSystem]);

  return {
    requestFileHandle,
    triggerSave,
    isSaving,
    error,
    fileHandle,
    isFileSystemAccessSupported,
    downloadFileManually,
    isSafariDetected, 
    resetFileHandle,
    isAutoSaveRestored
  };
}

// Les déclarations globales pour window.showSaveFilePicker sont déplacées plus haut
// pour être groupées avec les autres types File System Access.
 