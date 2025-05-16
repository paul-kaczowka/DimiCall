'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Contact } from '@/types/contact'; // Assurez-vous que ce type est correct
import Papa from 'papaparse';
import { toast } from 'react-toastify';

const FILE_HANDLE_KEY = 'contactsFileHandle';

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

// Déclarations de types globaux pour File System Access API pour TypeScript
// si @types/wicg-file-system-access n'est pas utilisé
declare global {
  interface Window {
    showSaveFilePicker?: (options?: SaveFilePickerOptions) => Promise<FileSystemFileHandle>;
  }
  // Ces types sont souvent déjà présents avec les bonnes versions de TS/librairies DOM
  // mais on les garde pour s'assurer qu'ils sont définis.
  // interface FileSystemFileHandle {
  //   createWritable: (options?: FileSystemWritableFileStreamOptions) => Promise<FileSystemWritableFileStream>;
  // }
  // interface FileSystemWritableFileStream extends WritableStream {
  //   write: (data: FileSystemWriteChunkType) => Promise<void>;
  //   close: () => Promise<void>;
  // }
}

interface SaveFilePickerOptions {
  suggestedName?: string;
  types?: Array<{
    description?: string;
    accept?: Record<string, string | string[]>;
  }>;
  excludeAcceptAllOption?: boolean;
}


export function useAutosaveFile(getContactsData: () => Promise<Contact[]>, autoSaveIntervalMs = 60000) {
  const [fileHandle, setFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSafariDetected, setIsSafariDetected] = useState(false);
  const [isFileSystemAccessSupported, setIsFileSystemAccessSupported] = useState(false);
  const lastSavedDataRef = useRef<string | null>(null);
  const intervalIdRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const safari = isSafari();
    setIsSafariDetected(safari);

    const supported = !!window.showSaveFilePicker;
    setIsFileSystemAccessSupported(supported);

    if (safari) {
      setError("L'API File System Access pour l'autosave n'est pas supportée sur Safari. Un téléchargement manuel sera proposé.");
      console.warn("Safari détecté: l'autosave fichier via File System Access API est désactivé.");
    } else if (!supported) {
      setError("L'API File System Access n'est pas supportée par ce navigateur. Un téléchargement manuel sera proposé.");
      console.warn("File System Access API non supportée.");
    }
    
    if (supported && !safari) {
        const storedHandle = localStorage.getItem(FILE_HANDLE_KEY);
        if (storedHandle) {
            console.info("Un handle de fichier existant a été trouvé (logique de restauration à implémenter si l'on veut réutiliser le handle au lieu de juste savoir qu'on en avait un).");
        }
    }
  }, []);

  const requestFileHandle = useCallback(async () => {
    if (isSafariDetected || !isFileSystemAccessSupported) {
      setError(isSafariDetected ? "Fonctionnalité non supportée sur Safari." : "L'API File System Access n'est pas supportée par ce navigateur.");
      return null;
    }
    if (!window.showSaveFilePicker) {
        console.warn("showSaveFilePicker n'est pas disponible bien que isFileSystemAccessSupported soit vrai. Cela ne devrait pas arriver.");
        setError("L'API File System Access n'est pas disponible (incohérence détectée).");
        return null;
    }
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: 'contacts-autosave.csv',
        types: [
          {
            description: 'Fichier CSV',
            accept: { 'text/csv': ['.csv'] },
          },
        ],
      });
      localStorage.setItem(FILE_HANDLE_KEY, 'true'); 
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
    }
  }, [isSafariDetected, isFileSystemAccessSupported]);

  const saveFile = useCallback(async (currentFileHandle: FileSystemFileHandle | null, dataToSave?: Contact[], forceSave = false) => {
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
      const csvData = Papa.unparse(contacts);

      if (!forceSave && lastSavedDataRef.current === csvData) {
        console.info('Données non modifiées, sauvegarde automatique ignorée.');
        setIsSaving(false);
        return;
      }

      const writable = await handleToUse.createWritable({ keepExistingData: false });
      await writable.write({ type: 'write', data: csvData, position: 0 });
      await writable.close();
      lastSavedDataRef.current = csvData;
      console.info('Fichier sauvegardé avec succès.');
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
  }, [getContactsData, requestFileHandle, isSafariDetected]);

  useEffect(() => {
    if (isSafariDetected || !fileHandle || autoSaveIntervalMs <= 0) {
      if (intervalIdRef.current) clearInterval(intervalIdRef.current);
      return;
    }
    console.log(`Configuration de l'autosave toutes les ${autoSaveIntervalMs / 1000} secondes.`);
    intervalIdRef.current = setInterval(() => {
      console.log("Déclenchement de la sauvegarde automatique par intervalle...");
      saveFile(fileHandle, undefined, false);
    }, autoSaveIntervalMs);

    return () => {
      if (intervalIdRef.current) {
        clearInterval(intervalIdRef.current);
        console.log("Intervalle d'autosave nettoyé.");
      }
    };
  }, [fileHandle, autoSaveIntervalMs, saveFile, isSafariDetected]);

  const triggerSave = async (data?: Contact[], force = false) => {
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
    setFileHandle(null);
    localStorage.removeItem(FILE_HANDLE_KEY);
    lastSavedDataRef.current = null;
    if (intervalIdRef.current) {
      clearInterval(intervalIdRef.current);
      intervalIdRef.current = null;
    }
    setError(null); // Aussi réinitialiser les erreurs liées au fichier
    console.info("File handle and autosave state have been reset.");
  }, []);

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
  };
}

// Les déclarations globales pour window.showSaveFilePicker sont déplacées plus haut
// pour être groupées avec les autres types File System Access.
 